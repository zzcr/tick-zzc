<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  TinyButton,
  TinyDialogBox,
  TinyInput,
  TinyNumeric,
  TinyOption,
  TinySelect,
  TinySwitch,
  TinyTag
} from '@opentiny/vue'
import MonthlyHeatmap from '@/components/charts/MonthlyHeatmap.vue'
import YearlyOverlayChart from '@/components/charts/YearlyOverlayChart.vue'
import { useStockStore } from '@/stores/stockStore'
import type { StockRef } from '@/types/stock'
import { buildYearlyOverlayData, calcPriceRank1Y } from '@/utils/cycleMath'

const props = defineProps<{
  sectorId: string
}>()

const emit = defineEmits<{
  (e: 'update:sectorId', id: string): void
  (e: 'compare-sector', id: string): void
}>()

const store = useStockStore()

const activeTarget = ref<'SECTOR_INDEX' | string>('SECTOR_INDEX')
const startMonth = ref(1)
const showMean = ref(true)
const showQuantileBand = ref(true)

// 个股观察笔记弹窗
const noteVisible = ref(false)
const editingStock = ref<StockRef | null>(null)
const noteForm = ref({
  buyTarget: null as number | null,
  sellTarget: null as number | null,
  note: ''
})

const currentSector = computed(
  () =>
    store.sectors.find((s) => s.id === props.sectorId) || store.sectors[0] || null
)

watch(
  () => currentSector.value?.id,
  () => {
    activeTarget.value = 'SECTOR_INDEX'
    if (currentSector.value) {
      startMonth.value = currentSector.value.defaultCycleStartMonth || 1
    }
  },
  { immediate: true }
)

const activeRows = computed(() => {
  if (!currentSector.value) return []
  if (activeTarget.value === 'SECTOR_INDEX') {
    return store.getSectorIndexRows(currentSector.value.id)
  }
  return store.getMergedRows(activeTarget.value)
})

const activeTargetLabel = computed(() => {
  if (!currentSector.value) return ''
  if (activeTarget.value === 'SECTOR_INDEX') {
    return `${currentSector.value.name} · 板块等权指数`
  }
  const st = currentSector.value.stocks.find((s) => s.symbol === activeTarget.value)
  return st ? `${st.name} (${st.code})` : activeTarget.value
})

const yearlyStats = computed(() =>
  buildYearlyOverlayData(activeRows.value, startMonth.value).series.slice().reverse()
)

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: i === 0 ? '1月（自然年 1月→12月）' : `${i + 1}月起（跨年周期 ${i + 1}月→次年${i}月）`
}))

function openNoteDialog(stock: StockRef) {
  editingStock.value = stock
  const existing = store.notesMap[stock.symbol]
  noteForm.value = {
    buyTarget: existing?.buyTarget ?? null,
    sellTarget: existing?.sellTarget ?? null,
    note: existing?.note ?? ''
  }
  noteVisible.value = true
}

async function handleSaveNote() {
  if (!editingStock.value) return
  await store.saveStockNote({
    symbol: editingStock.value.symbol,
    buyTarget: noteForm.value.buyTarget,
    sellTarget: noteForm.value.sellTarget,
    note: noteForm.value.note.trim(),
    updatedAt: ''
  })
  noteVisible.value = false
}

function formatPct(val: number | null | undefined) {
  if (val === null || val === undefined || Number.isNaN(val)) return '--'
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
}
</script>

