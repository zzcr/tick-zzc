<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TinyAlert, TinyButton, TinySwitch } from '@opentiny/vue'
import { useStockStore } from '@/stores/stockStore'
import DataManagerView from '@/views/DataManagerView.vue'
import RadarDashboard from '@/views/RadarDashboard.vue'
import SectorCycleView from '@/views/SectorCycleView.vue'
import StockCompareView from '@/views/StockCompareView.vue'

type TabKey = 'radar' | 'sector' | 'compare' | 'manager'

const store = useStockStore()
const activeTab = ref<TabKey>('radar')
const selectedSectorId = ref('sports')
const comparePresetSectorId = ref<string | undefined>(undefined)
const autoRefresh = ref(false)

let pollTimer: number | null = null

function handleOpenSector(sectorId: string) {
  selectedSectorId.value = sectorId
  activeTab.value = 'sector'
}

function handleCompareSector(sectorId: string) {
  comparePresetSectorId.value = sectorId
  activeTab.value = 'compare'
}

watch(autoRefresh, (enabled) => {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  if (enabled) {
    void store.refreshRealtime()
    pollTimer = window.setInterval(() => {
      void store.refreshRealtime()
    }, 30000)
  }
})

onMounted(() => {
  void store.init()
})

onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})
</script>

<template>
  <div class="app-shell">
    <header class="top-header">
      <div class="header-inner">
        <div class="brand" @click="activeTab = 'radar'">
          <div class="brand-logo">TZ</div>
          <div>
            <div class="brand-name">Tick-ZZC 周期选股</div>
            <div class="brand-sub">A股季节性规律 · 低谷潜伏 / 高峰兑现分析台</div>
          </div>
        </div>

        <nav class="nav-tabs">
          <button
            class="nav-item"
            :class="{ active: activeTab === 'radar' }"
            @click="activeTab = 'radar'"
          >
            周期雷达
          </button>
          <button
            class="nav-item"
            :class="{ active: activeTab === 'sector' }"
            @click="activeTab = 'sector'"
          >
            历年周期走势
          </button>
          <button
            class="nav-item"
            :class="{ active: activeTab === 'compare' }"
            @click="activeTab = 'compare'"
          >
            多股横向对比
          </button>
          <button
            class="nav-item"
            :class="{ active: activeTab === 'manager' }"
            @click="activeTab = 'manager'"
          >
            板块与数据
          </button>
        </nav>

        <div class="header-actions">
          <label class="auto-poll" title="每30秒自动拉取腾讯实时行情">
            <tiny-switch v-model="autoRefresh" mini />
            <span>30s轮询</span>
          </label>
          <tiny-button
            size="small"
            type="primary"
            plain
            :loading="store.realtimeLoading"
            @click="store.refreshRealtime()"
          >
            刷新实时行情
          </tiny-button>
        </div>
      </div>
    </header>

    <main class="main-container">
      <tiny-alert
        v-if="store.errorMsg"
        type="error"
        :description="store.errorMsg"
        style="margin-bottom: 16px"
      />

      <div v-if="store.initializing && !store.initialized" class="loading-box">
        <div class="spinner" />
        <div class="loading-title">正在同步本地历史前复权日线到 IndexedDB...</div>
        <div class="loading-sub">
          已完成 {{ store.initProgress.loaded }} / {{ store.initProgress.total }} 只标的
        </div>
      </div>

      <template v-else>
        <RadarDashboard
          v-show="activeTab === 'radar'"
          @open-sector="handleOpenSector"
          @compare-sector="handleCompareSector"
        />
        <SectorCycleView
          v-if="activeTab === 'sector'"
          v-model:sector-id="selectedSectorId"
          @compare-sector="handleCompareSector"
        />
        <StockCompareView
          v-if="activeTab === 'compare'"
          :preset-sector-id="comparePresetSectorId"
        />
        <DataManagerView v-if="activeTab === 'manager'" />
      </template>
    </main>

    <footer class="app-footer">
      <span>
        数据来源：仓库本地静态前复权日线（东方财富/腾讯）+ 盘中腾讯财经实时行情 + IndexedDB 本地持久化 · 历史季节性规律仅作研究参考，不构成投资建议
      </span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f1f5f9;
}

.top-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #e2e8f0;
}

.header-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: #ffffff;
  font-weight: 800;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.5px;
}

.brand-name {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}

.brand-sub {
  font-size: 11px;
  color: #64748b;
}

.nav-tabs {
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 10px;
}

.nav-item {
  border: none;
  background: transparent;
  padding: 7px 15px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-item:hover {
  color: #0f172a;
}

.nav-item.active {
  background: #ffffff;
  color: #2563eb;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-poll {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}

.main-container {
  flex: 1;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.loading-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 64px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.spinner {
  width: 34px;
  height: 34px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-title {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.loading-sub {
  font-size: 13px;
  color: #64748b;
}

.app-footer {
  text-align: center;
  padding: 16px 20px 24px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
