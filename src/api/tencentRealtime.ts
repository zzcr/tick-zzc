import type { RealtimeQuote } from '@/types/stock'

declare global {
  interface Window {
    [key: string]: unknown
  }
}

function parseTencentRaw(symbol: string, raw: string): RealtimeQuote | null {
  if (!raw || typeof raw !== 'string') return null
  const parts = raw.split('~')
  if (parts.length < 35) return null

  const price = Number(parts[3]) || 0
  const prevClose = Number(parts[4]) || 0
  const open = Number(parts[5]) || 0
  const volume = Number(parts[6]) || 0
  const updatedRaw = parts[30] || ''
  const change = Number(parts[31]) || 0
  const changePct = Number(parts[32]) || 0
  const high = Number(parts[33]) || 0
  const low = Number(parts[34]) || 0
  const amount = Number(parts[37]) || 0
  const turnover = Number(parts[38]) || 0
  const pe = Number(parts[39]) || 0
  const marketCap = Number(parts[45]) || 0

  let updatedAt = updatedRaw
  if (updatedRaw.length === 14) {
    updatedAt = `${updatedRaw.slice(0, 4)}-${updatedRaw.slice(4, 6)}-${updatedRaw.slice(6, 8)} ${updatedRaw.slice(8, 10)}:${updatedRaw.slice(10, 12)}:${updatedRaw.slice(12, 14)}`
  }

  return {
    symbol,
    code: parts[2] || symbol.slice(2),
    name: parts[1] || symbol,
    price,
    prevClose,
    open,
    high,
    low,
    volume,
    amount,
    change,
    changePct,
    turnover,
    pe,
    marketCap,
    updatedAt
  }
}

function loadTencentChunk(symbols: string[]): Promise<Record<string, RealtimeQuote>> {
  return new Promise((resolve) => {
    if (symbols.length === 0) {
      resolve({})
      return
    }
    const script = document.createElement('script')
    script.charset = 'gbk'
    script.async = true
    script.src = `https://qt.gtimg.cn/q=${symbols.join(',')}&_t=${Date.now()}`

    const timer = window.setTimeout(() => {
      cleanup()
      resolve({})
    }, 10000)

    const cleanup = () => {
      window.clearTimeout(timer)
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }

    script.onload = () => {
      const result: Record<string, RealtimeQuote> = {}
      for (const sym of symbols) {
        const key = `v_${sym}`
        const raw = window[key]
        if (typeof raw === 'string') {
          const parsed = parseTencentRaw(sym, raw)
          if (parsed) {
            result[sym] = parsed
          }
          try {
            delete window[key]
          } catch {
            window[key] = undefined
          }
        }
      }
      cleanup()
      resolve(result)
    }

    script.onerror = () => {
      cleanup()
      resolve({})
    }

    document.head.appendChild(script)
  })
}

/**
 * 批量获取腾讯财经实时行情（通过动态 script 标签天然绕过 CORS）
 */
export async function fetchTencentRealtimeQuotes(
  symbols: string[]
): Promise<Record<string, RealtimeQuote>> {
  const unique = Array.from(new Set(symbols.filter(Boolean)))
  const chunkSize = 25
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize))
  }

  const results = await Promise.all(chunks.map((c) => loadTencentChunk(c)))
  return Object.assign({}, ...results)
}
