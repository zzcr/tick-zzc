<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { MultiCompareResult } from '@/utils/cycleMath'

const props = withDefaults(
  defineProps<{
    result: MultiCompareResult
    height?: string
  }>(),
  {
    height: '440px'
  }
)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function renderChart() {
  if (!chart) return
  if (props.result.dates.length === 0 || props.result.items.length === 0) {
    chart.clear()
    chart.setOption({
      title: {
        text: '请至少选择一只股票或板块进行对比',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 400 }
      }
    })
    return
  }

  const series: echarts.SeriesOption[] = props.result.items.map((item) => {
    const isBenchmark = item.symbol === 'sh000001' || item.symbol === 'sh000300'
    return {
      name: item.name,
      type: 'line',
      data: item.values,
      symbol: 'none',
      smooth: 0.1,
      lineStyle: {
        color: item.color,
        width: isBenchmark ? 1.8 : 2.3,
        type: isBenchmark ? 'dashed' : 'solid'
      },
      itemStyle: { color: item.color }
    }
  })

  const option: echarts.EChartsOption = {
    animationDuration: 350,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : []
        if (list.length === 0) return ''
        const date = list[0].axisValue
        const sorted = [...list]
          .filter((p) => p.value !== null && p.value !== undefined)
          .sort((a, b) => Number(b.value) - Number(a.value))
        const body = sorted
          .map((p) => {
            const v = Number(p.value)
            const c = v > 0 ? '#fb7185' : v < 0 ? '#34d399' : '#cbd5e1'
            return `<div style="display:flex;justify-content:space-between;gap:18px;line-height:1.7;">
              <span>${p.marker}${p.seriesName}</span>
              <span style="font-weight:600;color:${c}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>
            </div>`
          })
          .join('')
        return `<div style="min-width:170px">
          <div style="font-weight:600;margin-bottom:4px;border-bottom:1px solid #334155;padding-bottom:3px;">${date}（区间累计）</div>
          ${body}
        </div>`
      }
    },
    legend: {
      top: 4,
      left: 0,
      type: 'scroll',
      textStyle: { color: '#334155', fontSize: 12 }
    },
    grid: {
      top: 44,
      left: 54,
      right: 24,
      bottom: 54
    },
    xAxis: {
      type: 'category',
      data: props.result.dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
      },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 22,
        bottom: 8,
        borderColor: '#e2e8f0',
        fillerColor: 'rgba(37, 99, 235, 0.12)'
      }
    ],
    series
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

watch(() => props.result, () => renderChart(), { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="chartEl" :style="{ width: '100%', height }" />
</template>
