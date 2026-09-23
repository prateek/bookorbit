<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronLeft, ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BookDetailTabs from './BookDetailTabs.vue'
import { bookDetailBackFallback } from './book-detail-back-target'
import { useBookNavigation } from '../../composables/useBookNavigation'

const props = defineProps<{ bookId: number }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { bookIds, getNextId, getPrevId, hasContext, currentIndex, total } = useBookNavigation()

const nextId = ref<number | null>(null)
const prevId = ref<number | null>(null)
const index = computed(() => currentIndex(props.bookId))

watch(
  [() => props.bookId, bookIds],
  async ([id]) => {
    prevId.value = getPrevId(id) ?? null
    nextId.value = (await getNextId(id)) ?? null
  },
  { immediate: true },
)

async function navigateToBook(id: number) {
  await router.push({ name: 'book-detail', params: { bookId: id }, query: route.query })
}

function handlePrev() {
  if (prevId.value) void navigateToBook(prevId.value)
}

function handleNext() {
  if (nextId.value) void navigateToBook(nextId.value)
}

function handleBack() {
  // vue-router records the previous in-app location as `back`; it is null on a fresh landing.
  if (router.options.history.state?.back) {
    router.back()
    return
  }
  void router.push(bookDetailBackFallback(props.bookId))
}
</script>

<template>
  <div
    class="flex items-stretch border-b shrink-0 h-11 md:h-9 px-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:px-3"
  >
    <button
      type="button"
      data-test="book-detail-back"
      class="sm:hidden -ml-2 mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
      :aria-label="t('book.detail.header.back')"
      @click="handleBack"
    >
      <ArrowLeft :size="20" />
    </button>

    <BookDetailTabs :book-id="bookId" />

    <div
      v-if="hasContext"
      data-test="book-detail-context-nav"
      class="flex items-center gap-0 sm:gap-1 ml-1 sm:ml-4 border-l pl-1 sm:pl-4 -mr-2 sm:mr-0"
    >
      <span v-if="index !== -1" class="hidden sm:inline text-xs text-muted-foreground mr-2 font-medium tabular-nums">
        {{ index + 1 }} <span class="opacity-50">/</span> {{ total }}
      </span>
      <button
        type="button"
        :disabled="!prevId"
        class="h-11 w-11 sm:h-7 sm:w-7 flex items-center justify-center rounded-md transition-colors"
        :class="prevId ? 'text-foreground hover:bg-muted' : 'text-muted-foreground cursor-not-allowed'"
        :title="t('book.detail.header.previousBook')"
        :aria-label="t('book.detail.header.previousBook')"
        @click="handlePrev"
      >
        <ChevronLeft class="size-5 sm:size-4" />
      </button>
      <button
        type="button"
        :disabled="!nextId"
        class="h-11 w-11 sm:h-7 sm:w-7 flex items-center justify-center rounded-md transition-colors"
        :class="nextId ? 'text-foreground hover:bg-muted' : 'text-muted-foreground cursor-not-allowed'"
        :title="t('book.detail.header.nextBook')"
        :aria-label="t('book.detail.header.nextBook')"
        @click="handleNext"
      >
        <ChevronRight class="size-5 sm:size-4" />
      </button>
    </div>
  </div>
</template>
