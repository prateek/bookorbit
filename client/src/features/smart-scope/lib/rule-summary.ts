import type { GroupRule, Rule } from '@bookorbit/types'

export function countFilterRules(node: GroupRule | Rule | null | undefined): number {
  if (!node) return 0
  if (node.type !== 'group') return 1
  return node.rules.reduce((total, child) => total + countFilterRules(child), 0)
}
