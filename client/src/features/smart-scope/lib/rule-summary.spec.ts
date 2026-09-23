import { describe, expect, it } from 'vitest'
import type { GroupRule } from '@bookorbit/types'
import { countFilterRules } from './rule-summary'

describe('countFilterRules', () => {
  it('counts leaf rules across nested groups', () => {
    const filter = {
      type: 'group',
      join: 'AND',
      rules: [
        { type: 'rule', field: 'title', operator: 'contains', value: 'a' },
        {
          type: 'group',
          join: 'OR',
          rules: [
            { type: 'rule', field: 'author', operator: 'contains', value: 'b' },
            { type: 'rule', field: 'series', operator: 'contains', value: 'c' },
          ],
        },
      ],
    } as unknown as GroupRule

    expect(countFilterRules(filter)).toBe(3)
  })

  it('returns zero for a missing or empty filter', () => {
    expect(countFilterRules(undefined)).toBe(0)
    expect(countFilterRules({ type: 'group', join: 'AND', rules: [] })).toBe(0)
  })
})
