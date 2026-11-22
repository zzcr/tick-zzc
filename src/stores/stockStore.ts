import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  fetchEastmoneyKlineJsonp,
  fetchLocalKline,
  fetchLocalMeta,
  fetchLocalSectors,
  normalizeStockInput
} from '@/api/stockDataApi'
import { fetchTencentRealtimeQuotes } from '@/api/tencentRealtime'
import { stockDb } from '@/db/stockDb'
import type {
  DataMeta,
  KlineTuple,
  RealtimeQuote,
  SectorConfig,
  StockKlineFile,
  StockNote,
  StockRef
} from '@/types/stock'
import {
  buildSectorEqualWeightIndex,
  evaluateSectorOpportunity,
  mergeRealtimeIntoKline,
  type SectorOpportunityCard
} from '@/utils/cycleMath'

export const useStockStore = defineStore('stock', () => {
  const benchmarks = ref<StockRef[]>([])
  const defaultSectors = ref<SectorConfig[]>([])
  const sectors = ref<SectorConfig[]>([])
  const meta = ref<DataMeta | null>(null)
  const klineMap = ref<Record<string, StockKlineFile>>({})
  const realtimeMap = ref<Record<string, RealtimeQuote>>({})
  const notesMap = ref<Record<string, StockNote>>({})

  const initializing = ref(false)
  const initialized = ref(false)
  const initProgress = ref({ loaded: 0, total: 0 })
  const realtimeLoading = ref(false)
  const lastRealtimeAt = ref('')
  const errorMsg = ref('')

  const dbStats = ref({
    klineCount: 0,
    customSectorCount: 0,
    noteCount: 0,
    totalRows: 0
  })

  const allStockRefs = computed<StockRef[]>(() => {
    const map = new Map<string, StockRef>()
    for (const b of benchmarks.value) map.set(b.symbol, b)
    for (const s of sectors.value) {
      for (const st of s.stocks) map.set(st.symbol, st)
    }
    return Array.from(map.values())
  })

  function getMergedRows(symbol: string): KlineTuple[] {
    const base = klineMap.value[symbol]?.rows || []
    return mergeRealtimeIntoKline(base, realtimeMap.value[symbol])
  }

  function getSectorIndexRows(sectorId: string): KlineTuple[] {
    const sector = sectors.value.find((s) => s.id === sectorId)
    if (!sector) return []
    const merged: Record<string, KlineTuple[]> = {}
    for (const st of sector.stocks) {
      merged[st.symbol] = getMergedRows(st.symbol)
    }
    return buildSectorEqualWeightIndex(
      merged,
      sector.stocks.map((s) => s.symbol)
    )
  }

  function getSectorLiveChangePct(sector: SectorConfig): number | null {
    const vals: number[] = []
    for (const st of sector.stocks) {
      const q = realtimeMap.value[st.symbol]
      if (q && Number.isFinite(q.changePct) && q.price > 0) {
        vals.push(q.changePct)
      }
    }
    if (vals.length === 0) return null
    return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
  }

  const opportunityCards = computed<SectorOpportunityCard[]>(() => {
    const currentMonth = new Date().getMonth() + 1
    return sectors.value.map((sector) => {
      const idxRows = getSectorIndexRows(sector.id)
      const livePct = getSectorLiveChangePct(sector)
      return evaluateSectorOpportunity(sector, idxRows, currentMonth, livePct)
    })
  })

  async function refreshDbStats() {
    dbStats.value = await stockDb.getStorageStats()
  }

  async function loadKlineForStock(
    stock: StockRef,
    targetVersion: string
  ): Promise<void> {
    const cached = await stockDb.getKline(stock.symbol)
    if (
      cached &&
      cached.rows.length > 0 &&
      (cached.isRemoteFetched || cached.cachedVersion === targetVersion)
    ) {
      klineMap.value[stock.symbol] = cached
      return
    }

    const localData = await fetchLocalKline(stock.symbol)
    if (localData && localData.rows.length > 0) {
      klineMap.value[stock.symbol] = localData
      await stockDb.putKline({
        ...localData,
        cachedVersion: targetVersion
      })
      return
    }

    if (cached && cached.rows.length > 0) {
      klineMap.value[stock.symbol] = cached
      return
    }

    // 若本地静态文件不存在（例如用户自定义新增的股），尝试东财 JSONP 补拉
    try {
      const remoteData = await fetchEastmoneyKlineJsonp(stock)
      klineMap.value[stock.symbol] = remoteData
      await stockDb.putKline({
        ...remoteData,
        cachedVersion: targetVersion,
        isRemoteFetched: true
      })
    } catch {
      // 静默跳过单只拉取失败，避免阻塞初始化
    }
  }

  async function init() {
    if (initializing.value || initialized.value) return
    initializing.value = true
    errorMsg.value = ''

    try {
      const [bundle, metaInfo, customSectors, notes, snapshot] = await Promise.all([
        fetchLocalSectors(),
        fetchLocalMeta(),
        stockDb.getAllCustomSectors(),
        stockDb.getAllNotes(),
        stockDb.getRealtimeSnapshot()
      ])

      benchmarks.value = bundle.benchmarks || []
      defaultSectors.value = bundle.sectors || []
      meta.value = metaInfo

      if (customSectors.length > 0) {
        sectors.value = customSectors
      } else {
        sectors.value = structuredClone(bundle.sectors || [])
      }

      const noteObj: Record<string, StockNote> = {}
      for (const n of notes) noteObj[n.symbol] = n
      notesMap.value = noteObj

      if (snapshot?.quotes) {
        realtimeMap.value = snapshot.quotes
        lastRealtimeAt.value = snapshot.updatedAt
      }

      const targetVersion = metaInfo?.version || 'local-v1'
      const stocks = allStockRefs.value
      initProgress.value = { loaded: 0, total: stocks.length }

      // 并发分批加载 K 线（优先命中 IndexedDB，其次读取静态 JSON）
      const batchSize = 6
      for (let i = 0; i < stocks.length; i += batchSize) {
        const chunk = stocks.slice(i, i + batchSize)
        await Promise.all(
          chunk.map(async (st) => {
            await loadKlineForStock(st, targetVersion)
            initProgress.value.loaded++
          })
        )
      }

      initialized.value = true
      await refreshDbStats()

      // 异步拉取最新实时行情（不阻塞首屏渲染）
      void refreshRealtime()
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : '初始化数据失败'
    } finally {
      initializing.value = false
    }
  }

  async function refreshRealtime() {
    if (realtimeLoading.value) return
    realtimeLoading.value = true
    try {
      const symbols = allStockRefs.value.map((s) => s.symbol)
      const quotes = await fetchTencentRealtimeQuotes(symbols)
      if (Object.keys(quotes).length > 0) {
        realtimeMap.value = { ...realtimeMap.value, ...quotes }
        lastRealtimeAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
        await stockDb.saveRealtimeSnapshot(realtimeMap.value)
      }
    } finally {
      realtimeLoading.value = false
    }
  }

  async function addStockToSector(
    sectorId: string,
    rawInput: string,
    customName?: string
  ): Promise<StockRef> {
    const parsed = normalizeStockInput(rawInput)
    if (!parsed) {
      throw new Error('股票代码格式错误，请输入6位数字（如 300651 或 sh605299）')
    }
    const sector = sectors.value.find((s) => s.id === sectorId)
    if (!sector) throw new Error('目标板块不存在')
    if (sector.stocks.some((s) => s.symbol === parsed.symbol)) {
      throw new Error(`${parsed.symbol} 已在该板块中`)
    }

    let klineData = klineMap.value[parsed.symbol]
    if (!klineData) {
      const local = await fetchLocalKline(parsed.symbol)
      if (local) {
        klineData = local
      } else {
        klineData = await fetchEastmoneyKlineJsonp({
          ...parsed,
          name: customName || parsed.symbol
        })
      }
      klineMap.value[parsed.symbol] = klineData
      await stockDb.putKline({
        ...klineData,
        cachedVersion: meta.value?.version || 'remote-v1',
        isRemoteFetched: klineData.source === 'eastmoney-jsonp'
      })
    }

    const stockRef: StockRef = {
      symbol: parsed.symbol,
      code: parsed.code,
      market: parsed.market,
      name: customName?.trim() || klineData.name || parsed.symbol
    }
    sector.stocks.push(stockRef)
    await persistAllSectors()
    await refreshDbStats()
    void refreshRealtime()
    return stockRef
  }

  async function removeStockFromSector(sectorId: string, symbol: string) {
    const sector = sectors.value.find((s) => s.id === sectorId)
    if (!sector) return
    sector.stocks = sector.stocks.filter((s) => s.symbol !== symbol)
    await persistAllSectors()
  }

  async function saveSector(sector: SectorConfig) {
    const idx = sectors.value.findIndex((s) => s.id === sector.id)
    const cloned = JSON.parse(JSON.stringify(sector)) as SectorConfig
    if (idx >= 0) {
      sectors.value[idx] = cloned
    } else {
      sectors.value.push({ ...cloned, isCustom: true })
    }
    await persistAllSectors()
    await refreshDbStats()
  }

  async function deleteSector(sectorId: string) {
    sectors.value = sectors.value.filter((s) => s.id !== sectorId)
    await persistAllSectors()
    await refreshDbStats()
  }

  async function persistAllSectors() {
    await stockDb.saveAllCustomSectors(sectors.value)
  }

  async function resetToDefaultSectors() {
    sectors.value = JSON.parse(JSON.stringify(defaultSectors.value)) as SectorConfig[]
    await stockDb.saveAllCustomSectors([])
    await refreshDbStats()
  }

  async function saveStockNote(note: StockNote) {
    const payload: StockNote = {
      ...note,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false })
    }
    notesMap.value[note.symbol] = payload
    await stockDb.saveNote(payload)
    await refreshDbStats()
  }

  async function refreshSingleStockFromOnline(stock: StockRef) {
    const remoteData = await fetchEastmoneyKlineJsonp(stock)
    klineMap.value[stock.symbol] = remoteData
    await stockDb.putKline({
      ...remoteData,
      cachedVersion: meta.value?.version || 'remote-v1',
      isRemoteFetched: true
    })
    await refreshDbStats()
    return remoteData.rows.length
  }

  async function clearCacheAndReload() {
    await stockDb.clearKlineCache()
    klineMap.value = {}
    initialized.value = false
    await init()
  }

  function exportConfigJson(): string {
    return JSON.stringify(
      {
        benchmarks: benchmarks.value,
        sectors: sectors.value
      },
      null,
      2
    )
  }

  async function importConfigJson(rawText: string) {
    const parsed = JSON.parse(rawText)
    if (!Array.isArray(parsed.sectors)) {
      throw new Error('JSON 格式不正确，缺少 sectors 数组')
    }
    sectors.value = parsed.sectors
    await persistAllSectors()
    const targetVersion = meta.value?.version || 'local-v1'
    for (const st of allStockRefs.value) {
      if (!klineMap.value[st.symbol]) {
        await loadKlineForStock(st, targetVersion)
      }
    }
    await refreshDbStats()
    void refreshRealtime()
  }

  return {
    benchmarks,
    sectors,
    meta,
    klineMap,
    realtimeMap,
    notesMap,
    initializing,
    initialized,
    initProgress,
    realtimeLoading,
    lastRealtimeAt,
    errorMsg,
    dbStats,
    allStockRefs,
    opportunityCards,
    init,
    refreshRealtime,
    getMergedRows,
    getSectorIndexRows,
    getSectorLiveChangePct,
    addStockToSector,
    removeStockFromSector,
    saveSector,
    deleteSector,
    resetToDefaultSectors,
    saveStockNote,
    refreshSingleStockFromOnline,
    clearCacheAndReload,
    exportConfigJson,
    importConfigJson
  }
})
