<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TinyButton, TinyDatePicker, TinySwitch } from '@opentiny/vue'
import MultiCompareChart from '@/components/charts/MultiCompareChart.vue'
import { useStockStore } from '@/stores/stockStore'
import { buildMultiCompareData } from '@/utils/cycleMath'

const props = defineProps<{
  presetSectorId?: string
}>()

const store = useStockStore()

const COLORS = [
  '#e11d48',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#ea580c'
]

const compareMode = ref<'stocks' | 'sectors'>('stocks')
const selectedSymbols = ref<string[]>([])
const selectedSectorIds = ref<string[]>([])
const includeShIndex = ref(true)

const todayStr = new Date().toISOString().slice(0, 10)
const startDate = ref(`${new Date().getFullYear()}-01-01`)
const endDate = ref(todayStr)

const dateRange = computed<string[]>({
  get: () => [startDate.value, endDate.value],
  set: (val: string[] | null) => {
    if (Array.isArray(val) && val.length === 2 && val[0] && val[1]) {
      startDate.value = String(val[0]).slice(0, 10)
      endDate.value = String(val[1]).slice(0, 10)
    }
  }
})

function applyPresetSector(sectorId?: string) {
  const target =
    store.sectors.find((s) => s.id === sectorId) || store.sectors[0]
  if (!target) return
  compareMode.value = 'stocks'
  selectedSymbols.value = target.stocks.map((s) => s.symbol)
}

watch(
  () => [props.presetSectorId, store.initialized] as const,
  ([id, ready]) => {
    if (!ready) return
    if (id) {
      applyPresetSector(id)
    } else if (selectedSymbols.value.length === 0) {
      applyPresetSector(store.sectors[0]?.id)
    }
    if (selectedSectorIds.value.length === 0) {
      selectedSectorIds.value = store.sectors.map((s) => s.id)
    }
  },
  { immediate: true }
)

function setDatePreset(type: 'ytd' | '3m' | '6m' | '1y' | '3y' | 'sports' | 'ice') {
  const now = new Date()
  const y = now.getFullYear()
  endDate.value = now.toISOString().slice(0, 10)

  if (type === 'ytd') {
    startDate.value = `${y}-01-01`
  } else if (type === '3m') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 3)
    startDate.value = d.toISOString().slice(0, 10)
  } else if (type === '6m') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 6)
    startDate.value = d.toISOString().slice(0, 10)
  } else if (type === '1y') {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 1)
    startDate.value = d.toISOString().slice(0, 10)
  } else if (type === '3y') {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 3)
    startDate.value = d.toISOString().slice(0, 10)
  } else if (type === 'sports') {
    startDate.value = `${y - 1}-12-01`
    endDate.value = `${y}-06-30`
  } else if (type === 'ice') {
    startDate.value = `${y}-07-01`
    endDate.value = `${y}-12-31`
  }
}

function toggleSymbol(symbol: string) {
  const idx = selectedSymbols.value.indexOf(symbol)
  if (idx >= 0) {
    selectedSymbols.value.splice(idx, 1)
  } else {
    selectedSymbols.value.push(symbol)
  }
}

function toggleSectorId(id: string) {
  const idx = selectedSectorIds.value.indexOf(id)
  if (idx >= 0) {
    selectedSectorIds.value.splice(idx, 1)
  } else {
    selectedSectorIds.value.push(id)
  }
}