<template>
  <div v-if="currentSector" class="sector-view">
    <!-- 顶部板块切换条 -->
    <div class="sector-tabs">
      <button
        v-for="s in store.sectors"
        :key="s.id"
        class="sector-pill"
        :class="{ active: s.id === currentSector.id }"
        @click="emit('update:sectorId', s.id)"
      >
        <i :style="{ background: s.color }" />
        {{ s.name }}
      </button>
    </div>

    <!-- 控制面板 + 历年叠加主图 -->
    <section class="panel-card">
      <div class="panel-header">
        <div>
          <div class="title-line">
            <h2>{{ activeTargetLabel }} · 历年走势横向叠加</h2>
            <tiny-tag size="small" type="success">
              潜伏月：{{ currentSector.buyMonths.map((m) => `${m}月`).join('、') }}
            </tiny-tag>
            <tiny-tag size="small" type="danger">
              兑现月：{{ currentSector.sellMonths.map((m) => `${m}月`).join('、') }}
            </tiny-tag>
          </div>
          <p class="logic-desc">{{ currentSector.logic }}</p>
        </div>
        <tiny-button
          size="small"
          plain
          @click="emit('compare-sector', currentSector.id)"
        >
          将该板块送入多股对比
        </tiny-button>
      </div>

      <!-- 标的与周期对齐参数栏 -->
      <div class="toolbar">
        <div class="tool-group">
          <span class="tool-label">查看对象：</span>
          <div class="target-chips">
            <button
              class="target-btn"
              :class="{ active: activeTarget === 'SECTOR_INDEX' }"
              @click="activeTarget = 'SECTOR_INDEX'"
            >
              板块等权指数
            </button>
            <button
              v-for="st in currentSector.stocks"
              :key="st.symbol"
              class="target-btn"
              :class="{ active: activeTarget === st.symbol }"
              @click="activeTarget = st.symbol"
            >
              {{ st.name }}
            </button>
          </div>
        </div>

        <div class="tool-group right-controls">
          <span class="tool-label">对齐起点：</span>
          <tiny-select v-model="startMonth" style="width: 230px" size="small">
            <tiny-option
              v-for="opt in monthOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </tiny-select>

          <label class="switch-item">
            <tiny-switch v-model="showMean" mini />
            <span>历年均值</span>
          </label>
          <label class="switch-item">
            <tiny-switch v-model="showQuantileBand" mini />
            <span>波动分位带</span>
          </label>
        </div>
      </div>

      <YearlyOverlayChart
        :title="activeTargetLabel"
        :rows="activeRows"
        :start-month="startMonth"
        :buy-months="currentSector.buyMonths"
        :sell-months="currentSector.sellMonths"
        :show-mean="showMean"
        :show-quantile-band="showQuantileBand"
      />
    </section>

    <!-- 下半部分：月度热力图 + 历年统计表 -->
    <div class="lower-grid">
      <section class="panel-card">
        <div class="sub-head">
          <h3>历年月度涨跌幅热力图 & 各月胜率</h3>
          <span class="sub-tip">一眼验证每一年哪个月最容易跌出黄金坑、哪个月最容易拉升兑现</span>
        </div>
        <MonthlyHeatmap
          :rows="activeRows"
          :buy-months="currentSector.buyMonths"
          :sell-months="currentSector.sellMonths"
        />
      </section>

      <section class="panel-card">
        <div class="sub-head">
          <h3>各周期年度区间极值统计</h3>
          <span class="sub-tip">起点：{{ startMonth }}月首个交易日归零</span>
        </div>
        <div class="table-wrap">
          <table class="stat-table">
            <thead>
              <tr>
                <th>周期</th>
                <th>区间期末</th>
                <th>期间最高涨幅</th>
                <th>最大回撤</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in yearlyStats"
                :key="row.label"
                :class="{ 'is-curr': row.isCurrent }"
              >
                <td>
                  <b>{{ row.label }}</b>
                  <span v-if="row.isCurrent" class="curr-badge">当前</span>
                </td>
                <td :class="(row.finalReturn ?? 0) >= 0 ? 'text-up' : 'text-down'">
                  {{ formatPct(row.finalReturn) }}
                </td>
                <td class="text-up">{{ formatPct(row.maxGain) }}</td>
                <td class="text-down">{{ formatPct(row.maxDrawdown) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- 板块成分股实时详情与个人目标价笔记 -->
    <section class="panel-card">
      <div class="sub-head">
        <h3>{{ currentSector.name }} · 成分股实时状态与低吸/高抛笔记</h3>
        <span class="sub-tip">点击股票行可直接切换上方历年图表，笔记保存在浏览器 IndexedDB</span>
      </div>
      <div class="table-wrap">
        <table class="stat-table stocks-detail-table">
          <thead>
            <tr>
              <th>股票名称 / 代码</th>
              <th>最新价</th>
              <th>实时涨跌</th>
              <th>换手率</th>
              <th>总市值(亿)</th>
              <th>近1年价格分位</th>
              <th>个人目标(低吸/高抛)</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="st in currentSector.stocks"
              :key="st.symbol"
              :class="{ 'is-selected': activeTarget === st.symbol }"
              @click="activeTarget = st.symbol"
            >
              <td>
                <div class="st-cell">
                  <b>{{ st.name }}</b>
                  <span>{{ st.symbol }}</span>
                </div>
              </td>
              <td class="num">
                {{
                  store.realtimeMap[st.symbol]?.price
                    ? store.realtimeMap[st.symbol].price.toFixed(2)
                    : store.getMergedRows(st.symbol).slice(-1)[0]?.[2]?.toFixed(2) || '--'
                }}
              </td>
              <td
                class="num"
                :class="
                  (store.realtimeMap[st.symbol]?.changePct ?? 0) > 0
                    ? 'text-up'
                    : (store.realtimeMap[st.symbol]?.changePct ?? 0) < 0
                      ? 'text-down'
                      : ''
                "
              >
                {{ formatPct(store.realtimeMap[st.symbol]?.changePct) }}
              </td>
              <td class="num">
                {{
                  store.realtimeMap[st.symbol]?.turnover
                    ? `${store.realtimeMap[st.symbol].turnover.toFixed(2)}%`
                    : '--'
                }}
              </td>
              <td class="num">
                {{
                  store.realtimeMap[st.symbol]?.marketCap
                    ? store.realtimeMap[st.symbol].marketCap.toFixed(1)
                    : '--'
                }}
              </td>
              <td>
                <span
                  class="rank-badge"
                  :class="
                    calcPriceRank1Y(store.getMergedRows(st.symbol)) <= 30
                      ? 'low'
                      : calcPriceRank1Y(store.getMergedRows(st.symbol)) >= 70
                        ? 'high'
                        : 'mid'
                  "
                >
                  {{ calcPriceRank1Y(store.getMergedRows(st.symbol)) }}%
                </span>
              </td>
              <td class="note-cell">
                <template v-if="store.notesMap[st.symbol]">
                  <span v-if="store.notesMap[st.symbol].buyTarget" class="target-tag buy">
                    吸 {{ store.notesMap[st.symbol].buyTarget }}
                  </span>
                  <span v-if="store.notesMap[st.symbol].sellTarget" class="target-tag sell">
                    抛 {{ store.notesMap[st.symbol].sellTarget }}
                  </span>
                  <span class="note-preview">{{ store.notesMap[st.symbol].note }}</span>
                </template>
                <span v-else class="text-muted">未记录</span>
              </td>
              <td @click.stop>
                <tiny-button size="mini" plain @click="openNoteDialog(st)">
                  记录策略
                </tiny-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 笔记弹窗 -->
    <tiny-dialog-box
      v-model:visible="noteVisible"
      :title="editingStock ? `记录观察笔记 · ${editingStock.name} (${editingStock.code})` : '记录笔记'"
      width="460px"
    >
      <div class="note-form">
        <div class="form-row">
          <label>预期低吸价（元）</label>
          <tiny-numeric v-model="noteForm.buyTarget" :step="0.5" :min="0" :precision="2" />
        </div>
        <div class="form-row">
          <label>预期高抛价（元）</label>
          <tiny-numeric v-model="noteForm.sellTarget" :step="0.5" :min="0" :precision="2" />
        </div>
        <div class="form-row">
          <label>选股逻辑 / 催化备注</label>
          <tiny-input
            v-model="noteForm.note"
            type="textarea"
            :rows="3"
            placeholder="例如：12月中下旬缩量回踩年线分批建仓，次年5月放量滞涨兑现..."
          />
        </div>
      </div>
      <template #footer>
        <tiny-button @click="noteVisible = false">取消</tiny-button>
        <tiny-button type="primary" @click="handleSaveNote">保存到本地 IndexedDB</tiny-button>
      </template>
    </tiny-dialog-box>
  </div>
</template>

<style scoped>
.sector-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sector-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sector-pill {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: all 0.15s ease;
}

.sector-pill i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sector-pill:hover {
  border-color: #94a3b8;
}

.sector-pill.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.panel-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.title-line h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.logic-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
  margin-bottom: 12px;
}

.tool-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.tool-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.target-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.target-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.target-btn.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.switch-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}

