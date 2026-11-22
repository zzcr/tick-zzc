<script setup lang="ts">
import { computed } from 'vue'
import { TinyButton, TinyTag } from '@opentiny/vue'
import CycleTimelineChart from '@/components/charts/CycleTimelineChart.vue'
import { useStockStore } from '@/stores/stockStore'
import type { OpportunityStage } from '@/utils/cycleMath'

const emit = defineEmits<{
  (e: 'open-sector', sectorId: string): void
  (e: 'compare-sector', sectorId: string): void
}>()

const store = useStockStore()
const currentMonth = new Date().getMonth() + 1

const stageOrder: Record<OpportunityStage, number> = {
  buy: 0,
  'pre-buy': 1,
  sell: 2,
  hold: 3
}

const sortedCards = computed(() =>
  [...store.opportunityCards].sort(
    (a, b) => stageOrder[a.stage] - stageOrder[b.stage] || a.priceRank1Y - b.priceRank1Y
  )
)

const buySectors = computed(() =>
  store.opportunityCards.filter((c) => c.stage === 'buy' || c.stage === 'pre-buy')
)

const sellSectors = computed(() =>
  store.opportunityCards.filter((c) => c.stage === 'sell')
)

function formatPct(val: number | null | undefined) {
  if (val === null || val === undefined || Number.isNaN(val)) return '--'
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
}

function getRankColor(rank: number) {
  if (rank <= 30) return '#10b981'
  if (rank >= 70) return '#e11d48'
  return '#3b82f6'
}
</script>

<template>
  <div class="radar-page">
    <!-- 顶部季节机会概览 -->
    <section class="summary-grid">
      <div class="summary-card accent-emerald">
        <div class="summary-label">{{ currentMonth }}月 · 建议重点关注（低谷潜伏 / 临近窗口）</div>
        <div class="summary-value">
          <template v-if="buySectors.length">
            <span
              v-for="item in buySectors"
              :key="item.sector.id"
              class="summary-chip buy"
              @click="emit('open-sector', item.sector.id)"
            >
              {{ item.sector.name }}
              <small>分位 {{ item.priceRank1Y }}%</small>
            </span>
          </template>
          <span v-else class="empty-tip">本月暂无预设低谷板块</span>
        </div>
      </div>

      <div class="summary-card accent-rose">
        <div class="summary-label">{{ currentMonth }}月 · 处于历史高峰兑现区（注意分批止盈）</div>
        <div class="summary-value">
          <template v-if="sellSectors.length">
            <span
              v-for="item in sellSectors"
              :key="item.sector.id"
              class="summary-chip sell"
              @click="emit('open-sector', item.sector.id)"
            >
              {{ item.sector.name }}
              <small>分位 {{ item.priceRank1Y }}%</small>
            </span>
          </template>
          <span v-else class="empty-tip">本月暂无预设高峰兑现板块</span>
        </div>
      </div>

      <div class="summary-card accent-slate">
        <div class="summary-label">本地历史参考库 & 实时行情</div>
        <div class="meta-line">
          <span>收录板块 <b>{{ store.sectors.length }}</b> 个</span>
          <span>标的 <b>{{ store.allStockRefs.length }}</b> 只</span>
          <span>日线数据 <b>{{ store.dbStats.totalRows.toLocaleString() }}</b> 条</span>
        </div>
        <div class="meta-sub">
          历史底座截至：{{ store.meta?.latestTradeDate || '加载中' }} · 实时刷新：{{
            store.lastRealtimeAt || '待同步'
          }}
        </div>
      </div>
    </section>

    <!-- 全年12月季节轮动矩阵 -->
    <CycleTimelineChart
      :sectors="store.sectors"
      :current-month="currentMonth"
      @select="(id) => emit('open-sector', id)"
    />

    <!-- 各板块机会卡片 -->
    <section class="cards-section">
      <div class="section-head">
        <h2>各周期板块当前位置与实时表现</h2>
        <span class="section-tip">价格分位 = 当前价在近1年高低点所处位置，越接近 0% 越具低吸安全边际</span>
      </div>

      <div class="sector-cards-grid">
        <article
          v-for="card in sortedCards"
          :key="card.sector.id"
          class="sector-card"
          :class="`stage-${card.stage}`"
        >
          <div class="card-top">
            <div class="card-title-row">
              <span class="color-bar" :style="{ background: card.sector.color }" />
              <div>
                <h3 class="sector-title">{{ card.sector.name }}</h3>
                <div class="sector-sub">{{ card.sector.tag }}</div>
              </div>
            </div>
            <tiny-tag
              size="small"
              :type="
                card.stage === 'buy'
                  ? 'success'
                  : card.stage === 'sell'
                    ? 'danger'
                    : card.stage === 'pre-buy'
                      ? 'warning'
                      : 'info'
              "
            >
              {{ card.stageLabel }}
            </tiny-tag>
          </div>

          <p class="sector-logic">{{ card.sector.logic }}</p>

          <div class="metrics-row">
            <div class="metric">
              <span class="m-label">今日实时均涨跌</span>
              <span
                class="m-val"
                :class="
                  (card.liveChangePct ?? 0) > 0
                    ? 'text-up'
                    : (card.liveChangePct ?? 0) < 0
                      ? 'text-down'
                      : ''
                "
              >
                {{ formatPct(card.liveChangePct) }}
              </span>
            </div>
            <div class="metric">
              <span class="m-label">今年板块等权</span>
              <span
                class="m-val"
                :class="card.ytdReturn > 0 ? 'text-up' : card.ytdReturn < 0 ? 'text-down' : ''"
              >
                {{ formatPct(card.ytdReturn) }}
              </span>
            </div>
            <div class="metric">
              <span class="m-label">历年潜伏→高点均值</span>
              <span class="m-val text-up">
                +{{ card.historicalWindowAvgReturn }}%
                <small>(胜率{{ card.historicalWindowWinRate }}%)</small>
              </span>
            </div>
          </div>

          <!-- 近1年价格分位条 -->
          <div class="rank-box">
            <div class="rank-header">
              <span>近1年价格分位</span>
              <span class="rank-num" :style="{ color: getRankColor(card.priceRank1Y) }">
                {{ card.priceRank1Y }}%
                <small v-if="card.priceRank1Y <= 30">（低位区）</small>
                <small v-else-if="card.priceRank1Y >= 70">（高位区）</small>
                <small v-else>（中位区）</small>
              </span>
            </div>
            <div class="rank-track">
              <div
                class="rank-fill"
                :style="{
                  width: `${Math.min(100, Math.max(2, card.priceRank1Y))}%`,
                  background: getRankColor(card.priceRank1Y)
                }"
              />
            </div>
          </div>

          <!-- 成分股实时预览 -->
          <div class="stock-pills">
            <div
              v-for="st in card.sector.stocks"
              :key="st.symbol"
              class="stock-mini"
            >
              <span class="st-name">{{ st.name }}</span>
              <span
                class="st-pct"
                :class="
                  (store.realtimeMap[st.symbol]?.changePct ?? 0) > 0
                    ? 'text-up'
                    : (store.realtimeMap[st.symbol]?.changePct ?? 0) < 0
                      ? 'text-down'
                      : 'text-muted'
                "
              >
                <template v-if="store.realtimeMap[st.symbol]?.price">
                  {{ store.realtimeMap[st.symbol].price.toFixed(2) }}
                  ({{ formatPct(store.realtimeMap[st.symbol].changePct) }})
                </template>
                <template v-else>{{ st.code }}</template>
              </span>
            </div>
          </div>

          <div class="card-actions">
            <tiny-button
              type="primary"
              size="small"
              @click="emit('open-sector', card.sector.id)"
            >
              历年走势 & 热力图
            </tiny-button>
            <tiny-button
              size="small"
              plain
              @click="emit('compare-sector', card.sector.id)"
            >
              成分股同屏对比
            </tiny-button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.radar-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 1024px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

