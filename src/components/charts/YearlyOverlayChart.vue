<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { KlineTuple } from '@/types/stock'
import { buildYearlyOverlayData } from '@/utils/cycleMath'

const props = withDefaults(
  defineProps<{
    title: string
    rows: KlineTuple[]
    startMonth?: number
    buyMonths?: number[]
    sellMonths?: number[]
    showMean?: boolean
    showQuantileBand?: boolean
    height?: string
  }>(),
  {
    startMonth: 1,
    buyMonths: () => [],
    sellMonths: () => [],
    showMean: true,
    showQuantileBand: true,
    height: '430px'
  }
)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const YEAR_PALETTE = [
  '#94a3b8',
  '#38bdf8',
  '#818cf8',
  '#34d399',
  '#f59e0b',
  '#a855f7',
  '#0ea5e9',
  '#fb7185'
]

const overlay = computed(() => buildYearlyOverlayData(props.rows, props.startMonth))

function buildMarkAreas() {
  const areas: Array<
    [
      { xAxis: number; itemStyle: Record<string, unknown>; name?: string },
      { xAxis: number }
    ]
  > = []

  const buySet = new Set(props.buyMonths)
  const sellSet = new Set(props.sellMonths)

  for (const m of overlay.value.monthStartIndices) {
    if (buySet.has(m.month)) {
      areas.push([
        {
          name: `${m.month}月低谷区`,
          xAxis: m.startIdx,
          itemStyle: { color: 'rgba(16, 185, 129, 0.10)' }
        },
        { xAxis: m.endIdx }
      ])
    } else if (sellSet.has(m.month)) {
      areas.push([
        {
          name: `${m.month}月高峰区`,
          xAxis: m.startIdx,
          itemStyle: { color: 'rgba(244, 63, 94, 0.09)' }
        },
        { xAxis: m.endIdx }
      ])
    }
  }
  return areas
}