const compareResult = computed(() => {
  const targets: {
    symbol: string
    name: string
    color: string
    rows: ReturnType<typeof store.getMergedRows>
  }[] = []

  if (compareMode.value === 'stocks') {
    selectedSymbols.value.forEach((sym, idx) => {
      const refItem = store.allStockRefs.find((s) => s.symbol === sym)
      targets.push({
        symbol: sym,
        name: refItem ? `${refItem.name}(${refItem.code})` : sym,
        color: COLORS[idx % COLORS.length],
        rows: store.getMergedRows(sym)
      })
    })
  } else {
    selectedSectorIds.value.forEach((id, idx) => {
      const sec = store.sectors.find((s) => s.id === id)
      if (!sec) return
      targets.push({
        symbol: `sector:${sec.id}`,
        name: `${sec.name}指数`,
        color: sec.color || COLORS[idx % COLORS.length],
        rows: store.getSectorIndexRows(sec.id)
      })
    })
  }

  if (includeShIndex.value) {
    const shRows = store.getMergedRows('sh000001')
    if (shRows.length > 0) {
      targets.push({
        symbol: 'sh000001',
        name: '上证指数 (基准)',
        color: '#64748b',
        rows: shRows
      })
    }
  }

  return buildMultiCompareData(targets, startDate.value, endDate.value)
})

const sortedCompareStats = computed(() =>
  [...compareResult.value.items].sort((a, b) => b.totalReturn - a.totalReturn)
)

function formatPct(val: number | null | undefined) {
  if (val === null || val === undefined || Number.isNaN(val)) return '--'
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
}
</script>

<template>
  <div class="compare-page">
    <!-- 顶部模式与时间区间栏 -->
    <section class="panel-card">
      <div class="top-controls">
        <div class="mode-switch">
          <button
            class="mode-btn"
            :class="{ active: compareMode === 'stocks' }"
            @click="compareMode = 'stocks'"
          >
            多只个股对比
          </button>
          <button
            class="mode-btn"
            :class="{ active: compareMode === 'sectors' }"
            @click="compareMode = 'sectors'"
          >
            跨板块指数对比
          </button>
        </div>

        <div class="date-controls">
          <div class="preset-btns">
            <tiny-button size="mini" @click="setDatePreset('3m')">近3月</tiny-button>
            <tiny-button size="mini" @click="setDatePreset('6m')">近6月</tiny-button>
            <tiny-button size="mini" @click="setDatePreset('ytd')">今年以来</tiny-button>
            <tiny-button size="mini" @click="setDatePreset('1y')">近1年</tiny-button>
            <tiny-button size="mini" @click="setDatePreset('3y')">近3年</tiny-button>
            <tiny-button size="mini" plain type="success" @click="setDatePreset('sports')">
              体育窗(12→6月)
            </tiny-button>
            <tiny-button size="mini" plain type="info" @click="setDatePreset('ice')">
              冰雪窗(7→12月)
            </tiny-button>
          </div>

          <div class="date-inputs">
            <tiny-date-picker
              v-model="dateRange"
              type="daterange"
              size="small"
              format="yyyy-MM-dd"
              value-format="yyyy-MM-dd"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              :clearable="false"
              style="width: 245px"
            />
          </div>

          <label class="bench-switch">
            <tiny-switch v-model="includeShIndex" mini />
            <span>叠加上证指数</span>
          </label>
        </div>
      </div>

      <!-- 标的选择器 -->
      <div v-if="compareMode === 'stocks'" class="picker-area">
        <div class="picker-head">
          <span>快捷按板块全选：</span>
          <div class="quick-sector-btns">
            <button
              v-for="s in store.sectors"
              :key="s.id"
              class="quick-sec-btn"
              @click="applyPresetSector(s.id)"
            >
              <i :style="{ background: s.color }" />
              {{ s.name }}
            </button>
            <button class="quick-sec-btn clear" @click="selectedSymbols = []">清空</button>
          </div>
        </div>

        <div class="stock-groups">
          <div v-for="s in store.sectors" :key="s.id" class="stock-group-row">
            <span class="group-name" :style="{ color: s.color }">{{ s.name }}</span>
            <div class="group-chips">
              <button
                v-for="st in s.stocks"
                :key="st.symbol"
                class="pick-chip"
                :class="{ selected: selectedSymbols.includes(st.symbol) }"
                @click="toggleSymbol(st.symbol)"
              >
                {{ st.name }}
                <small>{{ st.code }}</small>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="picker-area">
        <div class="group-chips">
          <button
            v-for="s in store.sectors"
            :key="s.id"
            class="pick-chip"
            :class="{ selected: selectedSectorIds.includes(s.id) }"
            @click="toggleSectorId(s.id)"
          >
            {{ s.name }}等权指数
          </button>
        </div>
      </div>

      <!-- 对比折线主图 -->
      <div class="chart-box">
        <MultiCompareChart :result="compareResult" height="440px" />
      </div>
    </section>

    <!-- 横向对比排行指标表 -->
    <section class="panel-card">
      <div class="table-head">
        <h3>区间表现横向对比排名（{{ startDate }} ~ {{ endDate }}）</h3>
        <span>起点归零对比：可快速找出板块内弹性最大或滞涨补涨的标的</span>
      </div>
      <div class="table-wrap">
        <table class="rank-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>标的</th>
              <th>区间累计涨跌</th>
              <th>区间最高涨幅</th>
              <th>区间最大回撤</th>
              <th>最新收盘/现价</th>
              <th>今日实时</th>
              <th>近1年价格分位</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in sortedCompareStats" :key="item.symbol">
              <td>{{ idx + 1 }}</td>
              <td>
                <span class="line-dot" :style="{ background: item.color }" />
                <b>{{ item.name }}</b>
              </td>
              <td class="num" :class="item.totalReturn >= 0 ? 'text-up' : 'text-down'">
                {{ formatPct(item.totalReturn) }}
              </td>
              <td class="num text-up">{{ formatPct(item.maxGain) }}</td>
              <td class="num text-down">{{ formatPct(item.maxDrawdown) }}</td>
              <td class="num">{{ item.latestClose ? item.latestClose.toFixed(2) : '--' }}</td>
              <td
                class="num"
                :class="
                  (store.realtimeMap[item.symbol]?.changePct ?? 0) > 0
                    ? 'text-up'
                    : (store.realtimeMap[item.symbol]?.changePct ?? 0) < 0
                      ? 'text-down'
                      : ''
                "
              >
                {{
                  item.symbol.startsWith('sector:')
                    ? '--'
                    : formatPct(store.realtimeMap[item.symbol]?.changePct)
                }}
              </td>
              <td>
                <span
                  class="rank-pill"
                  :class="
                    item.priceRank1Y <= 30
                      ? 'low'
                      : item.priceRank1Y >= 70
                        ? 'high'
                        : 'mid'
                  "
                >
                  {{ item.priceRank1Y }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.compare-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
}

