<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Monitor, Moon, Sun } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ACCENT_ROWS, BACKGROUND_OPTIONS, RADIUS_OPTIONS, useThemeStore } from '@/stores/theme'
import AppearancePreferenceStorage from './AppearancePreferenceStorage.vue'

const { t } = useI18n()
const themeStore = useThemeStore()

const backgroundGroups = computed<{ label: string; ids: string[] }[]>(() => [
  {
    label: t('settings.appearance.theme.backgroundGroups.fundamental'),
    ids: ['none', 'dots', 'cross', 'millimeter'],
  },
  {
    label: t('settings.appearance.theme.backgroundGroups.structural'),
    ids: ['blueprint', 'brushed', 'scanlines', 'vinyl', 'carbon', 'perforated'],
  },
  {
    label: t('settings.appearance.theme.backgroundGroups.ambient'),
    ids: ['aurora', 'horizon', 'glow', 'mesh', 'elevation'],
  },
  {
    label: t('settings.appearance.theme.backgroundGroups.refractive'),
    ids: ['prism', 'spectrum', 'spectrum-x', 'spectrum-plus', 'eclipse'],
  },
])

const selectedAccentLabel = computed(() => {
  const selected = ACCENT_ROWS.flat().find((option) => option.id === themeStore.accent)
  return selected ? t(selected.labelKey) : ''
})

function handleLightTheme() {
  themeStore.setTheme('light')
}

function handleDarkTheme() {
  themeStore.setTheme('dark')
}

function handleSystemTheme() {
  themeStore.setTheme('system')
}

function resetBrightness() {
  themeStore.setBrightness(0)
}