function renderChart() {
  if (!chart) return
  const data = overlay.value
  if (data.series.length === 0) {
    chart.clear()
    chart.setOption({
      title: {
        text: '暂无足够的历史日线数据',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 400 }
      }
    })
    return
  }

  const seriesList: echarts.SeriesOption[] = []

  // 25% ~ 75% 历史分位区间带
  if (props.showQuantileBand) {
    const bandWidth = data.p75Line.map((hi, idx) => {
      const lo = data.p25Line[idx]
      if (hi === null || lo === null) return null
      return Number((hi - lo).toFixed(2))
    })

    seriesList.push({
      name: '25%分位基线',
      type: 'line',
      data: data.p25Line,
      stack: 'quantile-band',
      symbol: 'none',
      silent: true,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      tooltip: { show: false }
    })
    seriesList.push({
      name: '历史25%~75%区间',
      type: 'line',
      data: bandWidth,
      stack: 'quantile-band',
      symbol: 'none',
      silent: true,
      lineStyle: { opacity: 0 },
      areaStyle: { color: 'rgba(59, 130, 246, 0.11)' },
      tooltip: { show: false }
    })
  }

  // 历年均值曲线
  if (props.showMean) {
    seriesList.push({
      name: '历年均值',
      type: 'line',
      data: data.meanLine,
      symbol: 'none',
      smooth: 0.2,
      z: 6,
      lineStyle: {
        color: '#0f172a',
        width: 2.2,
        type: 'dashed'
      },
      markArea: {
        silent: true,
        label: { show: false },
        data: buildMarkAreas() as never
      }
    })
  }

  // 各年度曲线
  data.series.forEach((item, idx) => {
    const isCurr = item.isCurrent
    const color = isCurr
      ? '#e11d48'
      : YEAR_PALETTE[idx % YEAR_PALETTE.length]

    // 找到当年最后一个有效点，用来标出“当前位置”
    let lastValidIdx = -1
    let lastValidVal: number | null = null
    if (isCurr) {
      for (let i = item.values.length - 1; i >= 0; i--) {
        if (item.values[i] !== null) {
          lastValidIdx = i
          lastValidVal = item.values[i]
          break
        }
      }
    }

    seriesList.push({
      name: isCurr ? `${item.label} (当前)` : item.label,
      type: 'line',
      data: item.values,
      symbol: 'none',
      smooth: 0.15,
      z: isCurr ? 10 : 4,
      lineStyle: {
        color,
        width: isCurr ? 3 : 1.5,
        opacity: isCurr ? 1 : 0.65
      },
      itemStyle: { color },
      markPoint:
        isCurr && lastValidIdx >= 0 && lastValidVal !== null
          ? {
              symbol: 'circle',
              symbolSize: 9,
              label: {
                show: true,
                position: 'top',
                formatter: `${lastValidVal >= 0 ? '+' : ''}${lastValidVal}%`,
                color: '#fff',
                backgroundColor: '#e11d48',
                padding: [3, 6],
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600
              },
              data: [{ name: '当前位置', coord: [lastValidIdx, lastValidVal] }]
            }
          : undefined,
      markArea:
        !props.showMean && idx === 0
          ? {
              silent: true,
              label: { show: false },
              data: buildMarkAreas() as never
            }
          : undefined
    })
  })

  const legendNames = [
    ...(props.showMean ? ['历年均值'] : []),
    ...data.series.map((s) => (s.isCurrent ? `${s.label} (当前)` : s.label))
  ]

  // X 轴仅在每月 1 号显示清晰月份标签
  const monthLabelMap = new Map<number, string>()
  data.monthStartIndices.forEach((m) => {
    monthLabelMap.set(m.startIdx, `${m.month}月`)
  })

  const option: echarts.EChartsOption = {
    animationDuration: 400,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : []
        if (list.length === 0) return ''
        const dateLabel = list[0].axisValue
        const validItems = list
          .filter(
            (p) =>
              p.seriesName !== '25%分位基线' &&
              p.seriesName !== '历史25%~75%区间' &&
              p.value !== null &&
              p.value !== undefined
          )
          .sort((a, b) => Number(b.value) - Number(a.value))

        const rowsHtml = validItems
          .map((p) => {
            const val = Number(p.value)
            const color = val > 0 ? '#fb7185' : val < 0 ? '#34d399' : '#cbd5e1'
            const sign = val > 0 ? '+' : ''
            return `<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.7;">
              <span>${p.marker}${p.seriesName}</span>
              <span style="font-weight:600;color:${color}">${sign}${val.toFixed(2)}%</span>
            </div>`
          })
          .join('')

        return `<div style="min-width:170px">
          <div style="font-weight:600;margin-bottom:4px;border-bottom:1px solid #334155;padding-bottom:3px;">周期日历 ${dateLabel}</div>
          ${rowsHtml}
        </div>`
      }
    },
    legend: {
      top: 4,
      left: 0,
      type: 'scroll',
      data: legendNames,
      textStyle: { color: '#475569', fontSize: 12 }
    },
    grid: {
      top: 48,
      left: 52,
      right: 24,
      bottom: 52
    },
    xAxis: {
      type: 'category',
      data: data.xLabels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#475569',
        fontSize: 12,
        interval: (index: number) => monthLabelMap.has(index),
        formatter: (_val: string, index: number) => monthLabelMap.get(index) || ''
      },
      splitLine: {
        show: true,
        interval: (index: number) => monthLabelMap.has(index),
        lineStyle: { color: '#f1f5f9', type: 'dashed' }
      }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`
      },
      splitLine: {
        lineStyle: { color: '#e2e8f0', type: 'dashed' }
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 20,
        bottom: 8,
        borderColor: '#e2e8f0',
        fillerColor: 'rgba(37, 99, 235, 0.12)'
      }
    ],
    series: seriesList
  }

  chart.setOption(option, true)
}

onMounted(() => {
  if (!chartEl.value) return
  chart = echarts.init(chartEl.value)
  renderChart()
  resizeObserver = new ResizeObserver(() => {
    chart?.resize()
  })
  resizeObserver.observe(chartEl.value)
})

watch(
  () => [
    props.rows,
    props.startMonth,
    props.buyMonths,
    props.sellMonths,
    props.showMean,
    props.showQuantileBand
  ],
  () => renderChart(),
  { deep: true }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div class="chart-wrap">
    <div class="chart-legend-hint">
      <span class="hint-chip buy"><i></i>绿色背景：历史低谷潜伏月</span>
      <span class="hint-chip sell"><i></i>红色背景：历史高峰兑现月</span>
      <span class="hint-chip band"><i></i>蓝色阴影：历年25%~75%波动带</span>
    </div>
    <div ref="chartEl" :style="{ width: '100%', height }" />
  </div>
</template>

<style scoped>
.chart-wrap {
  width: 100%;
}

.chart-legend-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #64748b;
}

.hint-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hint-chip i {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.hint-chip.buy i {
  background: rgba(16, 185, 129, 0.22);
  border: 1px solid rgba(16, 185, 129, 0.45);
}

.hint-chip.sell i {
  background: rgba(244, 63, 94, 0.2);
  border: 1px solid rgba(244, 63, 94, 0.45);
}

.hint-chip.band i {
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.35);
}
</style>
