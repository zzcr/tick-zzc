import type { KlineTuple, RealtimeQuote, SectorConfig } from '@/types/stock'

/**
 * 将实时行情点合并进日线数组（若今日尚未落盘则追加，已有则覆盖）
 */
export function mergeRealtimeIntoKline(
  rows: KlineTuple[],
  quote?: RealtimeQuote | null
): KlineTuple[] {
  if (!quote || !quote.price || quote.price <= 0) return rows
  const tradeDate = quote.updatedAt?.slice(0, 10)
  if (!tradeDate || !/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) return rows

  const liveTuple: KlineTuple = [
    tradeDate,
    quote.open || quote.price,
    quote.price,
    quote.high || quote.price,
    quote.low || quote.price,
    quote.volume || 0,
    quote.changePct
  ]

  if (rows.length === 0) return [liveTuple]
  const last = rows[rows.length - 1]
  if (last[0] === tradeDate) {
    return [...rows.slice(0, -1), liveTuple]
  }
  if (tradeDate > last[0]) {
    return [...rows, liveTuple]
  }
  return rows
}

/**
 * 合成板块等权指数（基准 100，基于每日等权涨跌幅累计，新上市个股自动平滑加入）
 */
export function buildSectorEqualWeightIndex(
  klineMap: Record<string, KlineTuple[]>,
  symbols: string[]
): KlineTuple[] {
  const dateReturns = new Map<string, number[]>()

  for (const sym of symbols) {
    const rows = klineMap[sym]
    if (!rows || rows.length < 2) continue
    for (let i = 1; i < rows.length; i++) {
      const prevClose = rows[i - 1][2]
      const close = rows[i][2]
      if (prevClose <= 0 || close <= 0) continue
      const pct = ((close - prevClose) / prevClose) * 100
      // 过滤极端新股首日暴涨失真
      if (Math.abs(pct) > 35) continue
      const date = rows[i][0]
      let bucket = dateReturns.get(date)
      if (!bucket) {
        bucket = []
        dateReturns.set(date, bucket)
      }
      bucket.push(pct)
    }
  }

  const sortedDates = Array.from(dateReturns.keys()).sort()
  if (sortedDates.length === 0) return []

  let nav = 100
  const result: KlineTuple[] = []
  for (const date of sortedDates) {
    const pcts = dateReturns.get(date)!
    const avgPct = pcts.reduce((s, v) => s + v, 0) / pcts.length
    const prevNav = nav
    nav = Number((nav * (1 + avgPct / 100)).toFixed(4))
    result.push([
      date,
      Number(prevNav.toFixed(2)),
      Number(nav.toFixed(2)),
      Number(Math.max(prevNav, nav).toFixed(2)),
      Number(Math.min(prevNav, nav).toFixed(2)),
      pcts.length,
      Number(avgPct.toFixed(2))
    ])
  }
  return result
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * 生成以 startMonth 为起点的 365 天标准化日历轴（如 startMonth=12 -> 12-01..12-31, 01-01..11-30）
 */
export function buildCycleAxisLabels(startMonth = 1): string[] {
  const labels: string[] = []
  for (let offset = 0; offset < 12; offset++) {
    const month = ((startMonth - 1 + offset) % 12) + 1
    const days = MONTH_DAYS[month - 1]
    const mm = String(month).padStart(2, '0')
    for (let d = 1; d <= days; d++) {
      labels.push(`${mm}-${String(d).padStart(2, '0')}`)
    }
  }
  return labels
}

export interface YearlyOverlaySeries {
  label: string
  cycleYear: number
  isCurrent: boolean
  values: (number | null)[]
  finalReturn: number | null
  maxGain: number | null
  maxDrawdown: number | null
}

export interface YearlyOverlayResult {
  xLabels: string[]
  series: YearlyOverlaySeries[]
  meanLine: (number | null)[]
  p25Line: (number | null)[]
  p75Line: (number | null)[]
  monthStartIndices: { month: number; startIdx: number; endIdx: number }[]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/**
 * 构建“历年横向叠加走势”数据
 * 支持自然年（startMonth = 1）和跨年周期（如体育 12月起、冰雪 7月起）
 */
export function buildYearlyOverlayData(
  rows: KlineTuple[],
  startMonth = 1
): YearlyOverlayResult {
  const xLabels = buildCycleAxisLabels(startMonth)
  const labelToIndex = new Map<string, number>()
  xLabels.forEach((lbl, idx) => labelToIndex.set(lbl, idx))

  // 计算每个月份在 X 轴上的起止索引（用于画低吸区/高抛区色带）
  const monthStartIndices: { month: number; startIdx: number; endIdx: number }[] = []
  let cursor = 0
  for (let offset = 0; offset < 12; offset++) {
    const month = ((startMonth - 1 + offset) % 12) + 1
    const days = MONTH_DAYS[month - 1]
    monthStartIndices.push({
      month,
      startIdx: cursor,
      endIdx: cursor + days - 1
    })
    cursor += days
  }

  // 将每条日线归类到对应周期年
  const cycleBuckets = new Map<number, { idx: number; close: number }[]>()
  for (const row of rows) {
    const [date, , close] = row
    if (!date || close <= 0) continue
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(5, 7))
    let mmdd = date.slice(5, 10)
    if (mmdd === '02-29') mmdd = '02-28'
    const xIdx = labelToIndex.get(mmdd)
    if (xIdx === undefined) continue

    const cycleYear = month >= startMonth ? year : year - 1
    let bucket = cycleBuckets.get(cycleYear)
    if (!bucket) {
      bucket = []
      cycleBuckets.set(cycleYear, bucket)
    }
    bucket.push({ idx: xIdx, close })
  }

  const sortedCycles = Array.from(cycleBuckets.keys()).sort((a, b) => a - b)
  const latestCycleYear = sortedCycles[sortedCycles.length - 1]

  const series: YearlyOverlaySeries[] = []

  for (const cy of sortedCycles) {
    const points = cycleBuckets.get(cy)!.sort((a, b) => a.idx - b.idx)
    if (points.length < 15 && cy !== latestCycleYear) continue

    const baseClose = points[0].close
    const firstIdx = points[0].idx
    const lastIdx = points[points.length - 1].idx

    const pointMap = new Map<number, number>()
    for (const p of points) {
      const ret = Number((((p.close - baseClose) / baseClose) * 100).toFixed(2))
      pointMap.set(p.idx, ret)
    }

    // 区间内非交易日前向填充，便于平滑展示与跨年对齐均值计算
    const values: (number | null)[] = new Array(xLabels.length).fill(null)
    let lastVal: number | null = null
    for (let i = firstIdx; i <= lastIdx; i++) {
      if (pointMap.has(i)) {
        lastVal = pointMap.get(i)!
      }
      values[i] = lastVal
    }

    let maxGain = -Infinity
    let peak = 0
    let maxDD = 0
    for (const p of points) {
      const ret = ((p.close - baseClose) / baseClose) * 100
      if (ret > maxGain) maxGain = ret
      const nav = p.close / baseClose
      if (nav > peak) peak = nav
      const dd = ((nav - peak) / peak) * 100
      if (dd < maxDD) maxDD = dd
    }

    const label =
      startMonth === 1 ? `${cy}年` : `${cy}→${String(cy + 1).slice(2)}周期`

    series.push({
      label,
      cycleYear: cy,
      isCurrent: cy === latestCycleYear,
      values,
      finalReturn: values[lastIdx],
      maxGain: Number.isFinite(maxGain) ? Number(maxGain.toFixed(2)) : null,
      maxDrawdown: Number(maxDD.toFixed(2))
    })
  }

  // 计算历年统计均值与 25%~75% 分位带（排除数据太少的当前未完结年，除非只有一年）
  const histSeries =
    series.length > 1 ? series.filter((s) => !s.isCurrent) : series
  const meanLine: (number | null)[] = []
  const p25Line: (number | null)[] = []
  const p75Line: (number | null)[] = []

  for (let i = 0; i < xLabels.length; i++) {
    const vals: number[] = []
    for (const s of histSeries) {
      const v = s.values[i]
      if (v !== null) vals.push(v)
    }
    if (vals.length === 0) {
      meanLine.push(null)
      p25Line.push(null)
      p75Line.push(null)
    } else {
      vals.sort((a, b) => a - b)
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      meanLine.push(Number(mean.toFixed(2)))
      p25Line.push(Number(percentile(vals, 0.25).toFixed(2)))
      p75Line.push(Number(percentile(vals, 0.75).toFixed(2)))
    }
  }

  return {
    xLabels,
    series,
    meanLine,
    p25Line,
    p75Line,
    monthStartIndices
  }
}

export interface MonthlyHeatmapSummary {
  month: number
  winRate: number
  avgReturn: number
  sampleCount: number
}

export interface MonthlyHeatmapResult {
  years: number[]
  /** [monthIndex (0..11), yearIndex, returnPct] */
  cells: [number, number, number | null][]
  monthlySummary: MonthlyHeatmapSummary[]
}

/**
 * 构建月度涨跌幅热力图与各月历史胜率统计
 */
export function buildMonthlyHeatmapData(rows: KlineTuple[]): MonthlyHeatmapResult {
  // 提取每个 YYYY-MM 的最后一个交易日收盘价
  const monthCloseMap = new Map<string, number>()
  for (const row of rows) {
    const ym = row[0].slice(0, 7)
    monthCloseMap.set(ym, row[2])
  }

  const sortedYms = Array.from(monthCloseMap.keys()).sort()
  if (sortedYms.length < 2) {
    return { years: [], cells: [], monthlySummary: [] }
  }

  const yearMonthReturn = new Map<string, number>()
  const yearSet = new Set<number>()

  for (let i = 1; i < sortedYms.length; i++) {
    const prevYm = sortedYms[i - 1]
    const currYm = sortedYms[i]
    const prevClose = monthCloseMap.get(prevYm)!
    const currClose = monthCloseMap.get(currYm)!
    if (prevClose > 0) {
      const ret = Number((((currClose - prevClose) / prevClose) * 100).toFixed(2))
      yearMonthReturn.set(currYm, ret)
      yearSet.add(Number(currYm.slice(0, 4)))
    }
  }

  const years = Array.from(yearSet).sort((a, b) => a - b)
  const cells: [number, number, number | null][] = []
  const monthBuckets: number[][] = Array.from({ length: 12 }, () => [])

  years.forEach((y, yIdx) => {
    for (let m = 1; m <= 12; m++) {
      const ym = `${y}-${String(m).padStart(2, '0')}`
      const val = yearMonthReturn.has(ym) ? yearMonthReturn.get(ym)! : null
      cells.push([m - 1, yIdx, val])
      if (val !== null) {
        monthBuckets[m - 1].push(val)
      }
    }
  })

  const monthlySummary: MonthlyHeatmapSummary[] = monthBuckets.map((bucket, idx) => {
    const count = bucket.length
    if (count === 0) {
      return { month: idx + 1, winRate: 0, avgReturn: 0, sampleCount: 0 }
    }
    const wins = bucket.filter((v) => v > 0).length
    const avg = bucket.reduce((a, b) => a + b, 0) / count
    return {
      month: idx + 1,
      winRate: Number(((wins / count) * 100).toFixed(0)),
      avgReturn: Number(avg.toFixed(2)),
      sampleCount: count
    }
  })

  return { years, cells, monthlySummary }
}

export interface MultiCompareItemStat {
  symbol: string
  name: string
  color: string
  totalReturn: number
  maxGain: number
  maxDrawdown: number
  latestClose: number
  priceRank1Y: number
  values: (number | null)[]
}

export interface MultiCompareResult {
  dates: string[]
  items: MultiCompareItemStat[]
}

/**
 * 计算单只标的近 1 年（约 250 个交易日）所处价格分位（0% = 近一年最低，100% = 近一年最高）
 */
export function calcPriceRank1Y(rows: KlineTuple[]): number {
  if (!rows || rows.length === 0) return 50
  const slice = rows.slice(-250)
  const latest = slice[slice.length - 1][2]
  let min = Infinity
  let max = -Infinity
  for (const r of slice) {
    if (r[4] < min) min = r[4]
    if (r[3] > max) max = r[3]
  }
  if (max <= min) return 50
  return Number((((latest - min) / (max - min)) * 100).toFixed(1))
}

/**
 * 构建多只股票/指数横向归一化对比数据
 */
export function buildMultiCompareData(
  targets: { symbol: string; name: string; color: string; rows: KlineTuple[] }[],
  startDate: string,
  endDate: string
): MultiCompareResult {
  const dateSet = new Set<string>()
  const filteredMaps = targets.map((t) => {
    const map = new Map<string, number>()
    for (const r of t.rows) {
      if (r[0] >= startDate && r[0] <= endDate) {
        dateSet.add(r[0])
        map.set(r[0], r[2])
      }
    }
    return map
  })

  const dates = Array.from(dateSet).sort()
  const items: MultiCompareItemStat[] = targets.map((t, idx) => {
    const map = filteredMaps[idx]
    let baseClose: number | null = null
    let lastVal: number | null = null
    let peakNav = 1
    let maxGain = 0
    let maxDD = 0
    const values: (number | null)[] = []

    for (const d of dates) {
      const close = map.get(d)
      if (close !== undefined && close > 0) {
        if (baseClose === null) baseClose = close
        const nav = close / baseClose
        const ret = Number(((nav - 1) * 100).toFixed(2))
        lastVal = ret
        if (ret > maxGain) maxGain = ret
        if (nav > peakNav) peakNav = nav
        const dd = ((nav - peakNav) / peakNav) * 100
        if (dd < maxDD) maxDD = dd
      }
      values.push(lastVal)
    }

    const latestClose = t.rows.length > 0 ? t.rows[t.rows.length - 1][2] : 0
    return {
      symbol: t.symbol,
      name: t.name,
      color: t.color,
      totalReturn: lastVal ?? 0,
      maxGain: Number(maxGain.toFixed(2)),
      maxDrawdown: Number(maxDD.toFixed(2)),
      latestClose,
      priceRank1Y: calcPriceRank1Y(t.rows),
      values
    }
  })

  return { dates, items }
}

export type OpportunityStage = 'buy' | 'pre-buy' | 'sell' | 'hold'

export interface SectorOpportunityCard {
  sector: SectorConfig
  stage: OpportunityStage
  stageLabel: string
  priceRank1Y: number
  ytdReturn: number
  bestBuyMonth: number
  bestSellMonth: number
  historicalWindowAvgReturn: number
  historicalWindowWinRate: number
  liveChangePct: number | null
}

/**
 * 综合评估板块在当前月份的季节性阶段 + 价格位置 + 历史窗口回测收益
 */
export function evaluateSectorOpportunity(
  sector: SectorConfig,
  indexRows: KlineTuple[],
  currentMonth: number,
  liveChangePct: number | null
): SectorOpportunityCard {
  const nextMonth = (currentMonth % 12) + 1
  let stage: OpportunityStage = 'hold'
  let stageLabel = '周期观察期'

  if (sector.buyMonths.includes(currentMonth)) {
    stage = 'buy'
    stageLabel = '历史低谷潜伏区'
  } else if (sector.sellMonths.includes(currentMonth)) {
    stage = 'sell'
    stageLabel = '历史高峰兑现区'
  } else if (sector.buyMonths.includes(nextMonth)) {
    stage = 'pre-buy'
    stageLabel = '临近潜伏窗口'
  }

  const priceRank1Y = calcPriceRank1Y(indexRows)

  // 计算今年以来涨跌幅
  let ytdReturn = 0
  if (indexRows.length > 0) {
    const latestYear = indexRows[indexRows.length - 1][0].slice(0, 4)
    const firstOfYear = indexRows.find((r) => r[0].startsWith(latestYear))
    const latest = indexRows[indexRows.length - 1]
    if (firstOfYear && firstOfYear[2] > 0) {
      ytdReturn = Number(
        (((latest[2] - firstOfYear[2]) / firstOfYear[2]) * 100).toFixed(2)
      )
    }
  }

  // 计算历年从“默认潜伏起始月”持有到“高峰月”的平均收益与胜率
  const overlay = buildYearlyOverlayData(indexRows, sector.defaultCycleStartMonth)
  const sellMonthSet = new Set(sector.sellMonths)
  const sellIndices: number[] = []
  for (const mInfo of overlay.monthStartIndices) {
    if (sellMonthSet.has(mInfo.month)) {
      sellIndices.push(mInfo.startIdx, mInfo.endIdx)
    }
  }
  const windowStartIdx = sellIndices.length > 0 ? Math.min(...sellIndices) : 120
  const windowEndIdx = sellIndices.length > 0 ? Math.max(...sellIndices) : 240

  const windowReturns: number[] = []
  for (const s of overlay.series) {
    if (s.isCurrent && overlay.series.length > 1) continue
    let bestInSellWindow = -Infinity
    for (let i = windowStartIdx; i <= windowEndIdx && i < s.values.length; i++) {
      const v = s.values[i]
      if (v !== null && v > bestInSellWindow) {
        bestInSellWindow = v
      }
    }
    if (Number.isFinite(bestInSellWindow)) {
      windowReturns.push(bestInSellWindow)
    }
  }

  const historicalWindowAvgReturn =
    windowReturns.length > 0
      ? Number(
          (
            windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length
          ).toFixed(1)
        )
      : 0
  const historicalWindowWinRate =
    windowReturns.length > 0
      ? Math.round(
          (windowReturns.filter((v) => v > 0).length / windowReturns.length) * 100
        )
      : 0

  return {
    sector,
    stage,
    stageLabel,
    priceRank1Y,
    ytdReturn,
    bestBuyMonth: sector.buyMonths[0] ?? 1,
    bestSellMonth: sector.sellMonths[sector.sellMonths.length - 1] ?? 6,
    historicalWindowAvgReturn,
    historicalWindowWinRate,
    liveChangePct
  }
}