.lower-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 16px;
}

@media (max-width: 1100px) {
  .lower-grid {
    grid-template-columns: 1fr;
  }
}

.sub-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.sub-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.sub-tip {
  font-size: 12px;
  color: #64748b;
}

.table-wrap {
  overflow-x: auto;
}

.stat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.stat-table th {
  text-align: left;
  padding: 9px 10px;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.stat-table td {
  padding: 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}

.stat-table tbody tr.is-curr {
  background: #fff1f2;
}

.stocks-detail-table tbody tr {
  cursor: pointer;
}

.stocks-detail-table tbody tr:hover {
  background: #f8fafc;
}

.stocks-detail-table tbody tr.is-selected {
  background: #eff6ff;
}

.curr-badge {
  margin-left: 6px;
  font-size: 10px;
  background: #e11d48;
  color: #ffffff;
  padding: 1px 5px;
  border-radius: 4px;
}

.st-cell {
  display: flex;
  flex-direction: column;
}

.st-cell span {
  font-size: 11px;
  color: #94a3b8;
}

.num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.rank-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.rank-badge.low {
  background: #d1fae5;
  color: #047857;
}

.rank-badge.mid {
  background: #dbeafe;
  color: #1d4ed8;
}

.rank-badge.high {
  background: #ffe4e6;
  color: #be123c;
}

.note-cell {
  max-width: 240px;
}

.target-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 4px;
  font-weight: 600;
}

.target-tag.buy {
  background: #ecfdf5;
  color: #047857;
}

.target-tag.sell {
  background: #fff1f2;
  color: #be123c;
}

.note-preview {
  display: block;
  font-size: 11.5px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.note-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.text-up {
  color: #e11d48;
}

.text-down {
  color: #059669;
}

.text-muted {
  color: #94a3b8;
  font-size: 12px;
}
</style>
