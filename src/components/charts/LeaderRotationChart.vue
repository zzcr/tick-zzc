<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { NextLeaderCandidate } from '@/utils/regimeAndLeader'

const props = withDefaults(
  defineProps<{
    candidates: NextLeaderCandidate[]
    height?: string
  }>(),
  {
    height: '300px'
  }
)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function renderChart() {
  if (!chart || props.candidates.length === 0) return

  const reversed = [...props.candidates].reverse()
  const names = reversed.map((c) => `${c.name}(${c.code})`)

  const option: echarts.EChartsOption = {
    animationDuration: 380,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 }
    },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: '#475569', fontSize: 11 }
    },
    grid: {
      top: 38,
      left: 120,
      right: 34,
      bottom: 22
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: '#64748b', formatter: '{value}分' },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#0f172a', fontWeight: 600, fontSize: 12 }
    },
    series: [
      {
        name: '轮动避高(25)',
        type: 'bar',
        stack: 'score',
        barMaxWidth: 22,
        data: reversed.map((c) => c.scores.antiOverdraft),
        itemStyle: { color: '#2563eb' }
      },
      {
        name: '低位安全(25)',
        type: 'bar',
        stack: 'score',
        data: reversed.map((c) => c.scores.lowPosition),
        itemStyle: { color: '#10b981' }
      },
      {
        name: '市值弹性(20)',
        type: 'bar',
        stack: 'score',
        data: reversed.map((c) => c.scores.elasticity),
        itemStyle: { color: '#f59e0b' }
      },
      {
        name: '资金异动(15)',
        type: 'bar',
        stack: 'score',
        data: reversed.map((c) => c.scores.accumulation),
        itemStyle: { color: '#8b5cf6' }
      },
      {
        name: '季节基因(15)',
        type: 'bar',
        stack: 'score',
        data: reversed.map((c) => c.scores.seasonalDna),
        itemStyle: { color: '#e11d48', borderRadius: [0, 5, 5, 0] },
        label: {
          show: true,
          position: 'right',
          color: '#0f172a',
          fontWeight: 700,
          formatter: (p: unknown) => {
            const idx = (p as { dataIndex: number }).dataIndex
            return `${reversed[idx].totalScore}分`
          }
        }
      }
    ]
  }

  chart.setOption(option, true)
}

onMounted(() => {
  if (!chartEl.value) return
  chart = echarts.init(chartEl.value)
  renderChart()
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartEl.value)
})

watch(() => props.candidates, () => renderChart(), { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="chartEl" :style="{ width: '100%', height }" />
</template>
