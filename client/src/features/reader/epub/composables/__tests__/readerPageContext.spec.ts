// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readerChromeThemeStyle } from '../readerPageContext'

describe('readerChromeThemeStyle', () => {
  it('takes the accent from the page theme, not the app theme', () => {
    const style = readerChromeThemeStyle({ fg: '#ffd595', bg: '#342e25', link: '#48d1cc' })

    expect(style['--primary']).toBe('#48d1cc')
    expect(style['--primary-foreground']).toBe('#342e25')
    expect(style['--background']).toBe('#342e25')
  })

  it('leaves the app theme in place without a page theme', () => {
    expect(readerChromeThemeStyle(null)).toEqual({})
  })
})
