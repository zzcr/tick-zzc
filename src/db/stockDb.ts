import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  CachedStockKline,
  RealtimeQuote,
  SectorConfig,
  StockNote
} from '@/types/stock'

interface TickZzcSchema extends DBSchema {
  klines: {
    key: string
    value: CachedStockKline
  }
  sectors: {
    key: string
    value: SectorConfig
  }
  notes: {
    key: string
    value: StockNote
  }
  meta: {
    key: string
    value: {
      key: string
      value: unknown
      updatedAt: string
    }
  }
}

const DB_NAME = 'tick_zzc_cycle_db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TickZzcSchema>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TickZzcSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('klines')) {
          db.createObjectStore('klines', { keyPath: 'symbol' })
        }
        if (!db.objectStoreNames.contains('sectors')) {
          db.createObjectStore('sectors', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'symbol' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      }
    })
  }
  return dbPromise
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const stockDb = {
  async getKline(symbol: string): Promise<CachedStockKline | undefined> {
    const db = await getDb()
    return db.get('klines', symbol)
  },

  async putKline(data: CachedStockKline): Promise<void> {
    const db = await getDb()
    await db.put('klines', toPlain(data))
  },

  async getAllKlines(): Promise<CachedStockKline[]> {
    const db = await getDb()
    return db.getAll('klines')
  },

  async deleteKline(symbol: string): Promise<void> {
    const db = await getDb()
    await db.delete('klines', symbol)
  },

  async getAllCustomSectors(): Promise<SectorConfig[]> {
    const db = await getDb()
    return db.getAll('sectors')
  },

  async saveCustomSector(sector: SectorConfig): Promise<void> {
    const db = await getDb()
    await db.put('sectors', toPlain(sector))
  },

  async deleteCustomSector(id: string): Promise<void> {
    const db = await getDb()
    await db.delete('sectors', id)
  },

  async saveAllCustomSectors(sectors: SectorConfig[]): Promise<void> {
    const db = await getDb()
    const plainSectors = toPlain(sectors)
    const tx = db.transaction('sectors', 'readwrite')
    await tx.store.clear()
    for (const sector of plainSectors) {
      await tx.store.put(sector)
    }
    await tx.done
  },

  async getAllNotes(): Promise<StockNote[]> {
    const db = await getDb()
    return db.getAll('notes')
  },

  async saveNote(note: StockNote): Promise<void> {
    const db = await getDb()
    await db.put('notes', toPlain(note))
  },

  async saveRealtimeSnapshot(quotes: Record<string, RealtimeQuote>): Promise<void> {
    const db = await getDb()
    await db.put('meta', {
      key: 'realtime_snapshot',
      value: toPlain(quotes),
      updatedAt: new Date().toISOString()
    })
  },

  async getRealtimeSnapshot(): Promise<{
    quotes: Record<string, RealtimeQuote>
    updatedAt: string
  } | null> {
    const db = await getDb()
    const record = await db.get('meta', 'realtime_snapshot')
    if (!record) return null
    return {
      quotes: (record.value as Record<string, RealtimeQuote>) || {},
      updatedAt: record.updatedAt
    }
  },

  async getStorageStats(): Promise<{
    klineCount: number
    customSectorCount: number
    noteCount: number
    totalRows: number
  }> {
    const db = await getDb()
    const [klines, sectors, notes] = await Promise.all([
      db.getAll('klines'),
      db.getAll('sectors'),
      db.getAll('notes')
    ])
    const totalRows = klines.reduce((sum, item) => sum + item.rows.length, 0)
    return {
      klineCount: klines.length,
      customSectorCount: sectors.length,
      noteCount: notes.length,
      totalRows
    }
  },

  async clearKlineCache(): Promise<void> {
    const db = await getDb()
    await db.clear('klines')
  }
}
