import { FORMAT_TO_GROUP, type Library } from '@bookorbit/types'

type LibraryFormatScope = Pick<Library, 'type' | 'allowedFormats'>

/**
 * Library types do not distinguish audiobooks from ebooks, so this reads each book library's
 * allowed formats instead: an empty list admits every format, audio included.
 */
export function canHoldAudiobooks(libraries: readonly LibraryFormatScope[]): boolean {
  return libraries.some(
    (library) =>
      library.type === 'books' &&
      (library.allowedFormats.length === 0 || library.allowedFormats.some((format) => FORMAT_TO_GROUP[format.trim().toLowerCase()] === 'audio')),
  )
}
