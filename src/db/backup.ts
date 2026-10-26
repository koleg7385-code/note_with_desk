import { db } from './db'
import type { Asset, Board, BoardNode, Edge, Link, Page } from './db'

const FORMAT = 'note-with-desk'

interface BackupFile {
  format: string
  version: number
  exportedAt: string
  tables: {
    pages?: unknown[]
    boards?: unknown[]
    nodes?: unknown[]
    edges?: unknown[]
    links?: unknown[]
  }
  assets?: Array<Omit<Asset, 'blob'> & { dataUrl: string }>
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

/** Вся база в один JSON: картинки кодируются в data URL, чтобы файл был самодостаточным. */
export async function exportDatabase(): Promise<string> {
  const [pages, boards, nodes, edges, links, assets] = await Promise.all([
    db.pages.toArray(),
    db.boards.toArray(),
    db.nodes.toArray(),
    db.edges.toArray(),
    db.links.toArray(),
    db.assets.toArray(),
  ])

  const backup: BackupFile = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: { pages, boards, nodes, edges, links },
    assets: await Promise.all(
      assets.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })),
    ),
  }

  return JSON.stringify(backup)
}

export async function importDatabase(json: string): Promise<void> {
  const parsed = JSON.parse(json) as BackupFile
  if (parsed?.format !== FORMAT) {
    throw new Error('Это не файл резервной копии приложения')
  }

  const tables = parsed.tables ?? {}
  const assets = await Promise.all(
    (parsed.assets ?? []).map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await dataUrlToBlob(dataUrl) })),
  )

  // db.tables — массивом, потому что в сигнатуру транзакции влезает не больше пяти таблиц поимённо.
  await db.transaction('rw', db.tables, async () => {
    await db.pages.clear()
    await db.boards.clear()
    await db.nodes.clear()
    await db.edges.clear()
    await db.links.clear()
    await db.assets.clear()

    await db.pages.bulkAdd(tables.pages as Page[])
    await db.boards.bulkAdd(tables.boards as Board[])
    await db.nodes.bulkAdd(tables.nodes as BoardNode[])
    await db.edges.bulkAdd(tables.edges as Edge[])
    await db.links.bulkAdd(tables.links as Link[])
    await db.assets.bulkAdd(assets)
  })
}