import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// iOS and Android mask Home Screen icons themselves, so the apple and maskable icons have to be
// full-bleed. The default 0.3 padding on white showed up as a white frame around the tile.
const fullBleed = { padding: 0, resizeOptions: { background: '#232319', fit: 'contain' as const } }

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], ...fullBleed },
    maskable: { sizes: [512], ...fullBleed },
  },
  images: ['public/pwa-icon-source.svg'],
})
