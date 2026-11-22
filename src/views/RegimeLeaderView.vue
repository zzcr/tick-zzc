<script setup lang="ts">
import { computed, ref } from 'vue'
import { TinyTag } from '@opentiny/vue'
import LeaderRotationChart from '@/components/charts/LeaderRotationChart.vue'
import RegimeImpactChart from '@/components/charts/RegimeImpactChart.vue'
import { useStockStore } from '@/stores/stockStore'
import type { KlineTuple } from '@/types/stock'
import {
  analyzeSectorLeaderRotation,
  analyzeSectorRegimeImpact,
  diagnoseCurrentMarket,
  scoreNextCycleLeaders
} from '@/utils/regimeAndLeader'

const store = useStockStore()

const chartMetric = ref<'avgMaxGain' | 'avgAlpha'>('avgMaxGain')
const activeLeaderSectorId = ref('sports')

const shRows = computed(() => store.getMergedRows('sh000001'))
const marketDiag = computed(() => diagnoseCurrentMarket(shRows.value))

const sectorImpacts = computed(() => {
  const currRegime = marketDiag.value?.regime || 'sideways'
  return store.sectors.map((sector) =>
    analyzeSectorRegimeImpact(
      sector,
      store.getSectorIndexRows(sector.id),
      shRows.value,
      currRegime
    )
  )
})

const mergedKlineDict = computed<Record<string, KlineTuple[]>>(() => {
  const dict: Record<string, KlineTuple[]> = {}
  for (const st of store.allStockRefs) {
    dict[st.symbol] = store.getMergedRows(st.symbol)
  }
  return dict
})

const allRotationStats = computed(() =>
  store.sectors.map((sector) =>
    analyzeSectorLeaderRotation(sector, mergedKlineDict.value)
  )
)

const globalRotationSummary = computed(() => {
  const totalTransitions = allRotationStats.value.reduce(
    (s, x) => s + x.totalTransitions,
    0
  )
  const repeatTop1 = allRotationStats.value.reduce(
    (s, x) => s + x.repeatTop1Count,
    0
  )
  const stayTop2 = allRotationStats.value.reduce((s, x) => s + x.stayTop2Count, 0)
  return {
    totalTransitions,
    repeatTop1,
    repeatTop1Rate: totalTransitions
      ? Number(((repeatTop1 / totalTransitions) * 100).toFixed(1))
      : 0,
    stayTop2Rate: totalTransitions
      ? Number(((stayTop2 / totalTransitions) * 100).toFixed(1))
      : 0
  }
})

const activeRotation = computed(
  () =>
    allRotationStats.value.find(
      (r) => r.sector.id === activeLeaderSectorId.value
    ) || allRotationStats.value[0] || null
)

const nextLeaderCandidates = computed(() => {
  if (!activeRotation.value) return []
  return scoreNextCycleLeaders(
    activeRotation.value.sector,
    mergedKlineDict.value,
    store.realtimeMap,
    activeRotation.value
  )
})

