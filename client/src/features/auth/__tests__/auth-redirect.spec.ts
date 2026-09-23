import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { captureRedirectTarget, loginLocation, sanitizeRedirect } from '../lib/auth-redirect'

const Empty = { render: () => null }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Empty },
      { path: '/read/:bookId/:fileId', component: Empty },
      { path: '/login', component: Empty, meta: { public: true } },
    ],
  })
}

describe('sanitizeRedirect', () => {
  it('keeps in-app paths with their query', () => {
    expect(sanitizeRedirect('/read/1159/1159?format=epub')).toBe('/read/1159/1159?format=epub')
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'read/1', '/login?redirect=/x', '/magic?token=abc'])('drops %s', (value) => {
    expect(sanitizeRedirect(value)).toBeNull()
  })

  it('reads the first value of a repeated query parameter', () => {
    expect(sanitizeRedirect(['/series/4', '/other'])).toBe('/series/4')
    expect(sanitizeRedirect(undefined)).toBeNull()
  })
})

describe('captureRedirectTarget', () => {
  it('reads the opened URL before the router has navigated', () => {
    const router = makeRouter()
    router.options.history.replace('/read/1159/1159?format=epub')

    expect(captureRedirectTarget(router)).toBe('/read/1159/1159?format=epub')
  })

  it('uses the current route once navigation has happened', async () => {
    const router = makeRouter()
    await router.push('/read/7/8')

    expect(captureRedirectTarget(router)).toBe('/read/7/8')
  })

  it('carries an existing redirect forward from the login page', async () => {
    const router = makeRouter()
    await router.push({ path: '/login', query: { redirect: '/read/7/8' } })

    expect(captureRedirectTarget(router)).toBe('/read/7/8')
  })

  it('has nothing to restore on the home page', async () => {
    const router = makeRouter()
    await router.push('/')

    expect(captureRedirectTarget(router)).toBeNull()
  })
})

describe('loginLocation', () => {
  it('only adds a redirect query when there is somewhere to return to', () => {
    expect(loginLocation('/read/7/8')).toEqual({ path: '/login', query: { redirect: '/read/7/8' } })
    expect(loginLocation(null)).toEqual({ path: '/login' })
  })
})
