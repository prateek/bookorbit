<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate, formatNumber, formatRelativeFromNow } from '@/i18n/formatters'
import type { AuthorDetail } from '@bookorbit/types'
import { MoreHorizontal, Pencil, RefreshCcw, Trash2, UsersRound, X } from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toDisplayCoverUrl } from '@/features/book/lib/metadata-fetch'
import { isSerialAuthor } from '../lib/author-work'

const props = defineProps<{
  author: AuthorDetail
  imageUrl?: string | null
  previewDescription?: string | null
  previewProvider?: string | null
  loadingPreview?: boolean
  canUpdate?: boolean
  canMerge?: boolean
  canDelete?: boolean
  refreshing?: boolean
}>()

const emit = defineEmits<{
  edit: []
  merge: []
  refresh: []
  delete: []
}>()

const { t } = useI18n()

const initials = computed(() => {
  const parts = props.author.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
})

// Goodreads supplies a full date for most authors and only a year for older
// ones, so fall back to the year rather than showing nothing.
function lifeDateLabel(date: string | null, year: number | null): string | null {
  if (date) {
    const parsed = new Date(date)
    // Birth and death are plain yyyy-MM-dd, which Date parses as UTC midnight.
    // Formatting that in a timezone behind UTC would render the previous day,
    // so read it back in UTC too.
    if (!Number.isNaN(parsed.getTime())) {
      return formatDate(parsed, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    }
  }
  // A year is not a quantity: grouping would render 1929 as "1,929".
  return year !== null ? formatNumber(year, { useGrouping: false }) : null
}

const bornLabel = computed(() => lifeDateLabel(props.author.birthDate, props.author.birthYear))
const diedLabel = computed(() => lifeDateLabel(props.author.deathDate, props.author.deathYear))
const genres = computed(() => props.author.genres ?? [])
const influences = computed(() => props.author.influences ?? [])
const hasFacts = computed(() => !!(bornLabel.value || diedLabel.value || props.author.website || genres.value.length))

const resolvedBio = computed(() => {
  const local = props.author.description?.trim()
  if (local) return local
  return props.previewDescription?.trim() || ''
})

const usesPreviewBio = computed(() => !props.author.description?.trim() && !!props.previewDescription?.trim())

const lastAddedLabel = computed(() => {
  if (!props.author.lastAddedAt) return t('author.header.never')
  const date = new Date(props.author.lastAddedAt)
  if (Number.isNaN(date.getTime())) return t('author.header.never')
  return formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' })
})

const serialAuthor = computed(() => isSerialAuthor(props.author))

const workSummary = computed(() => {
  const { bookCount, seriesCount } = props.author
  if (serialAuthor.value) return t('author.index.serialSummary', { series: seriesCount ?? 0, chapters: bookCount })
  if (seriesCount) return t('author.index.seriesSummary', { series: seriesCount, books: bookCount })
  return t('author.index.bookCount', { count: bookCount })
})

const latestLabel = computed(() => {
  if (!props.author.lastAddedAt) return null
  const date = new Date(props.author.lastAddedAt)
  if (Number.isNaN(date.getTime())) return null
  const when = formatRelativeFromNow(date)
  return serialAuthor.value ? t('author.header.latestChapter', { when }) : t('author.header.latestBook', { when })
})

const subtitle = computed(() => [workSummary.value, latestLabel.value].filter(Boolean).join(' · '))

const previewProviderLabel = computed(() => {
  if (!props.previewProvider) return ''
  if (props.previewProvider === 'audnexus') return 'Audnexus'
  return props.previewProvider
})

const showMenu = computed(() => props.canUpdate || props.canMerge || props.canDelete)

const imageLightboxOpen = ref(false)
const displayImageUrl = computed(() => {
  const display = toDisplayCoverUrl(props.imageUrl)
  return display || null
})
const canOpenImageLightbox = computed(() => Boolean(displayImageUrl.value))
const bioExpanded = ref(false)

watch(resolvedBio, () => {
  bioExpanded.value = false
})

function openImageLightbox() {
  if (canOpenImageLightbox.value) imageLightboxOpen.value = true
}

function closeImageLightbox() {
  imageLightboxOpen.value = false
}

function toggleBio() {
  bioExpanded.value = !bioExpanded.value
}
</script>

<template>
  <!-- On phones the header drops its card: the page opens on the author's work, not on chrome. -->
  <section class="shrink-0 sm:overflow-hidden sm:rounded-lg sm:border sm:border-border/70 sm:bg-card/80">
    <div class="px-1 py-1 sm:bg-gradient-to-b sm:from-primary/8 sm:via-background/0 sm:to-transparent sm:p-4">
      <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 sm:gap-x-4" :class="displayImageUrl ? 'items-start' : 'items-center'">
        <button
          v-if="displayImageUrl"
          type="button"
          class="h-28 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/70 bg-muted/40 shadow-sm sm:row-span-2 sm:h-44 sm:w-32"
          :aria-label="t('author.header.portraitAlt', { name: author.name })"
          @click="openImageLightbox"
        >
          <img :src="displayImageUrl" :alt="t('author.header.portraitAlt', { name: author.name })" class="h-full w-full object-cover" />
        </button>
        <div
          v-else
          data-testid="author-monogram"
          class="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xl font-semibold text-primary"
          aria-hidden="true"
        >
          {{ initials }}
        </div>

        <div class="flex min-w-0 items-start justify-between gap-2">
          <div class="min-w-0">
            <h1 class="line-clamp-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{{ author.name }}</h1>
            <p v-if="author.sortName && author.sortName !== author.name" class="hidden text-sm text-muted-foreground sm:block">
              {{ author.sortName }}
            </p>
            <p data-testid="author-subtitle" class="mt-0.5 text-[15px] text-muted-foreground sm:text-sm">{{ subtitle }}</p>
          </div>

          <DropdownMenu v-if="showMenu">
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="-mr-1 inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:mr-0 sm:mt-0.5 sm:h-8 sm:w-auto sm:rounded-md sm:bg-muted sm:px-2.5 sm:text-sm sm:font-medium sm:text-foreground sm:hover:bg-muted/70"
                :aria-label="t('author.header.actionsFor', { name: author.name })"
              >
                <MoreHorizontal :size="18" class="sm:size-3.5" />
                <span class="hidden sm:inline">{{ t('author.header.actions') }}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem v-if="canUpdate" @click="emit('edit')">
                <Pencil class="mr-2 h-4 w-4" />
                {{ t('author.header.editAuthor') }}
              </DropdownMenuItem>
              <DropdownMenuItem v-if="canMerge" @click="emit('merge')">
                <UsersRound class="mr-2 h-4 w-4" />
                {{ t('author.header.mergeAuthors') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="canUpdate" />
              <DropdownMenuItem v-if="canUpdate" :disabled="refreshing" @click="emit('refresh')">
                <RefreshCcw class="mr-2 h-4 w-4" :class="refreshing ? 'animate-spin' : ''" />
                {{ refreshing ? t('author.header.refreshing') : t('author.header.refreshMetadata') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="canDelete && (canUpdate || canMerge)" />
              <DropdownMenuItem v-if="canDelete" class="text-destructive focus:text-destructive" @click="emit('delete')">
                <Trash2 class="mr-2 h-4 w-4" />
                {{ t('author.header.deleteAuthor') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div class="col-span-2 min-w-0 empty:hidden sm:col-span-1 sm:col-start-2">
          <template v-if="resolvedBio">
            <p
              :class="
                bioExpanded
                  ? 'text-[15px] leading-6 text-foreground sm:text-sm'
                  : 'text-[15px] leading-6 text-foreground overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:4] sm:[-webkit-line-clamp:5] [-webkit-box-orient:vertical] sm:text-sm'
              "
            >
              {{ resolvedBio }}
            </p>
            <button class="touch-target mt-1 text-xs font-medium text-primary transition-colors hover:text-primary" @click="toggleBio">
              {{ bioExpanded ? t('author.header.showLess') : t('author.header.showMore') }}
            </button>
            <p v-if="usesPreviewBio && previewProviderLabel" class="mt-1.5 text-xs text-muted-foreground">
              {{ t('author.header.previewFrom', { provider: previewProviderLabel }) }}
            </p>
          </template>
          <template v-else-if="canUpdate">
            <p v-if="loadingPreview" class="text-sm text-muted-foreground">{{ t('author.header.lookingUpMetadata') }}</p>
            <p v-else data-testid="author-no-bio" class="text-xs text-muted-foreground">{{ t('author.header.noBiographyLabel') }}</p>
          </template>

          <dl v-if="hasFacts" class="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm sm:mt-4">
            <div v-if="bornLabel" class="flex gap-1.5">
              <dt class="text-muted-foreground">{{ t('author.header.born') }}</dt>
              <dd class="text-foreground">{{ bornLabel }}</dd>
            </div>
            <div v-if="diedLabel" class="flex gap-1.5">
              <dt class="text-muted-foreground">{{ t('author.header.died') }}</dt>
              <dd class="text-foreground">{{ diedLabel }}</dd>
            </div>
            <div v-if="author.website" class="flex gap-1.5 min-w-0">
              <dt class="text-muted-foreground">{{ t('author.header.website') }}</dt>
              <dd class="min-w-0 truncate">
                <a :href="author.website" target="_blank" rel="noopener noreferrer" class="text-foreground underline underline-offset-2">
                  {{ author.website }}
                </a>
              </dd>
            </div>
            <div v-if="genres.length" class="flex gap-1.5 min-w-0">
              <dt class="text-muted-foreground">{{ t('author.header.genres') }}</dt>
              <dd class="min-w-0 text-foreground">{{ genres.join(', ') }}</dd>
            </div>
            <div v-if="influences.length" class="flex gap-1.5 min-w-0">
              <dt class="text-muted-foreground">{{ t('author.header.influences') }}</dt>
              <dd class="min-w-0 text-foreground">{{ influences.join(', ') }}</dd>
            </div>
          </dl>

          <!-- The subtitle already carries both numbers; the tiles only earn their space on wider screens. -->
          <div data-testid="author-stat-tiles" class="mt-4 hidden gap-3 sm:flex">
            <div class="rounded-lg border border-border/70 bg-background/40 px-4 py-2.5">
              <p class="text-base font-semibold text-foreground">{{ formatNumber(author.bookCount) }}</p>
              <p class="text-xs text-muted-foreground">{{ t('author.header.booksLabel') }}</p>
            </div>
            <div class="rounded-lg border border-border/70 bg-background/40 px-4 py-2.5">
              <p class="text-base font-semibold text-foreground">{{ lastAddedLabel }}</p>
              <p class="text-xs text-muted-foreground">{{ t('author.header.lastAdded') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="imageLightboxOpen && displayImageUrl"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      @click="closeImageLightbox"
    >
      <button class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20" @click="closeImageLightbox">
        <X class="size-5" />
      </button>
      <img
        :src="displayImageUrl"
        :alt="`${author.name} portrait`"
        class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        @click.stop
      />
    </div>
  </Teleport>
</template>