.summary-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px 18px;
  border-top: 3px solid #cbd5e1;
}

.summary-card.accent-emerald {
  border-top-color: #10b981;
}

.summary-card.accent-rose {
  border-top-color: #e11d48;
}

.summary-card.accent-slate {
  border-top-color: #2563eb;
}

.summary-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 10px;
}

.summary-value {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.summary-chip:hover {
  transform: translateY(-1px);
}

.summary-chip.buy {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.summary-chip.sell {
  background: #fff1f2;
  color: #be123c;
  border: 1px solid #fecdd3;
}

.summary-chip small {
  font-weight: 500;
  opacity: 0.85;
}

.empty-tip {
  color: #94a3b8;
  font-size: 13px;
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: #334155;
}

.meta-line b {
  color: #0f172a;
  font-size: 15px;
}

.meta-sub {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.section-head h2 {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.section-tip {
  font-size: 12px;
  color: #64748b;
}

.sector-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 960px) {
  .sector-cards-grid {
    grid-template-columns: 1fr;
  }
}

.sector-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.sector-card:hover {
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  border-color: #cbd5e1;
}

.sector-card.stage-buy {
  border-left: 4px solid #10b981;
}

.sector-card.stage-sell {
  border-left: 4px solid #e11d48;
}

.sector-card.stage-pre-buy {
  border-left: 4px solid #f59e0b;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-bar {
  width: 10px;
  height: 30px;
  border-radius: 5px;
}

.sector-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.sector-sub {
  font-size: 12px;
  color: #64748b;
}

.sector-logic {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: #475569;
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 8px;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.m-label {
  font-size: 11px;
  color: #64748b;
}

.m-val {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.m-val small {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
}

.rank-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rank-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
}

.rank-num {
  font-weight: 700;
}

.rank-track {
  height: 7px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}

.rank-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.stock-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stock-mini {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.st-name {
  color: #1e293b;
  font-weight: 500;
}

.st-pct {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}

.text-up {
  color: #e11d48;
}

.text-down {
  color: #059669;
}

.text-muted {
  color: #94a3b8;
}
</style>
