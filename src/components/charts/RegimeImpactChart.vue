<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { MarketRegimeType, SectorRegimeImpact } from '@/utils/regimeAndLeader'

const props = withDefaults(
  defineProps<{
    impacts: SectorRegimeImpact[]
    metric?: 'avgMaxGain' | 'avgAlpha'
    currentRegime: MarketRegimeType
    height?: string
  }>(),
  {
    metric: 'avgMaxGain',
    height: '360px'
  }
)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function renderChart() {
  if (!chart || props.impacts.length === 0) return

  const names = props.impacts.map((i) => i.sector.name)
  const bullData = props.impacts.map((i) => i.stats.bull[props.metric])
  const sidewaysData = props.impacts.map((i) => i.stats.sideways[props.metric])
  const bearData = props.impacts.map((i) => i.stats.bear[props.metric])

  const isAlpha = props.metric === 'avgAlpha'

  const option: echarts.EChartsOption = {
    animationDuration: 400,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : []
        if (list.length === 0) return ''
        const idx = list[0].dataIndex as number
        const item = props.impacts[idx]
        const keys: MarketRegimeType[] = ['bull', 'sideways', 'bear']
        const rows = keys
          .map((k, i) => {
            const st = item.stats[k]
            const v = st[props.metric]
            const marker = list[i]?.marker || ''
            const currTag = k === props.currentRegime ? ' ◀ 当前' : ''
            return `<div style="display:flex;justify-content:space-between;gap:14px;line-height:1.7;">
              <span>${marker}${st.regimeLabel} (${st.sampleCount}轮)${currTag}</span>
              <span style="font-weight:700;color:${v >= 0 ? '#fb7185' : '#34d399'}">${v > 0 ? '+' : ''}${v}%</span>
            </div>`
          })
          .join('')
        return `<div style="min-width:210px">
          <div style="font-weight:700;margin-bottom:4px;border-bottom:1px solid #334155;padding-bottom:3px;">
            ${item.sector.name} · ${isAlpha ? '相对上证超额收益 (Alpha)' : '季节窗口平均冲高涨幅'}
          </div>
          ${rows}
        </div>`
      }
    },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: '#334155', fontSize: 12 }
    },
    grid: {
      top: 40,
      left: 52,
      right: 18,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#334155', fontWeight: 600 }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#64748b',
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
      },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
    },
    series: [
      {
        name: props.currentRegime === 'bull' ? '牛市环境 (当前)' : '牛市环境',
        type: 'bar',
        barMaxWidth: 26,
        data: bullData,
        itemStyle: {
          color: '#e11d48',
          borderRadius: [5, 5, 0, 0],
          opacity: props.currentRegime === 'bull' ? 1 : 0.72
        }
      },
      {
        name: props.currentRegime === 'sideways' ? '震荡环境 (当前)' : '震荡环境',
        type: 'bar',
        barMaxWidth: 26,
        data: sidewaysData,
        itemStyle: {
          color: '#2563eb',
          borderRadius: [5, 5, 0, 0],
          opacity: props.currentRegime === 'sideways' ? 1 : 0.72
        }
      },
      {
        name: props.currentRegime === 'bear' ? '熊市环境 (当前)' : '熊市环境',
        type: 'bar',
        barMaxWidth: 26,
        data: bearData,
        itemStyle: {
          color: '#059669',
          borderRadius: [5, 5, 0, 0],
          opacity: props.currentRegime === 'bear' ? 1 : 0.75
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

watch(() => [props.impacts, props.metric, props.currentRegime], () => renderChart(), {
  deep: true
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="chartEl" :style="{ width: '100%', height }" />
</template>
