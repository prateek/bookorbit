import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Library } from '@bookorbit/types'
import LibraryCapabilityStrip from '../components/LibraryCapabilityStrip.vue'

function library(overrides: Partial<Library>): Library {
  return {
    watch: true,
    autoScanCronExpression: null,
    fileWriteEnabled: false,
    fileRenameEnabled: false,
    ...overrides,
  } as Library
}

describe('LibraryCapabilityStrip', () => {
  it('spells out each capability and its state instead of relying on a hover tooltip', () => {
    const wrapper = mount(LibraryCapabilityStrip, { props: { library: library({}) } })
    const items = wrapper.findAll('[data-testid="library-capability"]')

    expect(items.map((item) => item.text())).toEqual(['Watch folders: on', 'Scheduled scan: off', 'Write to file: off', 'Rename files: off'])
    expect(items.every((item) => item.attributes('title') === undefined)).toBe(true)
  })

  it('dims capabilities that are off', () => {
    const wrapper = mount(LibraryCapabilityStrip, { props: { library: library({ watch: false }) } })
    expect(wrapper.get('[data-testid="library-capability"]').classes()).toContain('text-muted-foreground')
  })
})
