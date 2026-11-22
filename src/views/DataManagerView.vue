<script setup lang="ts">
import { ref } from 'vue'
import {
  TinyAlert,
  TinyButton,
  TinyDialogBox,
  TinyInput,
  TinyOption,
  TinySelect,
  TinyTag
} from '@opentiny/vue'
import { useStockStore } from '@/stores/stockStore'
import type { SectorConfig, StockRef } from '@/types/stock'

const store = useStockStore()

const targetSectorId = ref(store.sectors[0]?.id || '')
const newStockCode = ref('')
const newStockName = ref('')
const addingStock = ref(false)
const feedback = ref<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

// 新建/编辑板块弹窗
const sectorDialogVisible = ref(false)
const sectorForm = ref<SectorConfig>({
  id: '',
  name: '',
  tag: '',
  color: '#2563eb',
  buyMonths: [12, 1],
  sellMonths: [4, 5],
  defaultCycleStartMonth: 12,
  logic: '',
  stocks: []
})

// 导入导出弹窗
const exportDialogVisible = ref(false)
const configJsonText = ref('')

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}月`
}))

function setNotice(type: 'success' | 'error' | 'info', text: string) {
  feedback.value = { type, text }
}

async function handleAddStock() {
  if (!targetSectorId.value) {
    setNotice('error', '请先选择目标板块')
    return
  }
  if (!newStockCode.value.trim()) {
    setNotice('error', '请输入 6 位 A 股股票代码（如 300651 或 600519）')
    return
  }
  addingStock.value = true
  feedback.value = null
  try {
    const added = await store.addStockToSector(
      targetSectorId.value,
      newStockCode.value,
      newStockName.value
    )
    setNotice(
      'success',
      `已通过东方财富在线抓取 ${added.name}(${added.symbol}) 前复权日线并存入 IndexedDB！`
    )
    newStockCode.value = ''
    newStockName.value = ''
  } catch (err) {
    setNotice('error', err instanceof Error ? err.message : '添加失败')
  } finally {
    addingStock.value = false
  }
}

async function handleRefreshStockOnline(stock: StockRef) {
  try {
    const count = await store.refreshSingleStockFromOnline(stock)
    setNotice('success', `已在线更新 ${stock.name} (${stock.symbol})，共 ${count} 条前复权日线`)
  } catch (err) {
    setNotice('error', err instanceof Error ? err.message : '在线更新失败')
  }
}

function openCreateSector() {
  sectorForm.value = {
    id: `custom_${Date.now()}`,
    name: '',
    tag: '自定义周期题材',
    color: '#0891b2',
    buyMonths: [6, 7],
    sellMonths: [11, 12],
    defaultCycleStartMonth: 6,
    logic: '',
    stocks: [],
    isCustom: true
  }
  sectorDialogVisible.value = true
}

function openEditSector(sector: SectorConfig) {
  sectorForm.value = JSON.parse(JSON.stringify(sector))
  sectorDialogVisible.value = true
}

async function handleSaveSector() {
  if (!sectorForm.value.name.trim()) {
    setNotice('error', '请填写板块名称')
    return
  }
  await store.saveSector(sectorForm.value)
  targetSectorId.value = sectorForm.value.id
  sectorDialogVisible.value = false
  setNotice('success', `板块「${sectorForm.value.name}」已保存到 IndexedDB`)
}

function openExportDialog() {
  configJsonText.value = store.exportConfigJson()
  exportDialogVisible.value = true
}

async function handleImportJson() {
  try {
    await store.importConfigJson(configJsonText.value)
    exportDialogVisible.value = false
    setNotice('success', '配置 JSON 导入成功，已同步到 IndexedDB！')
  } catch (err) {
    setNotice('error', err instanceof Error ? err.message : '导入失败，请检查 JSON 格式')
  }
}

function copyExportJson() {
  navigator.clipboard?.writeText(configJsonText.value)
  setNotice('success', '已复制到剪贴板，可直接覆盖仓库中的 public/data/sectors.json')
}

async function handleClearCache() {
  await store.clearCacheAndReload()
  setNotice('success', '已清空 IndexedDB 缓存并从仓库静态数据重新同步')
}

async function handleResetDefault() {
  await store.resetToDefaultSectors()
  targetSectorId.value = store.sectors[0]?.id || ''
  setNotice('info', '已恢复为仓库内置的默认 6 大周期板块配置')
}
</script>

<template>
  <div class="manager-page">
    <tiny-alert
      v-if="feedback"
      :type="feedback.type"
      :description="feedback.text"
      closable
      @close="feedback = null"
    />

    <!-- 顶部两栏：在线抓股 + IndexedDB 状态 -->
    <div class="top-grid">
      <section class="panel-card">
        <h3>在线抓取任意 A 股加入观察池</h3>
        <p class="desc">
          输入 6 位 A 股代码，浏览器将直连东方财富 JSONP 接口抓取 2019 年至今前复权日线并永久缓存到你的浏览器 IndexedDB。
        </p>

        <div class="add-stock-form">
          <tiny-select v-model="targetSectorId" placeholder="选择所属板块" style="width: 170px">
            <tiny-option
              v-for="s in store.sectors"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </tiny-select>

          <tiny-input
            v-model="newStockCode"
            placeholder="代码如 300651 / 600519"
            style="width: 190px"
            @keyup.enter="handleAddStock"
          />

          <tiny-input
            v-model="newStockName"
            placeholder="名称(选填，自动识别)"
            style="width: 160px"
            @keyup.enter="handleAddStock"
          />

          <tiny-button type="primary" :loading="addingStock" @click="handleAddStock">
            在线抓取并添加
          </tiny-button>
        </div>
      </section>

      <section class="panel-card">
        <h3>IndexedDB 本地缓存 & 仓库同步</h3>
        <div class="db-stats">
          <div class="db-stat">
            <span>缓存 K 线股票</span>
            <b>{{ store.dbStats.klineCount }} 只</b>
          </div>
          <div class="db-stat">
            <span>总日线记录</span>
            <b>{{ store.dbStats.totalRows.toLocaleString() }} 条</b>
          </div>
          <div class="db-stat">
            <span>观察策略笔记</span>
            <b>{{ store.dbStats.noteCount }} 条</b>
          </div>
        </div>
        <div class="db-actions">
          <tiny-button size="small" type="primary" plain @click="openExportDialog">
            导出 / 导入 sectors.json
          </tiny-button>
          <tiny-button size="small" plain @click="handleClearCache">
            重刷仓库静态缓存
          </tiny-button>
          <tiny-button size="small" plain @click="handleResetDefault">
            恢复默认板块
          </tiny-button>
        </div>
      </section>
    </div>

    <!-- 板块与标的池维护 -->
    <section class="panel-card">
      <div class="section-head">
        <div>
          <h3>周期板块池配置</h3>
          <span class="desc">修改结果实时保存在浏览器 IndexedDB；导出 JSON 覆盖回仓库 public/data/sectors.json 后，GitHub Actions 每日收盘将自动抓取新标的</span>
        </div>
        <tiny-button type="primary" size="small" @click="openCreateSector">
          + 新增周期板块
        </tiny-button>
      </div>

      <div class="sector-list">
        <div v-for="s in store.sectors" :key="s.id" class="sector-manage-item">
          <div class="sm-head">
            <div class="sm-title">
              <span class="dot" :style="{ background: s.color }" />
              <b>{{ s.name }}</b>
              <tiny-tag size="mini" type="success">
                潜伏：{{ s.buyMonths.map((m) => `${m}月`).join('、') }}
              </tiny-tag>
              <tiny-tag size="mini" type="danger">
                兑现：{{ s.sellMonths.map((m) => `${m}月`).join('、') }}
              </tiny-tag>
            </div>
            <div class="sm-ops">
              <tiny-button size="mini" plain @click="openEditSector(s)">编辑周期</tiny-button>
              <tiny-button
                v-if="store.sectors.length > 1"
                size="mini"
                type="danger"
                plain
                @click="store.deleteSector(s.id)"
              >
                删除板块
              </tiny-button>
            </div>
          </div>

          <div class="sm-stocks">
            <div v-for="st in s.stocks" :key="st.symbol" class="stock-chip">
              <span>{{ st.name }} ({{ st.code }})</span>
              <small class="rows-count">
                {{ store.klineMap[st.symbol]?.rows.length || 0 }}日
              </small>
              <button
                class="chip-op refresh"
                title="在线补拉最新前复权日线"
                @click="handleRefreshStockOnline(st)"
              >
                ↻
              </button>
              <button
                class="chip-op remove"
                title="移出该板块"
                @click="store.removeStockFromSector(s.id, st.symbol)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 新增/编辑板块弹窗 -->
    <tiny-dialog-box
      v-model:visible="sectorDialogVisible"
      :title="sectorForm.name ? `编辑板块 · ${sectorForm.name}` : '新增自定义周期板块'"
      width="540px"
    >
      <div class="dialog-form">
        <div class="field-row">
          <label>板块名称</label>
          <tiny-input v-model="sectorForm.name" placeholder="例如：农业种业 / 电力高温 / 旅游免税" />
        </div>
        <div class="field-row">
          <label>周期标签</label>
          <tiny-input v-model="sectorForm.tag" placeholder="例如：一号文件 · 春耕催化" />
        </div>
        <div class="field-row two-col">
          <div>
            <label>历史低谷潜伏月（多选）</label>
            <tiny-select v-model="sectorForm.buyMonths" multiple style="width: 100%">
              <tiny-option
                v-for="m in monthOptions"
                :key="m.value"
                :label="m.label"
                :value="m.value"
              />
            </tiny-select>
          </div>
          <div>
            <label>历史高峰兑现月（多选）</label>
            <tiny-select v-model="sectorForm.sellMonths" multiple style="width: 100%">
              <tiny-option
                v-for="m in monthOptions"
                :key="m.value"
                :label="m.label"
                :value="m.value"
              />
            </tiny-select>
          </div>
        </div>
        <div class="field-row two-col">
          <div>
            <label>默认历年叠加起始月</label>
            <tiny-select v-model="sectorForm.defaultCycleStartMonth" style="width: 100%">
              <tiny-option
                v-for="m in monthOptions"
                :key="m.value"
                :label="`${m.value}月起`"
                :value="m.value"
              />
            </tiny-select>
          </div>
          <div>
            <label>主题色</label>
            <input v-model="sectorForm.color" type="color" class="color-picker" />
          </div>
        </div>
        <div class="field-row">
          <label>季节性催化逻辑说明</label>
          <tiny-input
            v-model="sectorForm.logic"
            type="textarea"
            :rows="3"
            placeholder="记录该板块为什么在这些月份容易见底和见顶..."
          />
        </div>
      </div>
      <template #footer>
        <tiny-button @click="sectorDialogVisible = false">取消</tiny-button>
        <tiny-button type="primary" @click="handleSaveSector">保存板块</tiny-button>
      </template>
    </tiny-dialog-box>

    <!-- 导出/导入 JSON 弹窗 -->
    <tiny-dialog-box
      v-model:visible="exportDialogVisible"
      title="导出 / 导入 sectors.json 配置"
      width="620px"
    >
      <p class="desc" style="margin-bottom: 10px">
        复制以下 JSON 覆盖项目里的 <code>public/data/sectors.json</code> 并推送到 GitHub，即可让自动定时脚本同步你的全部自选周期股；也可以粘贴已有 JSON 导入。
      </p>
      <tiny-input v-model="configJsonText" type="textarea" :rows="14" />
      <template #footer>
        <tiny-button @click="copyExportJson">复制 JSON</tiny-button>
        <tiny-button type="primary" @click="handleImportJson">导入并覆盖当前配置</tiny-button>
      </template>
    </tiny-dialog-box>
  </div>
</template>

<style scoped>
.manager-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.top-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}

@media (max-width: 1024px) {
  .top-grid {
    grid-template-columns: 1fr;
  }
}

.panel-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
}

.panel-card h3 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.desc {
  margin: 0;
  font-size: 12.5px;
  color: #64748b;
  line-height: 1.5;
}

.add-stock-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  align-items: center;
}

.db-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 12px 0;
}

.db-stat {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.db-stat span {
  font-size: 11px;
  color: #64748b;
}

.db-stat b {
  font-size: 16px;
  color: #0f172a;
}

.db-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.sector-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sector-manage-item {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f8fafc;
}

.sm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.sm-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
  color: #0f172a;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.sm-ops {
  display: flex;
  gap: 6px;
}

.sm-stocks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stock-chip {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 12.5px;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.rows-count {
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 4px;
}

.chip-op {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.chip-op.refresh {
  color: #2563eb;
}

.chip-op.remove {
  color: #e11d48;
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row label {
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
}

.field-row.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.color-picker {
  width: 60px;
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
}
</style>
