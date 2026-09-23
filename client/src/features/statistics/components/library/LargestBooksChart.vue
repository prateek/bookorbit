<script setup lang="ts">
import { shallowRef, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import VChart from 'vue-echarts'
import { HardDrive } from '@lucide/vue'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

import { formatBytes } from '@/lib/formatting'
import { getFormatColor } from '@/features/book/lib/format-colors'
import { useLargestBooks } from '../../composables/useLargestBooks'
import ChartCard from '../ChartCard.vue'

const { t } = useI18n()

const router = useRouter()
const { md } = useBreakpoints(breakpointsTailwind)
const { data, loading, error } = useLargestBooks()
const option = shallowRef({})
let sortedIds: number[] = []

function handleBarClick(params: { dataIndex?: number }) {
  const id = params.dataIndex == null ? undefined : sortedIds[params.dataIndex]
  if (id != null) void router.push({ name: 'book-detail', params: { bookId: id } })
}

watchEffect(() => {
  if (!data.value.items.length) return

  // Sort by size ascending for horizontal bar chart (top is largest)
  const sortedItems = [...data.value.items].sort((a, b) => a.sizeBytes - b.sizeBytes)
  sortedIds = sortedItems.map((item) => item.id)

  option.value = {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      textStyle: { fontSize: 12 },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0]
        if (!p) return ''
        return `${p.name}: <strong>${formatBytes(p.value)}</strong>`
      },
    },
    grid: { left: '3%', right: '10%', bottom: '5%', top: '3%', containLabel: true },
    dataZoom: [
      {
        type: 'inside',
        yAxisIndex: 0,
        startValue: Math.max(0, sortedItems.length - 10),
        endValue: sortedItems.length - 1,
        zoomOnMouseWheel: false,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
      },
      {
        type: 'slider',
        yAxisIndex: 0,
        right: '2%',
        width: 15,
        borderColor: 'transparent',
        fillerColor: 'rgba(150, 150, 150, 0.2)',
        handleSize: 0,
        showDetail: false,
        brushSelect: false,
      },
    ],
    xAxis: {
      type: 'value',
      splitNumber: 2,
      axisLabel: {
        fontSize: 11,
        hideOverlap: true,
        formatter: (v: number) => (v === 0 ? '0' : formatBytes(v)),
      },
    },
    yAxis: {
      type: 'category',
      data: sortedItems.map((d) => d.title),
      axisTick: { show: false },
      axisLabel: {
        fontSize: 11,
        width: md.value ? 200 : 120,
        overflow: 'truncate',
      },
    },
    series: [
      {
        type: 'bar',
        data: sortedItems.map((d) => d.sizeBytes),
        itemStyle: {
          borderRadius: [0, 3, 3, 0],
          color: (params: { dataIndex: number }) => getFormatColor(sortedItems[params.dataIndex]?.format),
        },
        barCategoryGap: '20%',
        barMaxWidth: 32,
        cursor: 'pointer',
      },
    ],
  }
})
</script>

<template>
  <ChartCard :title="t('statistics.charts.largestBooks.title')" :icon="HardDrive" :color-index="2" :loading :error :empty="!data.items.length">
    <VChart :option autoresize style="height: 100%" @click="handleBarClick" />
  </ChartCard>
</template>
