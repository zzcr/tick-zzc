import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const KLINE_DIR = path.join(DATA_DIR, 'kline')
const SECTORS_FILE = path.join(DATA_DIR, 'sectors.json')
const META_FILE = path.join(DATA_DIR, 'meta.json')

const START_DATE = '20190101'
const CONCURRENCY = 3

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toEastmoneySecid(symbol) {
  const market = symbol.slice(0, 2).toLowerCase()
  const code = symbol.slice(2)
  return `${market === 'sh' ? 1 : 0}.${code}`
}

async function fetchWithRetry(url, headers = {}, retries = 3) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          ...headers
        },
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
      await sleep(700 * (i + 1))
    }
  }
  throw lastErr
}

/**
 * 主源：东方财富日线（前复权 fqt=1）
 * 返回格式：[date, open, close, high, low, volume, pct]
 */
async function fetchFromEastmoney(symbol) {
  const secid = toEastmoneySecid(symbol)
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?secid=${secid}` +
    `&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f59` +
    `&klt=101&fqt=1&beg=${START_DATE}&end=20500101&lmt=2500`

  const json = await fetchWithRetry(url, {
    Referer: 'https://quote.eastmoney.com/'
  })
  const klines = json?.data?.klines
  if (!Array.isArray(klines) || klines.length === 0) {
    throw new Error('Eastmoney returned empty klines')
  }

  return klines.map((line) => {
    const [date, open, close, high, low, volume, pct] = line.split(',')
    return [
      date,
      Number(open),
      Number(close),
      Number(high),
      Number(low),
      Number(volume),
      Number(pct)
    ]
  })
}

/**
 * 备源：腾讯财经日线（前复权 qfqday / 指数 day）
 */
async function fetchFromTencent(symbol) {
  const isIndex = symbol === 'sh000001' || symbol === 'sh000300'
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,2019-01-01,,2500,${isIndex ? '' : 'qfq'}`
  const json = await fetchWithRetry(url, {
    Referer: 'https://gu.qq.com/'
  })
  const node = json?.data?.[symbol]
  const rawList = node?.qfqday || node?.day
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error('Tencent returned empty klines')
  }

  const rows = []
  let prevClose = null
  for (const item of rawList) {
    const date = item[0]
    const open = Number(item[1])
    const close = Number(item[2])
    const high = Number(item[3])
    const low = Number(item[4])
    const volume = Math.round(Number(item[5] || 0))
    const pct =
      prevClose && prevClose > 0
        ? Number((((close - prevClose) / prevClose) * 100).toFixed(2))
        : 0
    rows.push([date, open, close, high, low, volume, pct])
    prevClose = close
  }
  return rows
}

async function fetchStock(stock) {
  const { symbol, name } = stock
  let rows = null
  let source = 'eastmoney'
  try {
    rows = await fetchFromEastmoney(symbol)
  } catch (emErr) {
    source = 'tencent'
    try {
      rows = await fetchFromTencent(symbol)
    } catch (txErr) {
      throw new Error(
        `${symbol}(${name}) failed on both sources: EM=${emErr.message}; TX=${txErr.message}`
      )
    }
  }

  const payload = {
    symbol,
    code: stock.code,
    market: stock.market,
    name,
    source,
    updatedAt: new Date().toISOString().slice(0, 10),
    fields: ['date', 'open', 'close', 'high', 'low', 'volume', 'pct'],
    rows
  }
  await fs.writeFile(
    path.join(KLINE_DIR, `${symbol}.json`),
    JSON.stringify(payload),
    'utf-8'
  )
  return {
    symbol,
    name,
    source,
    count: rows.length,
    firstDate: rows[0]?.[0] || '',
    lastDate: rows[rows.length - 1]?.[0] || ''
  }
}

async function main() {
  await fs.mkdir(KLINE_DIR, { recursive: true })
  const config = JSON.parse(await fs.readFile(SECTORS_FILE, 'utf-8'))

  const map = new Map()
  for (const b of config.benchmarks || []) map.set(b.symbol, b)
  for (const s of config.sectors || []) {
    for (const st of s.stocks || []) map.set(st.symbol, st)
  }
  const allStocks = Array.from(map.values())
  console.log(`准备抓取 ${allStocks.length} 只标的（2019年至今前复权日线）...`)

  const summary = []
  const failed = []
  let idx = 0

  async function worker() {
    while (idx < allStocks.length) {
      const current = allStocks[idx++]
      try {
        const res = await fetchStock(current)
        summary.push(res)
        console.log(
          `[OK] ${res.symbol} ${res.name} (${res.source}): ${res.count} 条 [${res.firstDate} ~ ${res.lastDate}]`
        )
      } catch (err) {
        failed.push({ symbol: current.symbol, name: current.name, error: err.message })
        console.error(`[FAIL] ${err.message}`)
      }
      await sleep(250)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  const latestDate = summary.reduce(
    (max, item) => (item.lastDate > max ? item.lastDate : max),
    ''
  )

  const meta = {
    version: `${latestDate || new Date().toISOString().slice(0, 10)}-${Date.now()}`,
    updatedAt: new Date().toISOString(),
    latestTradeDate: latestDate,
    totalStocks: summary.length,
    failedCount: failed.length,
    stocks: summary.sort((a, b) => a.symbol.localeCompare(b.symbol))
  }

  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf-8')
  console.log(`\n同步完成：成功 ${summary.length}，失败 ${failed.length}，最新交易日 ${latestDate}`)

  if (summary.length === 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