function handleBrightnessInput(event: Event) {
  themeStore.setBrightness(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="space-y-6">
    <AppearancePreferenceStorage />

    <div>
      <p class="settings-group-label">
        {{ t('settings.appearance.theme.title') }}
      </p>
      <div class="settings-card">
        <div class="settings-row">
          <div>
            <p class="settings-label">
              {{ t('settings.appearance.theme.colorScheme.label') }}
            </p>
            <p class="settings-hint">
              {{ t('settings.appearance.theme.colorScheme.hint') }}
            </p>
          </div>
          <div class="flex items-center gap-1 p-1 rounded-lg border border-border bg-muted/50 self-start max-md:self-stretch">
            <button
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:flex-1 pointer-coarse:min-h-11 pointer-coarse:text-sm"
              :class="themeStore.theme === 'light' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="handleLightTheme"
            >
              <Sun :size="12" /> {{ t('settings.appearance.themeMode.light') }}
            </button>
            <button
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:flex-1 pointer-coarse:min-h-11 pointer-coarse:text-sm"
              :class="themeStore.theme === 'dark' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="handleDarkTheme"
            >
              <Moon :size="12" /> {{ t('settings.appearance.themeMode.dark') }}
            </button>
            <button
              class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:flex-1 pointer-coarse:min-h-11 pointer-coarse:text-sm"
              :class="themeStore.theme === 'system' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="handleSystemTheme"
            >
              <Monitor :size="12" />
              {{ t('settings.appearance.themeMode.system') }}
            </button>
          </div>
        </div>

        <div class="px-4 py-3.5 md:px-5 md:py-4 bg-card">
          <div class="mb-0.5 flex items-baseline justify-between gap-3">
            <p class="settings-label">
              {{ t('settings.appearance.theme.accentColor.label') }}
            </p>
            <span class="truncate text-sm text-muted-foreground" data-testid="accent-selected-label">{{ selectedAccentLabel }}</span>
          </div>
          <p class="text-xs text-muted-foreground mb-3">
            {{ t('settings.appearance.theme.accentColor.hint') }}
          </p>
          <!-- Phones wrap every swatch into a grid of 44px cells; wider screens keep the paired rows. -->
          <div class="md:overflow-x-auto md:no-scrollbar md:px-1 md:py-0.5">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] md:block md:w-max md:space-y-2">
              <div v-for="(row, rowIndex) in ACCENT_ROWS" :key="rowIndex" class="contents md:flex md:items-center md:gap-1.5">
                <Tooltip v-for="opt in row" :key="opt.id">
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="group/swatch flex size-11 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-auto"
                      :aria-label="t(opt.labelKey)"
                      :aria-pressed="themeStore.accent === opt.id"
                      data-testid="accent-swatch"
                      @click="themeStore.setAccent(opt.id)"
                    >
                      <span
                        class="block h-7 w-7 rounded-full transition-all group-hover/swatch:scale-110 md:h-5 md:w-5"
                        :class="opt.swatchClass"
                        :style="{
                          backgroundColor: opt.color,
                          outline: themeStore.accent === opt.id ? `2px solid ${opt.color}` : 'none',
                          outlineOffset: '2px',
                          transform: themeStore.accent === opt.id ? 'scale(1.25)' : '',
                        }"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{{ t(opt.labelKey) }}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-row">
          <div>
            <p class="settings-label">
              {{ t('settings.appearance.theme.cornerRadius.label') }}
            </p>
            <p class="settings-hint">
              {{ t('settings.appearance.theme.cornerRadius.hint') }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 self-start">
            <button
              v-for="opt in RADIUS_OPTIONS"
              :key="opt.id"
              class="h-7 px-3 text-xs border-2 transition-colors font-medium pointer-coarse:h-11 pointer-coarse:text-sm"
              :style="{
                borderRadius: opt.id === 'sharp' ? '2px' : opt.id === 'default' ? '6px' : opt.id === 'rounded' ? '14px' : '999px',
              }"
              :class="
                themeStore.radius === opt.id
                  ? 'border-primary text-primary bg-primary/8'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
              "
              @click="themeStore.setRadius(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div v-if="themeStore.resolvedTheme === 'dark'" class="px-4 py-3.5 md:px-5 md:py-4 bg-card">
          <div class="mb-3">
            <div class="flex items-center justify-between gap-3 mb-0.5">
              <p class="settings-label">
                {{ t('settings.appearance.theme.surfaceBrightness.label') }}
              </p>
              <div class="flex items-center gap-2">
                <span class="settings-value md:hidden">{{ themeStore.brightness }}%</span>
                <Button v-if="themeStore.brightness > 0" variant="ghost" size="sm" @click="resetBrightness">
                  {{ t('settings.appearance.theme.surfaceBrightness.reset') }}
                </Button>
              </div>
            </div>
            <p class="settings-hint">
              {{ t('settings.appearance.theme.surfaceBrightness.hint') }}
            </p>
            <div>
              <span class="settings-value hidden md:inline">{{ themeStore.brightness }}%</span>
            </div>
          </div>
          <input
            :value="themeStore.brightness"
            type="range"
            min="0"
            max="100"
            step="5"
            class="w-full accent-primary cursor-pointer"
            @input="handleBrightnessInput"
          />
        </div>
      </div>
    </div>

    <div>
      <p class="settings-group-label">
        {{ t('settings.appearance.theme.libraryBackground.title') }}
      </p>
      <div class="settings-card">
        <div class="px-4 py-3.5 md:px-5 md:py-4 bg-card">
          <div class="mb-3">
            <div>
              <p class="settings-label">
                {{ t('settings.appearance.theme.libraryBackground.pattern.label') }}
              </p>
              <p class="settings-hint">
                {{ t('settings.appearance.theme.libraryBackground.pattern.hint') }}
              </p>
            </div>
          </div>
          <div class="space-y-5 md:space-y-6">
            <div v-for="group in backgroundGroups" :key="group.label">
              <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5 ml-0.5">
                {{ group.label }}
              </p>
              <div class="flex flex-wrap items-start gap-3 px-0.5 pt-0.5 md:gap-4">
                <button
                  v-for="opt in BACKGROUND_OPTIONS.filter((o) => group.ids.includes(o.id))"
                  :key="opt.id"
                  type="button"
                  class="group/pattern flex w-16 flex-col items-center gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-pressed="themeStore.background === opt.id"
                  data-testid="background-option"
                  @click="themeStore.setBackground(opt.id)"
                >
                  <span
                    class="block h-10 w-14 overflow-hidden rounded ring-2 transition-all"
                    :class="
                      themeStore.background === opt.id
                        ? 'ring-primary shadow-xs shadow-primary/20'
                        : 'ring-border group-hover/pattern:ring-muted-foreground/40'
                    "
                  >
                    <span class="block h-full w-full bg-background [transform:translate(0)] pattern-preview" :class="opt.cssClass" />
                  </span>
                  <span
                    class="w-full truncate text-center text-xs"
                    :class="themeStore.background === opt.id ? 'font-medium text-primary' : 'text-muted-foreground'"
                  >
                    {{ opt.label }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
