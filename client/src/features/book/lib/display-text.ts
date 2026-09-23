const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
}

const ENTITY_PATTERN = /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g
const MAX_CODE_POINT = 0x10ffff

function decodeNumericEntity(body: string): string | null {
  const isHex = body[1] === 'x' || body[1] === 'X'
  const code = isHex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
  if (!Number.isFinite(code) || code <= 0 || code > MAX_CODE_POINT) return null
  if (code >= 0xd800 && code <= 0xdfff) return null
  return String.fromCodePoint(code)
}

/**
 * Decodes HTML character references left in imported metadata (for example `It&#39;s`) so titles render as text.
 * Runs a single pass, so `&amp;#39;` becomes the literal `&#39;` rather than an apostrophe.
 */
export function decodeHtmlEntities(value: string): string
export function decodeHtmlEntities(value: string | null | undefined): string | null | undefined
export function decodeHtmlEntities(value: string | null | undefined): string | null | undefined {
  if (!value || !value.includes('&')) return value
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith('#')) return decodeNumericEntity(body) ?? match
    return NAMED_ENTITIES[body] ?? match
  })
}
