<script setup lang="ts">
import type { SectorConfig } from '@/types/stock'

const props = defineProps<{
  sectors: SectorConfig[]
  currentMonth: number
  activeSectorId?: string
}>()

const emit = defineEmits<{
  (e: 'select', sectorId: string): void
}>()

const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function getCellType(sector: SectorConfig, month: number): 'buy' | 'sell' | 'normal' {
  if (sector.buyMonths.includes(month)) return 'buy'
  if (sector.sellMonths.includes(month)) return 'sell'
  return 'normal'
}
</script>

<template>
  <div class="timeline-card">
    <div class="timeline-header">
      <div>
        <div class="title">全年季节性轮动日历</div>
        <div class="subtitle">点击任意板块可直达历年叠加走势与月度胜率分析</div>
      </div>
      <div class="legend">
        <span class="leg buy"><i />低谷潜伏月</span>
        <span class="leg sell"><i />高峰兑现月</span>
        <span class="leg now"><i />当前 {{ currentMonth }} 月</span>
      </div>
    </div>

    <div class="matrix-scroll">
      <table class="cycle-table">
        <thead>
          <tr>
            <th class="col-sector">周期板块</th>
            <th
              v-for="m in months"
              :key="m"
              :class="{ 'is-current-col': m === currentMonth }"
            >
              {{ m }}月
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="sector in sectors"
            :key="sector.id"
            :class="{ active: sector.id === activeSectorId }"
            @click="emit('select', sector.id)"
          >
            <td class="sector-name-cell">
              <span class="sector-dot" :style="{ background: sector.color }" />
              <div>
                <div class="s-name">{{ sector.name }}</div>
                <div class="s-tag">{{ sector.tag }}</div>
              </div>
            </td>
            <td
              v-for="m in months"
              :key="m"
              class="month-cell"
              :class="{
                'is-current-col': m === currentMonth
              }"
            >
              <div class="pill" :class="getCellType(sector, m)">
                <template v-if="getCellType(sector, m) === 'buy'">潜伏</template>
                <template v-else-if="getCellType(sector, m) === 'sell'">兑现</template>
                <template v-else>·</template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.timeline-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.subtitle {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.legend {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #475569;
}

.leg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.leg i {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  display: inline-block;
}

.leg.buy i {
  background: #10b981;
}
.leg.sell i {
  background: #e11d48;
}
.leg.now i {
  background: #dbeafe;
  border: 1.5px solid #2563eb;
}

.matrix-scroll {
  overflow-x: auto;
}

.cycle-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 780px;
}

.cycle-table th {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  padding: 8px 4px;
  border-bottom: 1px solid #e2e8f0;
  text-align: center;
}

.cycle-table th.col-sector {
  text-align: left;
  padding-left: 8px;
  width: 190px;
}

.cycle-table th.is-current-col {
  color: #1d4ed8;
  background: #eff6ff;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.cycle-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.cycle-table tbody tr:hover {
  background: #f8fafc;
}

.cycle-table tbody tr.active {
  background: #f0f9ff;
}

.sector-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px solid #f1f5f9;
}

.sector-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.s-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.s-tag {
  font-size: 11px;
  color: #94a3b8;
}

.month-cell {
  padding: 6px 3px;
  text-align: center;
  border-bottom: 1px solid #f1f5f9;
}

.month-cell.is-current-col {
  background: rgba(239, 246, 255, 0.72);
}

.pill {
  height: 28px;
  line-height: 28px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.pill.buy {
  background: #d1fae5;
  color: #047857;
}

.pill.sell {
  background: #ffe4e6;
  color: #be123c;
}

.pill.normal {
  color: #cbd5e1;
}
</style>
