import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities } from './display-text'

describe('decodeHtmlEntities', () => {
  it('decodes decimal and hex numeric references', () => {
    expect(decodeHtmlEntities('It&#39;s Hard to Break a Slug&#39;s Back')).toBe("It's Hard to Break a Slug's Back")
    expect(decodeHtmlEntities('Rock &#x26; Roll')).toBe('Rock & Roll')
  })

  it('decodes common named references', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry &quot;Live&quot;')).toBe('Tom & Jerry "Live"')
  })

  it('decodes in a single pass', () => {
    expect(decodeHtmlEntities('&amp;#39;')).toBe('&#39;')
  })

  it('leaves unknown or invalid references untouched', () => {
    expect(decodeHtmlEntities('A &bogus; B')).toBe('A &bogus; B')
    expect(decodeHtmlEntities('&#0; &#xD800; &#99999999;')).toBe('&#0; &#xD800; &#99999999;')
    expect(decodeHtmlEntities('Fish & Chips')).toBe('Fish & Chips')
  })

  it('never produces markup-bearing output beyond the decoded characters', () => {
    expect(decodeHtmlEntities('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>')
  })

  it('passes through nullish values', () => {
    expect(decodeHtmlEntities(null)).toBeNull()
    expect(decodeHtmlEntities(undefined)).toBeUndefined()
    expect(decodeHtmlEntities('')).toBe('')
  })
})
