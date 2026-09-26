import { inject, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { ThemeMode } from '../constants/themes'

export interface ReaderPageContext {
  mode: ComputedRef<ThemeMode>
  flow: Ref<'paginated' | 'scrolled'>
}

export const READER_PAGE_CONTEXT: InjectionKey<ReaderPageContext> = Symbol('readerPageContext')

export function useReaderPageContext(): ReaderPageContext | null {
  return inject(READER_PAGE_CONTEXT, null)
}

/**
 * Rebinds the app theme tokens on the reader bars so every token-based utility inside them
 * follows the page colors instead of the app theme. Relies on the Tailwind bridge using
 * `@theme inline`, which resolves utilities against these variables at the element.
 */
export function readerChromeThemeStyle(mode: ThemeMode | null | undefined): Record<string, string> {
  if (!mode) return {}
  return {
    '--background': mode.bg,
    '--foreground': mode.fg,
    '--muted': `color-mix(in srgb, ${mode.fg} 10%, ${mode.bg})`,
    '--muted-foreground': `color-mix(in srgb, ${mode.fg} 68%, ${mode.bg})`,
    '--border': `color-mix(in srgb, ${mode.fg} 16%, ${mode.bg})`,
    '--accent': `color-mix(in srgb, ${mode.fg} 10%, ${mode.bg})`,
    // The theme's link color is already chosen to stand out on its page, so it serves as the accent.
    '--primary': mode.link,
    '--primary-foreground': mode.bg,
    color: mode.fg,
  }
}
