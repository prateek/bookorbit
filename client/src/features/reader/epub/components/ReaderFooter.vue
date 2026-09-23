<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, ChevronsUpDown } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { readerChromeThemeStyle, useReaderPageContext } from '../composables/readerPageContext'

const { t } = useI18n()

const props = defineProps<{
  fraction: number
  sectionIndex: number
  totalSections: number
  sectionFractions: number[]
  chapterStartFraction: number
  chapterEndFraction: number
  locationTotal: number
  navigationLocked?: boolean
}>()

const emit = defineEmits<{
  prevSection: []
  nextSection: []
  seek: [fraction: number]
}>()

const pageContext = useReaderPageContext()
const chromeStyle = computed(() => readerChromeThemeStyle(pageContext?.mode.value))
const showScrollProgress = computed(() => pageContext?.flow.value === 'scrolled')
const progressPercent = computed(() => Math.round(Math.min(Math.max(props.fraction, 0), 1) * 1000) / 10)
const scrollProgressStyle = computed(() => ({
  width: `${progressPercent.value}%`,
  background: pageContext ? `color-mix(in srgb, ${pageContext.mode.value.fg} 45%, transparent)` : 'var(--primary)',
}))

const showGoToInput = ref(false)
const goToValue = ref('')
const goToInputRef = ref<HTMLInputElement | null>(null)

function onSeek(e: Event) {
  if (props.navigationLocked) return
  const input = e.target as HTMLInputElement
  emit('seek', Number(input.value))
}

function handlePercentageClick() {
  if (props.navigationLocked) return
  showGoToInput.value = true
  goToValue.value = ''
  // Focus as soon as the input renders so the focus stays tied to the tap; iOS only raises the keyboard for that.
  void nextTick(() => goToInputRef.value?.focus())
}

function handleGoToSubmit() {
  if (props.navigationLocked) {
    showGoToInput.value = false
    return
  }
  const raw = goToValue.value.trim()
  if (!raw) {
    showGoToInput.value = false
    return
  }

  if (raw.toLowerCase().startsWith('p') && props.locationTotal > 0) {
    const page = parseInt(raw.slice(1), 10)
    if (!isNaN(page) && page >= 1 && page <= props.locationTotal) {
      emit('seek', (page - 1) / props.locationTotal)
    }
  } else {
    const pct = parseFloat(raw)
    if (!isNaN(pct) && pct >= 0 && pct <= 100) {
      emit('seek', pct / 100)
    }
  }

  showGoToInput.value = false
}

function handleGoToKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    showGoToInput.value = false
  }
}

function handleGoToBlur() {
  showGoToInput.value = false
}

watch(
  () => props.navigationLocked,
  (locked) => {
    if (locked) showGoToInput.value = false
  },
)
</script>

<template>
  <footer
    data-reader-chrome
    class="reader-bar fixed bottom-0 left-0 right-0 z-50 flex h-[calc(2.75rem+env(safe-area-inset-bottom))] items-center gap-1 border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] text-foreground backdrop-blur-md sm:gap-3 sm:px-4"
    :style="chromeStyle"
  >
    <Teleport to="body">
      <div
        v-if="showScrollProgress"
        class="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-0.5"
        data-testid="scroll-progress"
        role="progressbar"
        :aria-valuenow="progressPercent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="t('reader.footer.progress')"
      >
        <div class="h-full" :style="scrollProgressStyle" />
      </div>
    </Teleport>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          :aria-label="t('reader.footer.previousSection')"
          class="viewer-btn"
          :disabled="sectionIndex === 0 || !!props.navigationLocked"
          @click="emit('prevSection')"
        >
          <ChevronLeft :size="18" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{{ t('reader.footer.previousSection') }}</TooltipContent>
    </Tooltip>

    <div class="relative flex h-11 flex-1 items-center">
      <!-- Chapter highlight segment -->
      <div
        v-if="chapterStartFraction < chapterEndFraction"
        class="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full pointer-events-none"
        :style="{
          left: `${chapterStartFraction * 100}%`,
          width: `${(chapterEndFraction - chapterStartFraction) * 100}%`,
          background: 'color-mix(in oklch, var(--primary) 25%, transparent)',
        }"
      />

      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        :value="fraction"
        :disabled="!!props.navigationLocked"
        :aria-label="t('reader.footer.progress')"
        @input="onSeek"
        class="reader-progress-range relative z-10 h-full w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        :style="{ '--reader-progress-fill': `${fraction * 100}%` }"
      />
      <template v-for="(sf, idx) in sectionFractions" :key="idx">
        <div
          v-if="sf > 0 && sf < 1"
          class="absolute top-1/2 -translate-y-1/2 w-px h-3 pointer-events-none z-10"
          :style="{ left: `${sf * 100}%`, background: 'var(--muted-foreground)' }"
        />
      </template>
    </div>

    <template v-if="showGoToInput">
      <input
        ref="goToInputRef"
        v-model="goToValue"
        type="text"
        inputmode="decimal"
        enterkeyhint="go"
        :aria-label="t('reader.footer.jumpToLocation')"
        :placeholder="t('reader.footer.goToPlaceholder')"
        class="h-9 w-24 rounded border border-border bg-muted px-2 py-1 text-center text-base tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary sm:h-8 sm:text-sm"
        @keydown.enter="handleGoToSubmit"
        @keydown="handleGoToKeydown"
        @blur="handleGoToBlur"
      />
    </template>
    <template v-else>
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            :aria-label="t('reader.footer.jumpToLocation')"
            :disabled="!!props.navigationLocked"
            class="h-11 px-2 sm:h-8 rounded-md border border-transparent hover:border-border text-xs tabular-nums shrink-0 min-w-18 text-center text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-transparent disabled:hover:text-muted-foreground"
            @click="handlePercentageClick"
          >
            <span class="text-[11px] uppercase tracking-wide">{{ t('reader.footer.go') }}</span>
            <span>{{ Math.round(fraction * 100) }}%</span>
            <ChevronsUpDown :size="12" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('reader.footer.jumpTooltip') }}</TooltipContent>
      </Tooltip>
    </template>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          :aria-label="t('reader.footer.nextSection')"
          class="viewer-btn"
          :disabled="(totalSections > 0 && sectionIndex >= totalSections - 1) || !!props.navigationLocked"
          @click="emit('nextSection')"
        >
          <ChevronRight :size="18" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{{ t('reader.footer.nextSection') }}</TooltipContent>
    </Tooltip>
  </footer>
</template>

<style scoped>
@media (pointer: coarse) {
  .reader-bar :deep(.viewer-btn) {
    width: 2.75rem;
    height: 2.75rem;
  }
}

.reader-progress-range {
  appearance: none;
  background: transparent;
}

.reader-progress-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(to right, var(--primary) var(--reader-progress-fill), var(--border) var(--reader-progress-fill));
}

.reader-progress-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: var(--border);
}

.reader-progress-range::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: var(--primary);
}

.reader-progress-range::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -6px;
  border: 2px solid var(--background);
  border-radius: 999px;
  background: var(--primary);
}

.reader-progress-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 2px solid var(--background);
  border-radius: 999px;
  background: var(--primary);
}

@media (pointer: coarse) {
  .reader-progress-range::-webkit-slider-thumb {
    width: 28px;
    height: 28px;
    margin-top: -12px;
  }

  .reader-progress-range::-moz-range-thumb {
    width: 28px;
    height: 28px;
  }
}
</style>
