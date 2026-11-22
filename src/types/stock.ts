export type Market = 'sh' | 'sz' | 'bj'

/**
 * 紧凑日线数组：[date, open, close, high, low, volume, pct]
 */
export type KlineTuple = [
  date: string,
  open: number,
  close: number,
  high: number,
  low: number,
  volume: number,
  pct: number
]

export interface StockRef {
  symbol: string
  code: string
  market: Market
  name: string
}

export interface SectorConfig {
  id: string
  name: string
  tag: string
  color: string
  buyMonths: number[]
  sellMonths: number[]
  defaultCycleStartMonth: number
  logic: string
  stocks: StockRef[]
  isCustom?: boolean
}

export interface SectorsBundle {
  benchmarks: StockRef[]
  sectors: SectorConfig[]
}

export interface StockKlineFile {
  symbol: string
  code: string
  market: Market
  name: string
  source: string
  updatedAt: string
  fields: string[]
  rows: KlineTuple[]
}

export interface CachedStockKline extends StockKlineFile {
  cachedVersion: string
  isRemoteFetched?: boolean
}

export interface MetaStockEntry {
  symbol: string
  name: string
  source: string
  count: number
  firstDate: string
  lastDate: string
}

export interface DataMeta {
  version: string
  updatedAt: string
  latestTradeDate: string
  totalStocks: number
  failedCount: number
  stocks: MetaStockEntry[]
}

export interface RealtimeQuote {
  symbol: string
  code: string
  name: string
  price: number
  prevClose: number
  open: number
  high: number
  low: number
  volume: number
  amount: number
  change: number
  changePct: number
  turnover: number
  pe: number
  marketCap: number
  updatedAt: string
}

export interface StockNote {
  symbol: string
  buyTarget?: number | null
  sellTarget?: number | null
  note: string
  updatedAt: string
}
