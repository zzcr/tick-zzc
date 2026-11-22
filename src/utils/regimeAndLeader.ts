import type { KlineTuple, RealtimeQuote, SectorConfig } from '@/types/stock'
import { calcPriceRank1Y } from '@/utils/cycleMath'

export type MarketRegimeType = 'bull' | 'sideways' | 'bear'

export interface CurrentMarketDiagnosis {
  latestDate: string
  close: number
  ma20: number
  ma60: number
  ma120: number
  ma250: number
  ytdReturn: number
  drawdownFrom1YHigh: number
  reboundFrom1YLow: number
  priceRank1Y: number
  regime: MarketRegimeType
  regimeLabel: string
  subLabel: string
  maAlignment: string
  outlookSummary: string
  actionRules: string[]
}

export interface RegimeBucketStat {
  regime: MarketRegimeType
  regimeLabel: string
  sampleCount: number
  avgMaxGain: number
  avgEndReturn: number
  avgAlpha: number
  winRate: number
  avgDrawdown: number
}

export interface SectorRegimeImpact {
  sector: SectorConfig
  stats: Record<MarketRegimeType, RegimeBucketStat>
  currentRegimeStat: RegimeBucketStat
  fitLevel: 'high' | 'medium' | 'caution'
  fitLabel: string
  yearlyRecords: {
    cycleYear: number
    regime: MarketRegimeType
    shReturn: number
    sectorEndReturn: number
    sectorMaxGain: number
    alpha: number
  }[]
}

export interface CycleLeaderYearRecord {
  cycleYear: number
  label: string
  top1Symbol: string
  top1Name: string
  top1Return: number
  top2Symbol: string
  top2Name: string
  top2Return: number
  sectorAvgReturn: number
  rankings: { symbol: string; name: string; maxRet: number; rank: number }[]
}

export interface SectorLeaderRotationStat {
  sector: SectorConfig
  records: CycleLeaderYearRecord[]
  totalTransitions: number
  repeatTop1Count: number
  repeatTop1Rate: number
  stayTop2Count: number
  stayTop2Rate: number
  prevLeaderNextAvgRank: number
  rotationStyle: 'high-rotation' | 'mixed' | 'persistent'
  rotationStyleLabel: string
  insight: string
}

export interface NextLeaderCandidate {
  symbol: string
  code: string
  name: string
  totalScore: number
  scores: {
    antiOverdraft: number // 0~25 轮动避高分
    lowPosition: number // 0~25 低位安全边际分
    elasticity: number // 0~20 市值与历史弹性分
    accumulation: number // 0~15 近期资金异动/相对强弱分
    seasonalDna: number // 0~15 历史季节性基因分
  }
  lastCycleRank: number | null
  lastCycleMaxGain: number | null
  priceRank1Y: number
  priceRank2Y: number
  marketCap: number | null
  volRatio20To120: number
  relStrength20D: number
  latestPrice: number
  tags: { text: string; type: 'good' | 'warn' | 'info' }[]
}

function calcMA(rows: KlineTuple[], period: number): number {
  if (rows.length === 0) return 0
  const slice = rows.slice(-period)
  return Number(
    (slice.reduce((sum, r) => sum + r[2], 0) / slice.length).toFixed(2)
  )
}