.top-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.mode-switch {
  display: inline-flex;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 10px;
}

.mode-btn {
  border: none;
  background: transparent;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}

.mode-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.date-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.preset-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.date-inputs {
  display: inline-flex;
  align-items: center;
}

.bench-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}

.picker-area {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.quick-sector-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-sec-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.quick-sec-btn i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.quick-sec-btn.clear {
  color: #e11d48;
}

.stock-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stock-group-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.group-name {
  font-size: 12px;
  font-weight: 700;
  min-width: 72px;
}

.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick-chip {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pick-chip small {
  color: #94a3b8;
  font-size: 11px;
}

.pick-chip.selected {
  background: #1d4ed8;
  color: #ffffff;
  border-color: #1d4ed8;
}

.pick-chip.selected small {
  color: #bfdbfe;
}

.chart-box {
  margin-top: 6px;
}

.table-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.table-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.table-head span {
  font-size: 12px;
  color: #64748b;
}

.table-wrap {
  overflow-x: auto;
}

.rank-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.rank-table th {
  text-align: left;
  padding: 9px 10px;
  color: #64748b;
  font-size: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.rank-table td {
  padding: 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #0f172a;
}

.line-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 7px;
}

.num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.rank-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.rank-pill.low {
  background: #d1fae5;
  color: #047857;
}
.rank-pill.mid {
  background: #dbeafe;
  color: #1d4ed8;
}
.rank-pill.high {
  background: #ffe4e6;
  color: #be123c;
}

.text-up {
  color: #e11d48;
}
.text-down {
  color: #059669;
}
</style>