function formatPct(val: number | null | undefined) {
  if (val === null || val === undefined || Number.isNaN(val)) return '--'
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`
}
</script>

<template>
  <div class="regime-page">
    <!-- 一、当前 A 股牛熊阶段诊断 & 后续形势研判 -->
    <section v-if="marketDiag" class="panel-card hero-card" :class="`regime-${marketDiag.regime}`">
      <div class="hero-top">
        <div>
          <div class="hero-badges">
            <span class="regime-badge" :class="marketDiag.regime">
              当前大盘判定：{{ marketDiag.regimeLabel }}
            </span>
            <span class="sub-badge">{{ marketDiag.subLabel }}</span>
            <span class="date-badge">基准：上证指数 · 截至 {{ marketDiag.latestDate }}</span>
          </div>
          <h2 class="hero-title">A股牛熊环境诊断与后续形势研判</h2>
        </div>

        <div class="index-kpi">
          <div class="kpi-main">{{ marketDiag.close.toFixed(2) }}</div>
          <div
            class="kpi-sub"
            :class="marketDiag.ytdReturn >= 0 ? 'text-up' : 'text-down'"
          >
            今年以来 {{ formatPct(marketDiag.ytdReturn) }} · 距1年高点
            {{ formatPct(marketDiag.drawdownFrom1YHigh) }}
          </div>
        </div>
      </div>

      <div class="ma-strip">
        <div class="ma-box">
          <span>MA20 短期线</span>
          <b>{{ marketDiag.ma20 }}</b>
        </div>
        <div class="ma-box">
          <span>MA60 生命线</span>
          <b>{{ marketDiag.ma60 }}</b>
        </div>
        <div class="ma-box">
          <span>MA120 半年线</span>
          <b>{{ marketDiag.ma120 }}</b>
        </div>
        <div class="ma-box">
          <span>MA250 年线(牛熊分界)</span>
          <b>{{ marketDiag.ma250 }}</b>
        </div>
        <div class="ma-box">
          <span>上证近1年价格分位</span>
          <b :class="marketDiag.priceRank1Y <= 30 ? 'text-down' : 'text-up'">
            {{ marketDiag.priceRank1Y }}%
          </b>
        </div>
        <div class="ma-box wide">
          <span>均线结构</span>
          <b>{{ marketDiag.maAlignment }}</b>
        </div>
      </div>

      <div class="outlook-box">
        <div class="outlook-lead">
          <b>后续形势判断：</b>{{ marketDiag.outlookSummary }}
        </div>
        <ul class="rules-list">
          <li v-for="(rule, idx) in marketDiag.actionRules" :key="idx">
            {{ rule }}
          </li>
        </ul>
      </div>
    </section>

    <!-- 二、牛市 / 震荡市 / 熊市对各周期板块的影响回测 -->
    <section class="panel-card">
      <div class="section-header">
        <div>
          <h3>牛市 vs 震荡市 vs 熊市：对各季节性板块的真实影响回测（2019–2025）</h3>
          <p class="section-desc">
            按每轮季节窗口期间上证指数表现划分大盘环境（牛市 ≥ +8%、震荡 -6%~+8%、熊市 ≤ -6%），检验不同市况下季节性策略的绝对收益与超额收益（Alpha）。
          </p>
        </div>
        <div class="metric-switch">
          <button
            class="seg-btn"
            :class="{ active: chartMetric === 'avgMaxGain' }"
            @click="chartMetric = 'avgMaxGain'"
          >
            窗口平均冲高涨幅
          </button>
          <button
            class="seg-btn"
            :class="{ active: chartMetric === 'avgAlpha' }"
            @click="chartMetric = 'avgAlpha'"
          >
            相对上证超额收益(Alpha)
          </button>
        </div>
      </div>

      <RegimeImpactChart
        :impacts="sectorImpacts"
        :metric="chartMetric"
        :current-regime="marketDiag?.regime || 'sideways'"
      />

      <div class="table-wrap" style="margin-top: 14px">
        <table class="data-table">
          <thead>
            <tr>
              <th>周期板块</th>
              <th>牛市冲高 / Alpha</th>
              <th>震荡市冲高 / Alpha</th>
              <th>熊市冲高 / Alpha</th>
              <th>熊市平均最大回撤</th>
              <th>当前环境适配度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sectorImpacts" :key="item.sector.id">
              <td>
                <span class="dot" :style="{ background: item.sector.color }" />
                <b>{{ item.sector.name }}</b>
              </td>
              <td class="num">
                <span class="text-up">{{ formatPct(item.stats.bull.avgMaxGain) }}</span>
                <small class="muted"> / α {{ formatPct(item.stats.bull.avgAlpha) }}</small>
              </td>
              <td class="num">
                <span class="text-up">{{ formatPct(item.stats.sideways.avgMaxGain) }}</span>
                <small class="muted"> / α {{ formatPct(item.stats.sideways.avgAlpha) }}</small>
              </td>
              <td class="num">
                <span :class="item.stats.bear.avgMaxGain >= 0 ? 'text-up' : 'text-down'">
                  {{ formatPct(item.stats.bear.avgMaxGain) }}
                </span>
                <small class="muted"> / α {{ formatPct(item.stats.bear.avgAlpha) }}</small>
              </td>
              <td class="num text-down">{{ formatPct(item.stats.bear.avgDrawdown) }}</td>
              <td>
                <tiny-tag
                  size="small"
                  :type="
                    item.fitLevel === 'high'
                      ? 'success'
                      : item.fitLevel === 'caution'
                        ? 'danger'
                        : 'warning'
                  "
                >
                  {{ item.fitLabel }}
                </tiny-tag>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 三、龙头连庄率回测 & 下一轮潜龙量化打分 -->
    <section class="panel-card">
      <div class="section-header">
        <div>
          <h3>龙头股次年连庄概率回测 & 下一轮潜龙 5 维选股模型</h3>
          <p class="section-desc">
            用 2019–2025 真实数据回答核心问题：「今年是龙头，明年继续当龙头的概率会变小吗？怎么提高押中下一年新龙头的胜率？」
          </p>
        </div>
      </div>

      <!-- 全市场汇总结论 -->
      <div class="leader-summary-grid">
        <div class="l-stat-card">
          <div class="l-label">全板块平均「龙头次年连庄率 (第1→第1)」</div>
          <div class="l-val text-up">{{ globalRotationSummary.repeatTop1Rate }}%</div>
          <div class="l-note">
            {{ globalRotationSummary.repeatTop1 }} / {{ globalRotationSummary.totalTransitions }} 次跨年切换连庄 → <b>概率确实显著变小</b>
          </div>
        </div>
        <div class="l-stat-card">
          <div class="l-label">上轮龙头次年保持板块前 2 概率</div>
          <div class="l-val">{{ globalRotationSummary.stayTop2Rate }}%</div>
          <div class="l-note">
            约一半概率掉出前二，纯题材板块（体育/天然气）历史上甚至接近 0% 连庄
          </div>
        </div>
        <div class="l-stat-card highlight">
          <div class="l-label">提高命中下一年新龙头概率的 4 条核心规律</div>
          <div class="l-tips">
            ① <b>避开上轮翻倍老龙</b>（筹码套牢+市值变大）；② <b>锁定近1年分位 &lt; 30% 的低位股</b>；③ <b>题材看 20~80 亿小盘高弹性</b>；④ <b>潜伏月看 20 日温和放量(1.1~2.2x)+强于板块先手资金</b>。
          </div>
        </div>
      </div>

      <!-- 板块切换 -->
      <div class="sector-pills">
        <button
          v-for="r in allRotationStats"
          :key="r.sector.id"
          class="sec-btn"
          :class="{ active: r.sector.id === activeLeaderSectorId }"
          @click="activeLeaderSectorId = r.sector.id"
        >
          <i :style="{ background: r.sector.color }" />
          {{ r.sector.name }}
          <small>连庄 {{ r.repeatTop1Rate }}%</small>
        </button>
      </div>

      <template v-if="activeRotation">
        <div class="rotation-insight-bar">
          <tiny-tag
            size="small"
            :type="
              activeRotation.rotationStyle === 'high-rotation'
                ? 'danger'
                : activeRotation.rotationStyle === 'persistent'
                  ? 'success'
                  : 'warning'
            "
          >
            {{ activeRotation.rotationStyleLabel }}
          </tiny-tag>
          <span>{{ activeRotation.insight }}</span>
        </div>

        <!-- 历年龙头更迭时间轴 -->
        <div class="history-leaders-strip">
          <div
            v-for="rec in activeRotation.records"
            :key="rec.cycleYear"
            class="year-leader-card"
          >
            <div class="yl-year">{{ rec.label }}</div>
            <div class="yl-crown">👑 {{ rec.top1Name }}</div>
            <div class="yl-ret text-up">{{ formatPct(rec.top1Return) }}</div>
            <div class="yl-sub">
              第2：{{ rec.top2Name }} ({{ formatPct(rec.top2Return) }})
            </div>
          </div>
        </div>

        <!-- 下一轮潜在龙头 5 维得分图 + 详情表 -->
        <div class="leader-work-grid">
          <div>
            <h4 class="mini-title">{{ activeRotation.sector.name }} · 下一轮潜龙 5 维综合评分（满分100）</h4>
            <LeaderRotationChart :candidates="nextLeaderCandidates" height="290px" />
          </div>

          <div class="table-wrap">
            <h4 class="mini-title">候选标的量化拆解与筛选理由</h4>
            <table class="data-table compact">
              <thead>
                <tr>
                  <th>综合排名</th>
                  <th>股票</th>
                  <th>综合分</th>
                  <th>上轮排名</th>
                  <th>1年分位</th>
                  <th>市值(亿)</th>
                  <th>量比(20/120)</th>
                  <th>核心特征标签</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(c, idx) in nextLeaderCandidates"
                  :key="c.symbol"
                  :class="{ 'top-pick': idx === 0 }"
                >
                  <td><b>#{{ idx + 1 }}</b></td>
                  <td>
                    <b>{{ c.name }}</b>
                    <div class="code-sub">{{ c.code }}</div>
                  </td>
                  <td class="num score-cell">{{ c.totalScore }}</td>
                  <td class="num">
                    {{ c.lastCycleRank ? `第${c.lastCycleRank}名` : '--' }}
                  </td>
                  <td class="num">
                    <span
                      :class="
                        c.priceRank1Y <= 30
                          ? 'text-down'
                          : c.priceRank1Y >= 70
                            ? 'text-up'
                            : ''
                      "
                    >
                      {{ c.priceRank1Y }}%
                    </span>
                  </td>
                  <td class="num">{{ c.marketCap ? c.marketCap.toFixed(1) : '--' }}</td>
                  <td class="num">{{ c.volRatio20To120 }}x</td>
                  <td>
                    <div class="tag-wrap">
                      <span
                        v-for="t in c.tags"
                        :key="t.text"
                        class="reason-tag"
                        :class="t.type"
                      >
                        {{ t.text }}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.regime-page {
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

.hero-card {
  border-top: 4px solid #2563eb;
}

.hero-card.regime-bull {
  border-top-color: #e11d48;
}

.hero-card.regime-bear {
  border-top-color: #059669;
}

.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.regime-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
}

.regime-badge.bull {
  background: #ffe4e6;
  color: #be123c;
}

.regime-badge.sideways {
  background: #dbeafe;
  color: #1d4ed8;
}

.regime-badge.bear {
  background: #d1fae5;
  color: #047857;
}

.sub-badge {
  font-size: 12px;
  background: #f1f5f9;
  color: #334155;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 500;
}

.date-badge {
  font-size: 12px;
  color: #64748b;
  align-self: center;
}

.hero-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}

.index-kpi {
  text-align: right;
}

.kpi-main {
  font-size: 26px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.kpi-sub {
  font-size: 12.5px;
  font-weight: 600;
}

.ma-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

@media (max-width: 1024px) {
  .ma-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.ma-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ma-box span {
  font-size: 11px;
  color: #64748b;
}

.ma-box b {
  font-size: 14px;
  color: #0f172a;
}

.outlook-box {
  margin-top: 14px;
  background: #f8fafc;
  border-left: 3px solid #2563eb;
  border-radius: 0 10px 10px 0;
  padding: 12px 15px;
}

.outlook-lead {
  font-size: 13.5px;
  line-height: 1.65;
  color: #1e293b;
}

.rules-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #475569;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.section-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.metric-switch {
  display: inline-flex;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 8px;
}

.seg-btn {
  border: none;
  background: transparent;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}

.seg-btn.active {
  background: #ffffff;
  color: #2563eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 9px 10px;
  font-size: 12px;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.data-table td {
  padding: 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #0f172a;
}

.data-table.compact td,
.data-table.compact th {
  padding: 8px 8px;
  font-size: 12.5px;
}

.data-table tr.top-pick {
  background: #f0fdf4;
}

.dot {
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

.muted {
  color: #64748b;
  font-weight: 400;
}

.leader-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1.6fr;
  gap: 12px;
  margin-bottom: 16px;
}

@media (max-width: 1024px) {
  .leader-summary-grid {
    grid-template-columns: 1fr;
  }
}

.l-stat-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 13px 15px;
}

.l-stat-card.highlight {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.l-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.l-val {
  font-size: 24px;
  font-weight: 800;
  margin: 4px 0;
  color: #0f172a;
}

.l-note {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.l-tips {
  font-size: 12.5px;
  color: #1e3a8a;
  line-height: 1.65;
  margin-top: 6px;
}

.sector-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.sec-btn {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sec-btn i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sec-btn small {
  color: #94a3b8;
  font-weight: 500;
}

.sec-btn.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.sec-btn.active small {
  color: #cbd5e1;
}

.rotation-insight-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 12.5px;
  color: #334155;
  margin-bottom: 14px;
}

.history-leaders-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

@media (max-width: 1100px) {
  .history-leaders-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.year-leader-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 9px 10px;
}

.yl-year {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

.yl-crown {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  margin-top: 3px;
}

.yl-ret {
  font-size: 14px;
  font-weight: 800;
  margin-top: 2px;
}

.yl-sub {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 3px;
}

.leader-work-grid {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .leader-work-grid {
    grid-template-columns: 1fr;
  }
}

.mini-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.code-sub {
  font-size: 11px;
  color: #94a3b8;
}

.score-cell {
  font-size: 15px;
  color: #2563eb;
}

.tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.reason-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.reason-tag.good {
  background: #dcfce7;
  color: #166534;
}

.reason-tag.warn {
  background: #fee2e2;
  color: #991b1b;
}

.reason-tag.info {
  background: #e0f2fe;
  color: #075985;
}

.text-up {
  color: #e11d48;
}

.text-down {
  color: #059669;
}
</style>
