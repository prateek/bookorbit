<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { normalizeBookDetailTab, type BookDetailTab } from '@/features/book/lib/book-detail-tabs'
import { usePermissions } from '@/features/auth/composables/usePermissions'

const props = defineProps<{ bookId: number }>()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { hasPermission } = usePermissions()

const activeTab = computed(() => normalizeBookDetailTab(route.query.tab))
const scrollEl = ref<HTMLElement | null>(null)
const moreToRight = ref(false)

// Reading tabs first: on a phone the strip scrolls, and the librarian tabs are the ones a reader
// can do without seeing at a glance.
const tabs = computed<{ label: string; tab: BookDetailTab }[]>(() => {
  const result: { label: string; tab: BookDetailTab }[] = [
    { label: t('book.detail.tabs.details'), tab: 'details' },
    { label: t('book.detail.tabs.readingLog'), tab: 'reading-log' },
    { label: t('book.detail.tabs.highlights'), tab: 'highlights' },
    { label: t('book.detail.tabs.files'), tab: 'files' },
  ]
  if (hasPermission('library_edit_metadata')) {
    result.push({ label: t('book.detail.tabs.editMetadata'), tab: 'edit' })
  }
  return result
})

// Replace, not push: the tab is page state, so Back should leave the book rather than step
// through every tab the reader looked at.
function navigate(tab: BookDetailTab) {
  void router.replace({ name: 'book-detail', params: { bookId: props.bookId }, query: { tab } })
}

function updateOverflow() {
  const el = scrollEl.value
  moreToRight.value = el != null && el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function revealActiveTab() {
  const el = scrollEl.value
  const active = el?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!el || !active) {
    updateOverflow()
    return
  }
  const left = active.offsetLeft - el.offsetLeft
  if (left < el.scrollLeft) el.scrollLeft = left
  else if (left + active.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left + active.offsetWidth - el.clientWidth
  updateOverflow()
}

onMounted(revealActiveTab)
watch(activeTab, () => void nextTick(revealActiveTab))
</script>

<template>
  <div
    ref="scrollEl"
    data-test="book-detail-tabs"
    class="flex items-stretch gap-0 overflow-x-auto scrollbar-none flex-1 min-w-0"
    :class="moreToRight ? '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]' : ''"
    @scroll.passive="updateOverflow"
  >
    <button
      v-for="tabItem in tabs"
      :key="tabItem.tab"
      type="button"
      class="px-3.5 sm:px-3 h-full text-[15px] sm:text-sm font-semibold sm:font-medium border-b-2 transition-colors whitespace-nowrap"
      :class="activeTab === tabItem.tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
      :aria-current="activeTab === tabItem.tab ? 'page' : undefined"
      @click="navigate(tabItem.tab)"
    >
      {{ tabItem.label }}
    </button>
  </div>
</template>
