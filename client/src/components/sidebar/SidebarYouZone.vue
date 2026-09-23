<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import SidebarZone from '@/components/sidebar/SidebarZone.vue'
import SidebarNavItem from '@/components/sidebar/SidebarNavItem.vue'
import SidebarBadge from '@/components/sidebar/SidebarBadge.vue'
import { buildYouEntries } from '@/components/sidebar/you-entries'
import { useAuth } from '@/features/auth/composables/useAuth'
import { useWhatsNew } from '@/features/whats-new/composables/useWhatsNew'

const emit = defineEmits<{ navigate: [] }>()

const { t } = useI18n()
const route = useRoute()
const { user } = useAuth()
const { hasUnseen } = useWhatsNew()

const entries = computed(() =>
  buildYouEntries({
    routeName: typeof route.name === 'string' ? route.name : '',
    achievementsEnabled: user.value?.settings?.achievementPreferences?.enabled !== false,
    hasUnseenWhatsNew: hasUnseen.value,
  }),
)

function handleNavigate() {
  emit('navigate')
}
</script>

<template>
  <SidebarZone :label="t('components.sidebar.zones.you')">
    <SidebarNavItem
      v-for="entry in entries"
      :key="entry.id"
      :is-active="entry.isActive"
      :tooltip="t(entry.labelKey)"
      :to="entry.to"
      :icon="entry.icon"
      :label="t(entry.labelKey)"
      :data-testid="`sidebar-you-${entry.id}`"
      @navigate="handleNavigate"
    >
      <template #badge>
        <SidebarBadge v-if="entry.hasDot" variant="dot" :label="t('components.sidebar.newReleaseNotes')" />
      </template>
    </SidebarNavItem>
  </SidebarZone>
</template>
