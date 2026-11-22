import type {
  DataMeta,
  KlineTuple,
  Market,
  SectorsBundle,
  StockKlineFile,
  StockRef
} from '@/types/stock'

const BASE_URL = import.meta.env.BASE_URL || '/'

export function normalizeStockInput(raw: string): {
  symbol: string
  code: string
  market: Market
} | null {
  const cleaned = raw.trim().toLowerCase()
  const match = cleaned.match(/^(sh|sz|bj)?(\d{6})$/)
  if (!match) return null

  const explicitMarket = match[1] as Market | undefined
  const code = match[2]
  let market: Market = explicitMarket || 'sh'
  if (!explicitMarket) {
    if (code.startsWith('6') || code.startsWith('9')) {
      market = 'sh'
    } else if (code.startsWith('0') || code.startsWith('3')) {
      market = 'sz'
    } else {
      market = 'bj'
    }
  }
  return {
    symbol: `${market}${code}`,
    code,
    market
  }
}

export async function fetchLocalSectors(): Promise<SectorsBundle> {
  const res = await fetch(`${BASE_URL}data/sectors.json`)
  if (!res.ok) throw new Error(`读取本地 sectors.json 失败 (${res.status})`)
  return res.json()
}

export async function fetchLocalMeta(): Promise<DataMeta | null> {
  try {
    const res = await fetch(`${BASE_URL}data/meta.json`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchLocalKline(symbol: string): Promise<StockKlineFile | null> {
  try {
    const res = await fetch(`${BASE_URL}data/kline/${symbol}.json`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

/**
 * 通过东方财富 JSONP 接口在线拉取任意 A 股前复权历史日线（纯前端无需代理）
 */
export function fetchEastmoneyKlineJsonp(
  stock: Pick<StockRef, 'symbol' | 'code' | 'market'> & { name?: string },
  startDate = '20190101'
): Promise<StockKlineFile> {
  return new Promise((resolve, reject) => {
    const secid = `${stock.market === 'sh' ? 1 : 0}.${stock.code}`
    const cbName = `__tickZzcEmCb_${stock.symbol}_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const url =
      `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
      `?cb=${cbName}` +
      `&secid=${secid}` +
      `&fields1=f1,f2,f3,f4,f5,f6` +
      `&fields2=f51,f52,f53,f54,f55,f56,f59` +
      `&klt=101&fqt=1&beg=${startDate}&end=20500101&lmt=2500`

    const script = document.createElement('script')
    script.async = true
    script.src = url

    const cleanup = () => {
      window.clearTimeout(timer)
      if (script.parentNode) script.parentNode.removeChild(script)
      try {
        delete (window as unknown as Record<string, unknown>)[cbName]
      } catch {
        ;(window as unknown as Record<string, unknown>)[cbName] = undefined
      }
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`东方财富接口请求超时 (${stock.symbol})`))
    }, 12000)

    ;(window as unknown as Record<string, unknown>)[cbName] = (payload: {
      data?: { name?: string; klines?: string[] }
    }) => {
      cleanup()
      const klines = payload?.data?.klines
      if (!Array.isArray(klines) || klines.length === 0) {
        reject(new Error(`未找到 ${stock.symbol} 的历史日线数据，请检查股票代码`))
        return
      }
      const rows: KlineTuple[] = klines.map((line) => {
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

      resolve({
        symbol: stock.symbol,
        code: stock.code,
        market: stock.market,
        name: payload.data?.name || stock.name || stock.symbol,
        source: 'eastmoney-jsonp',
        updatedAt: new Date().toISOString().slice(0, 10),
        fields: ['date', 'open', 'close', 'high', 'low', 'volume', 'pct'],
        rows
      })
    }

    script.onerror = () => {
      cleanup()
      reject(new Error(`东方财富接口加载失败 (${stock.symbol})`))
    }

    document.head.appendChild(script)
  })
}