function calcPriceRankNDays(rows: KlineTuple[], days: number): number {
  if (!rows || rows.length === 0) return 50
  const slice = rows.slice(-days)
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
 * 诊断当前 A 股（基于上证指数）所处牛熊阶段与后续形势研判
 */
export function diagnoseCurrentMarket(
  shRows: KlineTuple[]
): CurrentMarketDiagnosis | null {
  if (!shRows || shRows.length < 60) return null
  const last = shRows[shRows.length - 1]
  const close = last[2]
  const ma20 = calcMA(shRows, 20)
  const ma60 = calcMA(shRows, 60)
  const ma120 = calcMA(shRows, 120)
  const ma250 = calcMA(shRows, 250)

  const latestYear = last[0].slice(0, 4)
  const firstYearRow = shRows.find((r) => r[0].startsWith(latestYear)) || shRows[0]
  const ytdReturn = Number(
    (((close - firstYearRow[2]) / firstYearRow[2]) * 100).toFixed(2)
  )

  const recent250 = shRows.slice(-250)
  const high1Y = Math.max(...recent250.map((r) => r[3]))
  const low1Y = Math.min(...recent250.map((r) => r[4]))
  const drawdownFrom1YHigh = Number(
    (((close - high1Y) / high1Y) * 100).toFixed(2)
  )
  const reboundFrom1YLow = Number(
    (((close - low1Y) / low1Y) * 100).toFixed(2)
  )
  const priceRank1Y = calcPriceRank1Y(shRows)

  let regime: MarketRegimeType = 'sideways'
  let regimeLabel = '结构震荡市'
  let subLabel = '均线粘合 · 存量轮动'
  let maAlignment = '均线交织'

  if (close > ma60 && ma60 > ma120 && close > ma250) {
    regime = 'bull'
    regimeLabel = '牛市 / 多头趋势'
    subLabel = '增量资金主导 · 主升浪环境'
    maAlignment = '多头排列（现价 > MA60 > MA120 > MA250）'
  } else if (close < ma60 && close < ma120 && close < ma250) {
    regime = 'bear'
    regimeLabel = '熊市 / 空头调整期'
    subLabel =
      drawdownFrom1YHigh <= -15 && priceRank1Y <= 25
        ? '深幅回调后接近阶段底部区'
        : '年线下方承压 · 存量博弈'
    maAlignment =
      ma60 < ma120 && ma120 < ma250
        ? '标准空头排列（现价 < MA60 < MA120 < MA250）'
        : '年线下方弱势运行'
  } else {
    regime = 'sideways'
    regimeLabel = '震荡分化市'
    subLabel = close >= ma250 ? '年线上方箱体震荡' : '年线附近修复筑底'
    maAlignment = close >= ma250 ? '年线支撑 · 中短均线震荡' : '年线压制 · 区间震荡'
  }

  let outlookSummary = ''
  let actionRules: string[] = []

  if (regime === 'bull') {
    outlookSummary = `上证指数目前站稳年线（${ma250}）上方，处于多头趋势。历史上牛市环境中，季节性题材不仅兑现胜率显著提升，而且冲高弹性往往放大 1.5~2 倍，主升浪容易超预期延长。`
    actionRules = [
      '仓位策略：可适当提高潜伏仓位（6~8成），季节性低谷回踩 MA20/MA60 即可分批介入。',
      '止盈纪律：高峰月不要过早清仓，采用移动止盈（跌破10日/20日线分批兑现），吃足牛市溢价。',
      '选股侧重：优先高弹性中小盘题材龙头（体育、冰雪、电影弹性往往跑赢权重）。'
    ]
  } else if (regime === 'bear') {
    const nearBottom = priceRank1Y <= 25
    outlookSummary = `上证指数当前（${close}）运行在 MA60（${ma60}）与年线 MA250（${ma250}）下方，年内回撤 ${drawdownFrom1YHigh}%，属于典型空头调整环境。${
      nearBottom
        ? '但当前已处于近1年 ' + priceRank1Y + '% 的低分位区，向下杀跌动能逐步衰减，后续更可能演绎“先磨底、后结构性反弹”的节奏。'
        : '短期仍需防范大盘拖累导致的“季节低谷更低”。'
    } 熊市中季节性规律依然存在，但表现为“高点下移、脉冲缩短、超额收益靠低吸成本”。`
    actionRules = [
      '入场纪律：绝不追高启动阳线！只在“潜伏月 + 个股近1年分位 < 30%”双重共振时分 3 批左侧低吸。',
      '收益预期：把牛市 50%+ 的预期下调至 15%~30% 波段目标，到达历史高峰月前段或脉冲放量时果断分批落袋。',
      '板块优选：优先配置熊市历史超额收益（Alpha）更稳的板块（如高股息煤炭、天然气、筹码极轻的小市值季节题材）。',
      '仓位风控：大盘未重新站上 MA60 前，单板块仓位控制在 20%~30%，严控总仓位防系统性杀跌。'
    ]
  } else {
    outlookSummary = `上证指数当前处于均线交织的震荡市（年内 ${ytdReturn >= 0 ? '+' : ''}${ytdReturn}%）。震荡市反而是“季节性日历策略”最舒服的温床：主线缺失时，资金最喜欢围绕固定时间节点的确定性题材（赛事、寒潮、档期）做波段轮动。`
    actionRules = [
      '核心节奏：严格执行“买在无人问津的潜伏月，卖在人声鼎沸的兑现月”，切忌恋战。',
      '轮动策略：震荡市资金喜新厌旧最明显，重点挖掘板块内上轮未涨透、低分位的补涨新龙头。',
      '仓位控制：维持 4~6 成滚动仓位，利用板块间错季轮动（如冬天兑现冰雪→切入12月低谷体育）提升资金效率。'
    ]
  }

  return {
    latestDate: last[0],
    close,
    ma20,
    ma60,
    ma120,
    ma250,
    ytdReturn,
    drawdownFrom1YHigh,
    reboundFrom1YLow,
    priceRank1Y,
    regime,
    regimeLabel,
    subLabel,
    maAlignment,
    outlookSummary,
    actionRules
  }
}

function getCycleWindowRange(
  sector: SectorConfig,
  cycleYear: number
): { startStr: string; endStr: string; sellSet: Set<number> } {
  const startM = sector.defaultCycleStartMonth || 1
  const minSell = Math.min(...sector.sellMonths)
  const maxSell = Math.max(...sector.sellMonths)
  const crossesYear = minSell < startM
  const endYear = crossesYear ? cycleYear + 1 : cycleYear
  // 如果 sellMonths 跨越 12月和1月，取跨年后最后一个兑现月
  const endMonth = crossesYear
    ? Math.max(...sector.sellMonths.filter((m) => m < startM))
    : maxSell
  return {
    startStr: `${cycleYear}-${String(startM).padStart(2, '0')}-01`,
    endStr: `${endYear}-${String(endMonth).padStart(2, '0')}-31`,
    sellSet: new Set(sector.sellMonths)
  }
}

function classifyPeriodRegime(shReturnPct: number): MarketRegimeType {
  if (shReturnPct >= 8) return 'bull'
  if (shReturnPct <= -6) return 'bear'
  return 'sideways'
}

const REGIME_LABELS: Record<MarketRegimeType, string> = {
  bull: '牛市环境',
  sideways: '震荡环境',
  bear: '熊市环境'
}

/**
 * 回测各周期板块在牛市 / 震荡市 / 熊市三种大盘环境下的季节性表现差异
 */
export function analyzeSectorRegimeImpact(
  sector: SectorConfig,
  sectorIndexRows: KlineTuple[],
  shRows: KlineTuple[],
  currentRegime: MarketRegimeType
): SectorRegimeImpact {
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
  const yearlyRecords: SectorRegimeImpact['yearlyRecords'] = []

  const buckets: Record<
    MarketRegimeType,
    { maxGains: number[]; endRets: number[]; alphas: number[]; dds: number[] }
  > = {
    bull: { maxGains: [], endRets: [], alphas: [], dds: [] },
    sideways: { maxGains: [], endRets: [], alphas: [], dds: [] },
    bear: { maxGains: [], endRets: [], alphas: [], dds: [] }
  }

  for (const cy of years) {
    const { startStr, endStr, sellSet } = getCycleWindowRange(sector, cy)
    const secSub = sectorIndexRows.filter((r) => r[0] >= startStr && r[0] <= endStr)
    const shSub = shRows.filter((r) => r[0] >= startStr && r[0] <= endStr)
    if (secSub.length < 25 || shSub.length < 25) continue

    const shStart = shSub[0][2]
    const shEnd = shSub[shSub.length - 1][2]
    const shRet = Number((((shEnd - shStart) / shStart) * 100).toFixed(2))
    const regime = classifyPeriodRegime(shRet)

    const base = secSub[0][2]
    const endClose = secSub[secSub.length - 1][2]
    const endRet = Number((((endClose - base) / base) * 100).toFixed(2))

    const sellSub = secSub.filter((r) => sellSet.has(Number(r[0].slice(5, 7))))
    const targetSub = sellSub.length > 0 ? sellSub : secSub
    const maxClose = Math.max(...targetSub.map((r) => r[2]))
    const maxGain = Number((((maxClose - base) / base) * 100).toFixed(2))

    let peak = base
    let maxDD = 0
    for (const r of secSub) {
      if (r[2] > peak) peak = r[2]
      const dd = ((r[2] - peak) / peak) * 100
      if (dd < maxDD) maxDD = dd
    }

    const alpha = Number((maxGain - shRet).toFixed(2))

    yearlyRecords.push({
      cycleYear: cy,
      regime,
      shReturn: shRet,
      sectorEndReturn: endRet,
      sectorMaxGain: maxGain,
      alpha
    })

    buckets[regime].maxGains.push(maxGain)
    buckets[regime].endRets.push(endRet)
    buckets[regime].alphas.push(alpha)
    buckets[regime].dds.push(Number(maxDD.toFixed(2)))
  }

  const avg = (arr: number[]) =>
    arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0

  const buildStat = (r: MarketRegimeType): RegimeBucketStat => {
    const b = buckets[r]
    const wins = b.maxGains.filter((v) => v > 0).length
    return {
      regime: r,
      regimeLabel: REGIME_LABELS[r],
      sampleCount: b.maxGains.length,
      avgMaxGain: avg(b.maxGains),
      avgEndReturn: avg(b.endRets),
      avgAlpha: avg(b.alphas),
      winRate: b.maxGains.length ? Math.round((wins / b.maxGains.length) * 100) : 0,
      avgDrawdown: avg(b.dds)
    }
  }

  const stats: Record<MarketRegimeType, RegimeBucketStat> = {
    bull: buildStat('bull'),
    sideways: buildStat('sideways'),
    bear: buildStat('bear')
  }

  const curr = stats[currentRegime]
  let fitLevel: 'high' | 'medium' | 'caution' = 'medium'
  let fitLabel = '中等适配 · 精选低位'

  if (curr.sampleCount === 0) {
    fitLevel = 'medium'
    fitLabel = '样本较少 · 参考震荡'
  } else if (curr.avgMaxGain >= 18 && curr.avgAlpha >= 10) {
    fitLevel = 'high'
    fitLabel = '当前环境高适配'
  } else if (curr.avgMaxGain < 8 || curr.winRate < 50) {
    fitLevel = 'caution'
    fitLabel = '弱势敏感 · 严控仓位'
  }

  return {
    sector,
    stats,
    currentRegimeStat: curr,
    fitLevel,
    fitLabel,
    yearlyRecords
  }
}

/**
 * 回测单一板块历年“龙头连庄率 vs 轮动换龙规律”
 */
export function analyzeSectorLeaderRotation(
  sector: SectorConfig,
  klineMap: Record<string, KlineTuple[]>
): SectorLeaderRotationStat {
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
  const records: CycleLeaderYearRecord[] = []

  for (const cy of years) {
    const { startStr, endStr, sellSet } = getCycleWindowRange(sector, cy)
    const rawRanks: { symbol: string; name: string; maxRet: number }[] = []

    for (const st of sector.stocks) {
      const rows = klineMap[st.symbol] || []
      const sub = rows.filter((r) => r[0] >= startStr && r[0] <= endStr)
      if (sub.length < 20) continue
      const base = sub[0][2]
      if (base <= 0) continue
      const sellSub = sub.filter((r) => sellSet.has(Number(r[0].slice(5, 7))))
      const targetSub = sellSub.length > 0 ? sellSub : sub
      const maxClose = Math.max(...targetSub.map((r) => r[2]))
      const maxRet = Number((((maxClose - base) / base) * 100).toFixed(1))
      rawRanks.push({ symbol: st.symbol, name: st.name, maxRet })
    }

    if (rawRanks.length < 2) continue
    rawRanks.sort((a, b) => b.maxRet - a.maxRet)
    const rankings = rawRanks.map((r, i) => ({ ...r, rank: i + 1 }))
    const avgRet = Number(
      (rawRanks.reduce((s, r) => s + r.maxRet, 0) / rawRanks.length).toFixed(1)
    )

    records.push({
      cycleYear: cy,
      label:
        sector.defaultCycleStartMonth === 1
          ? `${cy}年`
          : `${cy}→${String(cy + 1).slice(2)}周期`,
      top1Symbol: rankings[0].symbol,
      top1Name: rankings[0].name,
      top1Return: rankings[0].maxRet,
      top2Symbol: rankings[1]?.symbol || '',
      top2Name: rankings[1]?.name || '',
      top2Return: rankings[1]?.maxRet || 0,
      sectorAvgReturn: avgRet,
      rankings
    })
  }

  let totalTransitions = 0
  let repeatTop1Count = 0
  let stayTop2Count = 0
  const nextRanks: number[] = []

  for (let i = 1; i < records.length; i++) {
    const prevTop1 = records[i - 1].top1Symbol
    const found = records[i].rankings.find((r) => r.symbol === prevTop1)
    if (!found) continue
    totalTransitions++
    nextRanks.push(found.rank)
    if (found.rank === 1) repeatTop1Count++
    if (found.rank <= 2) stayTop2Count++
  }

  const repeatTop1Rate = totalTransitions
    ? Number(((repeatTop1Count / totalTransitions) * 100).toFixed(1))
    : 0
  const stayTop2Rate = totalTransitions
    ? Number(((stayTop2Count / totalTransitions) * 100).toFixed(1))
    : 0
  const prevLeaderNextAvgRank = nextRanks.length
    ? Number((nextRanks.reduce((a, b) => a + b, 0) / nextRanks.length).toFixed(1))
    : 0

  let rotationStyle: 'high-rotation' | 'mixed' | 'persistent' = 'mixed'
  let rotationStyleLabel = '适度轮动型'
  let insight = ''

  if (repeatTop1Rate <= 20) {
    rotationStyle = 'high-rotation'
    rotationStyleLabel = '强换龙轮动型（慎追旧龙）'
    insight = `该板块历年龙头连庄率仅 ${repeatTop1Rate}%，上轮总龙次年平均掉至第 ${prevLeaderNextAvgRank} 名。典型“筹码轮动”特征：今年涨最猛的票套牢盘和预期透支最重，下一年应重点从今年排名靠后、筹码干净的新标的中掘金。`
  } else if (repeatTop1Rate >= 40) {
    rotationStyle = 'persistent'
    rotationStyleLabel = '主线龙头延续型'
    insight = `该板块龙头连庄率达 ${repeatTop1Rate}%（保持前二概率 ${stayTop2Rate}%），往往受核心大订单、并购重组或高股息护城河驱动。龙头只要估值与位置不过度泡沫化，次年仍可能维持强势。`
  } else {
    rotationStyle = 'mixed'
    rotationStyleLabel = '龙头与补涨交替型'
    insight = `该板块龙头连庄率 ${repeatTop1Rate}%，保持前二概率 ${stayTop2Rate}%。策略上可“1只核心老龙头 + 1只低位小市值补涨新龙”组合配置，平衡确定性与弹性。`
  }

  return {
    sector,
    records,
    totalTransitions,
    repeatTop1Count,
    repeatTop1Rate,
    stayTop2Count,
    stayTop2Rate,
    prevLeaderNextAvgRank,
    rotationStyle,
    rotationStyleLabel,
    insight
  }
}

/**
 * 下一轮周期潜在龙头 5 维量化打分模型（满分 100）
 */
export function scoreNextCycleLeaders(
  sector: SectorConfig,
  klineMap: Record<string, KlineTuple[]>,
  realtimeMap: Record<string, RealtimeQuote>,
  rotationStat: SectorLeaderRotationStat
): NextLeaderCandidate[] {
  const latestRecord = rotationStat.records[rotationStat.records.length - 1]
  const isHighRotation = rotationStat.rotationStyle === 'high-rotation'

  // 先计算板块近20日平均涨跌幅，用于衡量个股相对强弱
  const stock20DReturns: Record<string, number> = {}
  for (const st of sector.stocks) {
    const rows = klineMap[st.symbol] || []
    if (rows.length >= 21) {
      const cNow = rows[rows.length - 1][2]
      const c20 = rows[rows.length - 21][2]
      stock20DReturns[st.symbol] = c20 > 0 ? ((cNow - c20) / c20) * 100 : 0
    } else {
      stock20DReturns[st.symbol] = 0
    }
  }
  const avg20D =
    sector.stocks.length > 0
      ? Object.values(stock20DReturns).reduce((a, b) => a + b, 0) /
        sector.stocks.length
      : 0

  const candidates: NextLeaderCandidate[] = sector.stocks.map((st) => {
    const rows = klineMap[st.symbol] || []
    const quote = realtimeMap[st.symbol]
    const latestPrice = quote?.price || rows[rows.length - 1]?.[2] || 0
    const marketCap = quote?.marketCap && quote.marketCap > 0 ? quote.marketCap : null

    const priceRank1Y = calcPriceRankNDays(rows, 250)
    const priceRank2Y = calcPriceRankNDays(rows, 500)

    const lastRankObj = latestRecord?.rankings.find((r) => r.symbol === st.symbol)
    const lastCycleRank = lastRankObj?.rank ?? null
    const lastCycleMaxGain = lastRankObj?.maxRet ?? null
    const totalRanked = latestRecord?.rankings.length || sector.stocks.length

    // 1. 轮动避高分（0~25）：强轮动板块里，上轮不是第1名反而更容易在下一轮夺冠
    let antiOverdraft = 14
    if (lastCycleRank !== null) {
      if (isHighRotation) {
        if (lastCycleRank === 1) {
          antiOverdraft = 6 // 上轮总龙，历史连庄率极低，降权防接盘
        } else if (lastCycleRank >= Math.ceil(totalRanked * 0.6)) {
          antiOverdraft = 24 // 上轮滞涨/休整充分，下一轮换龙潜力大
        } else {
          antiOverdraft = 18
        }
      } else if (rotationStat.rotationStyle === 'persistent') {
        antiOverdraft = lastCycleRank <= 2 ? 22 : 14
      } else {
        antiOverdraft = lastCycleRank === 1 ? 11 : lastCycleRank >= 3 ? 21 : 17
      }
    }
    if (lastCycleMaxGain !== null && lastCycleMaxGain > 120 && isHighRotation) {
      antiOverdraft = Math.max(4, antiOverdraft - 4)
    }

    // 2. 低位安全边际分（0~25）：结合 1年与2年价格分位，越低越安全
    const blendedRank = priceRank1Y * 0.65 + priceRank2Y * 0.35
    const lowPosition = Math.round(
      Math.max(2, Math.min(25, ((100 - blendedRank) / 100) * 25))
    )

    // 3. 市值与历史弹性分（0~20）
    let elasticity = 12
    const isThemeSector = ['sports', 'ice_snow', 'movie', 'natural_gas'].includes(
      sector.id
    )
    if (marketCap !== null) {
      if (isThemeSector) {
        if (marketCap >= 20 && marketCap <= 80) elasticity = 20
        else if (marketCap < 20 || (marketCap > 80 && marketCap <= 150)) elasticity = 16
        else if (marketCap <= 300) elasticity = 11
        else elasticity = 7
      } else {
        // 煤炭/军工等大周期板块，中大市值机构定价权更强
        if (marketCap >= 150 && marketCap <= 1200) elasticity = 17
        else elasticity = 13
      }
    }

    // 4. 近期资金吸筹 / 相对强弱分（0~15）
    const vol20 =
      rows.length >= 20
        ? rows.slice(-20).reduce((s, r) => s + r[5], 0) / 20
        : 0
    const vol120 =
      rows.length >= 120
        ? rows.slice(-120).reduce((s, r) => s + r[5], 0) / 120
        : vol20 || 1
    const volRatio20To120 = vol120 > 0 ? Number((vol20 / vol120).toFixed(2)) : 1
    const relStrength20D = Number((stock20DReturns[st.symbol] - avg20D).toFixed(2))

    let accumulation = 7
    // 温和放量（1.1~2.2倍）且未暴涨追高，视作潜伏吸筹信号
    if (volRatio20To120 >= 1.1 && volRatio20To120 <= 2.3 && priceRank1Y < 65) {
      accumulation += 4
    } else if (volRatio20To120 > 2.8 && priceRank1Y > 75) {
      accumulation -= 3 // 高位巨量警惕出货
    }
    if (relStrength20D >= 1 && relStrength20D <= 12) {
      accumulation += 4
    } else if (relStrength20D < -6) {
      accumulation -= 2
    }
    accumulation = Math.max(1, Math.min(15, Math.round(accumulation)))

    // 5. 历史季节性基因分（0~15）：统计该股在历史各轮窗口中的平均冲高能力与夺冠/前二次数
    const histPerf = rotationStat.records
      .map((rec) => rec.rankings.find((r) => r.symbol === st.symbol))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
    const avgHistGain = histPerf.length
      ? histPerf.reduce((s, x) => s + x.maxRet, 0) / histPerf.length
      : 0
    const top2Times = histPerf.filter((x) => x.rank <= 2).length
    let seasonalDna = Math.round(
      Math.min(10, Math.max(2, avgHistGain / 8)) + Math.min(5, top2Times * 2)
    )
    seasonalDna = Math.max(2, Math.min(15, seasonalDna))

    const totalScore =
      antiOverdraft + lowPosition + elasticity + accumulation + seasonalDna

    const tags: NextLeaderCandidate['tags'] = []
    if (priceRank1Y <= 30) {
      tags.push({ text: '近1年低位筹码干净', type: 'good' })
    } else if (priceRank1Y >= 75) {
      tags.push({ text: '处于近1年高位谨防追高', type: 'warn' })
    }
    if (lastCycleRank === 1 && isHighRotation) {
      tags.push({ text: '上轮总龙·历史难连庄', type: 'warn' })
    } else if (lastCycleRank !== null && lastCycleRank >= 3 && isHighRotation) {
      tags.push({ text: '上轮休整充分·具换龙潜质', type: 'good' })
    }
    if (isThemeSector && marketCap !== null && marketCap <= 80) {
      tags.push({ text: `小盘高弹性(${marketCap.toFixed(0)}亿)`, type: 'good' })
    }
    if (volRatio20To120 >= 1.15 && volRatio20To120 <= 2.3 && priceRank1Y < 65) {
      tags.push({ text: `温和放量(${volRatio20To120}x)`, type: 'info' })
    }
    if (relStrength20D >= 2) {
      tags.push({ text: `近20日强于板块+${relStrength20D}%`, type: 'info' })
    }

    return {
      symbol: st.symbol,
      code: st.code,
      name: st.name,
      totalScore,
      scores: {
        antiOverdraft,
        lowPosition,
        elasticity,
        accumulation,
        seasonalDna
      },
      lastCycleRank,
      lastCycleMaxGain,
      priceRank1Y,
      priceRank2Y,
      marketCap,
      volRatio20To120,
      relStrength20D,
      latestPrice,
      tags
    }
  })

  return candidates.sort((a, b) => b.totalScore - a.totalScore)
}
