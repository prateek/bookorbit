import { fileURLToPath, URL } from 'node:url'
import { Agent } from 'node:http'
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiAgent = new Agent({ keepAlive: true })
/** Lets a second dev client point at a throwaway API instance, so restart testing leaves the main stack alone. */
const apiTarget = process.env.BOOKORBIT_API_TARGET ?? 'http://localhost:6262'
const offlineShellUrl = '__bookorbit_offline_shell'

/** The engine files a downloaded EPUB needs offline, so the app can cache them when a download finishes. */
const publicDir = fileURLToPath(new URL('./public', import.meta.url))
const foliateAssets = readdirSync(join(publicDir, 'assets/foliate'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => `/${relative(publicDir, join(entry.parentPath, entry.name)).split(sep).join('/')}`)
  .sort()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __INTLIFY_PROD_DEVTOOLS__: false,
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __FOLIATE_ASSETS__: JSON.stringify(foliateAssets),
  },
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.ico',
        'pwa-icon-source.svg',
        'apple-touch-icon-180x180.png',
        'pwa-64x64.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        id: '/',
        name: 'BookOrbit',
        short_name: 'BookOrbit',
        description: 'Your personal book library and reading space',
        theme_color: '#1e1e18',
        background_color: '#fafaf8',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            url: '/dashboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Libraries',
            short_name: 'Libraries',
            url: '/libraries',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Downloads',
            short_name: 'Downloads',
            url: '/downloads',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Settings',
            short_name: 'Settings',
            url: '/settings',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Foliate ships under stable, unhashed URLs, and precaching them once served a stale engine
        // on Firefox (#575). Network-first keeps updates immediate and still reads EPUBs offline.
        globIgnores: ['**/assets/foliate/**'],
        importScripts: ['push-sw.js'],
        // Keep the offline shell at a separate path. Workbox maps '/' and its query variants to
        // precached index.html before the NetworkFirst route can contact the auth proxy.
        manifestTransforms: [
          (entries) => ({
            manifest: entries.map((entry) => (entry.url === 'index.html' ? { ...entry, url: offlineShellUrl } : entry)),
          }),
        ],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Page loads must hit the network first: an edge auth proxy (e.g. Cloudflare Access) needs to
            // see every navigation to redirect an expired session to its login page. Serving the precached
            // shell unconditionally (the old `navigateFallback` behavior) hid the request from the proxy
            // entirely and left the app stuck logged out with no way back in short of clearing site data.
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              plugins: [
                {
                  // A gateway answering 502 to 504 for a server that is restarting or down is not a page
                  // to launch into. Treating it as a failed fetch lets the precached shell take over, so
                  // an installed app starts offline as it does with no network at all. An auth proxy's
                  // redirect arrives as an opaque response with status 0 and still reaches the browser.
                  fetchDidSucceed: async ({ response }) => {
                    if (response.status >= 500) throw new Error(`upstream answered ${response.status}`)
                    return response
                  },
                },
              ],
              // No networkTimeoutSeconds: a slow proxy redirect must win over the cached page.
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              precacheFallback: {
                fallbackURL: offlineShellUrl,
              },
              // Status 0 here would include an auth proxy's opaqueredirect and cache it as the page.
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/foliate/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'foliate-engine',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 60,
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            // The PDF engine's WebAssembly is too large to precache and has a hashed name, so the
            // first copy fetched stays valid until a new build names a new one.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'reader-wasm',
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^.*\/api\/v1\/books\/\d+\/cover\?(?:[^#]*&)?t=[^#]*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-covers',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^.*\/api\/v1\/books\/\d+\/thumbnail\?(?:[^#]*&)?t=[^#]*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'book-thumbnails',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^.*\/api\/v1\/books\/\d+\/cover(\?.*)?$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'book-covers',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^.*\/api\/v1\/books\/\d+\/thumbnail(\?.*)?$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'book-thumbnails',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    dedupe: ['vue'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@bookorbit/types': fileURLToPath(new URL('../packages/types/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['@tanstack/vue-virtual'],
    exclude: ['@embedpdf/core', '@embedpdf/core/vue'],
  },
  server: {
    port: 6263,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        agent: apiAgent,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.host) proxyReq.setHeader('x-forwarded-host', req.headers.host)
            const localPort = (req.socket as { localPort?: number })?.localPort
            if (localPort) proxyReq.setHeader('x-forwarded-port', String(localPort))
            proxyReq.setHeader('x-forwarded-proto', 'http')
          })
        },
      },
      '/socket.io': {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
