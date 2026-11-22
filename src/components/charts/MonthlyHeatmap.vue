<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { KlineTuple } from '@/types/stock'
import { buildMonthlyHeatmapData } from '@/utils/cycleMath'

const props = withDefaults(
  defineProps<{
    rows: KlineTuple[]
    buyMonths?: number[]
    sellMonths?: number[]
    height?: string
  }>(),
  {
    buyMonths: () => [],
    sellMonths: () => [],
    height: '320px'
  }
)

const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const heatmap = computed(() => buildMonthlyHeatmapData(props.rows))

function renderChart() {
  if (!chart) return
  const data = heatmap.value
  if (data.years.length === 0) {
    chart.clear()
    return
  }

  const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)
  const validData = data.cells
    .filter((c) => c[2] !== null)
    .map((c) => [c[0], c[1], c[2]])

  const option: echarts.EChartsOption = {
    tooltip: {
      position: 'top',
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (p: unknown) => {
        const item = p as { value: [number, number, number] }
        const [mIdx, yIdx, val] = item.value
        const year = data.years[yIdx]
        const sign = val > 0 ? '+' : ''
        return `${year}年 ${mIdx + 1}月：<b>${sign}${val.toFixed(2)}%</b>`
      }
    },
    grid: {
      top: 16,
      left: 54,
      right: 16,
      bottom: 34
    },
    xAxis: {
      type: 'category',
      data: months,
      splitArea: { show: true },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#334155', fontWeight: 500 }
    },
    yAxis: {
      type: 'category',
      data: data.years.map((y) => `${y}`),
      splitArea: { show: true },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569' }
    },
    visualMap: {
      show: false,
      min: -18,
      max: 18,
      inRange: {
        // A股习惯：绿跌、白平、红涨
        color: [
          '#059669',
          '#34d399',
          '#a7f3d0',
          '#f8fafc',
          '#fecdd3',
          '#fb7185',
          '#e11d48'
        ]
      }
    },
    series: [
      {
        name: '月涨跌幅',
        type: 'heatmap',
        data: validData,
        label: {
          show: true,
          fontSize: 11,
          formatter: (p: unknown) => {
            const item = p as { value: [number, number, number] }
            const v = item.value[2]
            return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
          },
          color: '#0f172a'
        },
        itemStyle: {
          borderColor: '#ffffff',
          borderWidth: 2,
          borderRadius: 4
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: 'rgba(15, 23, 42, 0.25)'
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

watch(() => props.rows, () => renderChart(), { deep: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div class="heatmap-container">
    <div ref="chartEl" :style="{ width: '100%', height }" />
    <div v-if="heatmap.monthlySummary.length" class="monthly-summary-strip">
      <div
        v-for="m in heatmap.monthlySummary"
        :key="m.month"
        class="month-stat-cell"
        :class="{
          'is-buy': buyMonths.includes(m.month),
          'is-sell': sellMonths.includes(m.month)
        }"
      >
        <div class="month-title">
          {{ m.month }}月
          <span v-if="buyMonths.includes(m.month)" class="dot buy" title="预设低谷潜伏月" />
          <span v-if="sellMonths.includes(m.month)" class="dot sell" title="预设高峰兑现月" />
        </div>
        <div
          class="avg-val"
          :class="m.avgReturn > 0 ? 'up' : m.avgReturn < 0 ? 'down' : ''"
        >
          {{ m.avgReturn > 0 ? '+' : '' }}{{ m.avgReturn }}%
        </div>
        <div class="win-rate">胜率 {{ m.winRate }}%</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-container {
  width: 100%;
}

.monthly-summary-strip {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}

@media (max-width: 1100px) {
  .monthly-summary-strip {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.month-stat-cell {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 4px;
  text-align: center;
}

.month-stat-cell.is-buy {
  background: #ecfdf5;
  border-color: #6ee7b7;
}

.month-stat-cell.is-sell {
  background: #fff1f2;
  border-color: #fda4af;
}

.month-title {
  font-size: 11px;
  color: #475569;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.dot.buy {
  background: #10b981;
}
.dot.sell {
  background: #e11d48;
}

.avg-val {
  font-size: 12px;
  font-weight: 700;
  margin-top: 2px;
}

.avg-val.up {
  color: #e11d48;
}

.avg-val.down {
  color: #059669;
}

.win-rate {
  font-size: 11px;
  color: #64748b;
  margin-top: 1px;
}
</style>
