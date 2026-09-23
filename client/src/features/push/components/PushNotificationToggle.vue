<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { BellRing } from '@lucide/vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { usePushNotifications } from '../composables/usePushNotifications'

const { t } = useI18n()
const { support, isAppleMobile, permission, subscribed, busy, refresh, enable, disable } = usePushNotifications()

const TOGGLE_ID = 'push-notifications-toggle'

const isBlocked = computed(() => support.value === 'supported' && permission.value === 'denied')
const isDisabled = computed(() => support.value !== 'supported' || isBlocked.value || busy.value)

const statusMessage = computed(() => {
  if (support.value === 'needs-home-screen') return t('notifications.preferences.push.iosInstall')
  if (support.value === 'unsupported') return t('notifications.preferences.push.unsupported')
  if (isBlocked.value) return t('notifications.preferences.push.blocked')
  return null
})

onMounted(() => {
  void refresh()
})

async function handleToggle(next: boolean) {
  const result = next ? await enable() : await disable()
  if (result === 'enabled') toast.success(t('notifications.preferences.push.enabled'))
  else if (result === 'disabled') toast.success(t('notifications.preferences.push.disabled'))
  else if (result === 'denied') toast.error(t('notifications.preferences.push.blocked'))
  else toast.error(t(next ? 'notifications.preferences.push.enableFailed' : 'notifications.preferences.push.disableFailed'))
}
</script>

<template>
  <section aria-labelledby="notification-group-device" class="space-y-2">
    <h2 id="notification-group-device" class="settings-group-label">{{ t('notifications.preferences.push.groupLabel') }}</h2>

    <div class="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <label :for="TOGGLE_ID" class="flex min-h-11 cursor-pointer items-center justify-between gap-4 px-4 py-4 md:px-5 md:py-5">
        <span class="flex min-w-0 max-w-2xl items-start gap-2.5">
          <BellRing :size="16" class="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0">
            <span class="settings-label block">{{ t('notifications.preferences.push.toggle') }}</span>
            <span class="settings-hint block">{{ t('notifications.preferences.push.hint') }}</span>
            <span v-if="isAppleMobile && !statusMessage" class="settings-hint block">{{ t('notifications.preferences.push.iosHint') }}</span>
            <span v-if="statusMessage" role="status" class="settings-hint block text-foreground">{{ statusMessage }}</span>
          </span>
        </span>
        <ToggleSwitch
          :id="TOGGLE_ID"
          :model-value="subscribed"
          :disabled="isDisabled"
          :aria-label="t('notifications.preferences.push.toggle')"
          class="shrink-0"
          @update:model-value="handleToggle"
        />
      </label>
    </div>
  </section>
</template>
