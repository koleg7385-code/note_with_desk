import { db, newId } from './db'
import type { Asset, Board, BoardNode, Edge, Page, PageKind, Stroke } from './db'

const now = () => Date.now()

export type ItemRef = { kind: 'page' | 'board'; id: string }

/** Строка дерева: страница и доска живут в одной иерархии. */
export interface TreeItem {
  kind: ItemRef['kind']
  id: string
  title: string
  icon?: string
  parentId: string | null
  favorite: boolean
  pageKind?: PageKind
  createdAt: number
  updatedAt: number
}

/* ---------------------------------------------------------------- чтение */

export async function listPages() {
  const rows = await db.pages.where('archived').equals(0).toArray()
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listBoards() {
  return db.boards.orderBy('updatedAt').reverse().toArray()
}

export function getPage(id: string) {
  return db.pages.get(id)
}

export function getBoard(id: string) {
  return db.boards.get(id)
}

export function getNode(id: string) {
  return db.nodes.get(id)
}

/** Узел вместе с заметкой, на которую он ссылается: нужно узлу-зеркалу. */
export async function getNodeWithPage(nodeId: string) {
  const node = await db.nodes.get(nodeId)
  const page = node?.refPageId ? await db.pages.get(node.refPageId) : undefined
  return { node, page }
}

export function listNodes(boardId: string) {
  return db.nodes.where('boardId').equals(boardId).toArray()
}

export function listEdges(boardId: string) {
  return db.edges.where('boardId').equals(boardId).toArray()
}

function pageToItem(page: Page): TreeItem {
  return {
    kind: 'page',
    id: page.id,
    title: page.title,
    icon: page.icon,
    parentId: page.parentId,
    favorite: page.favorite === 1,
    pageKind: page.kind,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  }
}

function boardToItem(board: Board): TreeItem {
  return {
    kind: 'board',
    id: board.id,
    title: board.title,
    icon: board.icon,
    parentId: board.parentId ?? null,
    favorite: board.favorite === 1,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  }
}

/** Страницы и доски одной плоской лентой: из неё сайдбар собирает дерево и библиотеку. */
export async function listTree(): Promise<TreeItem[]> {
  const [pages, boards] = await Promise.all([
    db.pages.where('archived').equals(0).toArray(),
    db.boards.toArray(),
  ])
  return [...pages.map(pageToItem), ...boards.map(boardToItem)].sort(
    (a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title, 'ru'),
  )
}

export async function getRefItem(ref: ItemRef | null): Promise<TreeItem | null> {
  if (!ref) return null
  if (ref.kind === 'page') {
    const page = await db.pages.get(ref.id)
    return page ? pageToItem(page) : null
  }
  const board = await db.boards.get(ref.id)
  return board ? boardToItem(board) : null
}

/** Родителем может быть и страница, и доска — ищем в обеих таблицах. */
export async function getRefItemById(id: string | null): Promise<TreeItem | null> {
  if (!id) return null
  const page = await db.pages.get(id)
  if (page) return pageToItem(page)
  const board = await db.boards.get(id)
  return board ? boardToItem(board) : null
}

/** Путь от корня до объекта: хлебные крошки. */
export async function getTrail(ref: ItemRef | null): Promise<TreeItem[]> {
  const trail: TreeItem[] = []
  const seen = new Set<string>()
  let current = await getRefItem(ref)

  while (current && !seen.has(`${current.kind}:${current.id}`) && trail.length < 32) {
    seen.add(`${current.kind}:${current.id}`)
    trail.push(current)
    current = await getRefItemById(current.parentId)
  }

  return trail.reverse()
}

/* ---------------------------------------------------------------- заметки и доски */

export async function createPage(
  title = '',
  text = '',
  icon = '📄',
  parentId: string | null = null,
  extra: Partial<Page> = {},
) {
  const time = now()
  const page: Page = {
    id: newId(),
    title,
    icon,
    doc: null,
    text,
    parentId,
    kind: 'note',
    tags: [],
    archived: 0,
    createdAt: time,
    updatedAt: time,
    ...extra,
  }
  await db.pages.add(page)
  return page
}

export async function createBoard(
  title = '',
  icon = '🧩',
  parentId: string | null = null,
) {
  const time = now()
  const board: Board = {
    id: newId(),
    title,
    icon,
    description: '',
    parentId,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: time,
    updatedAt: time,
  }
  await db.boards.add(board)
  return board
}

export function createChildPage(parentId: string) {
  return createPage('', '', '📄', parentId)
}

export function createChildBoard(parentId: string) {
  return createBoard('', '🧩', parentId)
}

export function updatePage(id: string, patch: Partial<Page>) {
  return db.pages.update(id, { ...patch, updatedAt: now() })
}

export function updateBoard(id: string, patch: Partial<Board>) {
  return db.boards.update(id, { ...patch, updatedAt: now() })
}

/** Мягкое удаление: страница уходит из списков, но остаётся в базе. */
export function archivePage(id: string) {
  return db.pages.update(id, { archived: 1, updatedAt: now() })
}

/** Доска удаляется вместе со своими узлами и связями — иначе останутся сироты. */
export function deleteBoard(id: string) {
  return db.transaction('rw', db.boards, db.nodes, db.edges, async () => {
    await db.nodes.where('boardId').equals(id).delete()
    await db.edges.where('boardId').equals(id).delete()
    await db.boards.delete(id)
  })
}

/**
 * Удаляет объект и всё, что лежит внутри: иначе подстраницы осиротеют
 * и пропадут из дерева, оставшись в базе.
 */
export async function archiveItemTree(root: ItemRef) {
  const [pages, boards] = await Promise.all([
    db.pages.where('archived').equals(0).toArray(),
    db.boards.toArray(),
  ])

  const children = new Map<string, ItemRef[]>()
  const record = (parentId: string | null | undefined, kind: ItemRef['kind'], id: string) => {
    if (!parentId) return
    const list = children.get(parentId) ?? []
    list.push({ kind, id })
    children.set(parentId, list)
  }

  for (const page of pages) record(page.parentId, 'page', page.id)
  for (const board of boards) record(board.parentId, 'board', board.id)

  const queue: ItemRef[] = [root]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    const key = `${current.kind}:${current.id}`
    if (seen.has(key)) continue
    seen.add(key)

    if (current.kind === 'page') await archivePage(current.id)
    else await deleteBoard(current.id)

    for (const child of children.get(current.id) ?? []) queue.push(child)
  }
}

/** Копия страницы: документ и база данных клонируются целиком. */
export async function duplicatePage(id: string): Promise<ItemRef | null> {
  const page = await db.pages.get(id)
  if (!page) return null

  const time = now()
  const copy: Page = {
    ...page,
    id: newId(),
    title: `${page.title || 'Без названия'} (копия)`,
    doc: page.doc ? structuredClone(page.doc) : page.doc,
    db: page.db ? structuredClone(page.db) : page.db,
    createdAt: time,
    updatedAt: time,
  }
  await db.pages.add(copy)
  return { kind: 'page', id: copy.id }
}

/** Копия доски вместе с узлами и стрелками; внутренние id переназначаются. */
export async function duplicateBoard(id: string): Promise<ItemRef | null> {
  const board = await db.boards.get(id)
  if (!board) return null

  const time = now()
  const copyId = newId()
  const copy: Board = {
    ...board,
    id: copyId,
    title: `${board.title || 'Без названия'} (копия)`,
    createdAt: time,
    updatedAt: time,
  }

  const [nodes, edges] = await Promise.all([listNodes(id), listEdges(id)])
  const idMap = new Map<string, string>()

  await db.transaction('rw', db.boards, db.nodes, db.edges, async () => {
    await db.boards.add(copy)
    for (const node of nodes) {
      const nodeId = newId()
      idMap.set(node.id, nodeId)
      await db.nodes.add({ ...node, id: nodeId, boardId: copyId, createdAt: time, updatedAt: time })
    }
    for (const edge of edges) {
      const sourceId = idMap.get(edge.sourceId)
      const targetId = idMap.get(edge.targetId)
      if (!sourceId || !targetId) continue
      await db.edges.add({ ...edge, id: newId(), boardId: copyId, sourceId, targetId, createdAt: time })
    }
  })

  return { kind: 'board', id: copyId }
}

export function duplicateItem(ref: ItemRef) {
  return ref.kind === 'page' ? duplicatePage(ref.id) : duplicateBoard(ref.id)
}

export async function toggleFavorite(ref: ItemRef, favorite: boolean) {
  if (ref.kind === 'page') return updatePage(ref.id, { favorite: favorite ? 1 : 0 })
  return updateBoard(ref.id, { favorite: favorite ? 1 : 0 })
}

export async function renameItem(ref: ItemRef, title: string) {
  if (ref.kind === 'page') return updatePage(ref.id, { title })
  return updateBoard(ref.id, { title })
}

/* ---------------------------------------------------------------- узлы и связи */

export async function createSticky(
  boardId: string,
  x: number,
  y: number,
  color = 'yellow',
  text = '',
) {
  const node: BoardNode = {
    id: newId(),
    boardId,
    kind: 'sticky',
    refPageId: null,
    x,
    y,
    w: 220,
    h: 130,
    color,
    data: { text },
    createdAt: now(),
    updatedAt: now(),
  }
  await db.nodes.add(node)
  return node
}

/** Текст без рамки: подпись на холсте, а не карточка. */
export async function createTextNode(boardId: string, x: number, y: number, text = '') {
  const node: BoardNode = {
    id: newId(),
    boardId,
    kind: 'text',
    refPageId: null,
    x,
    y,
    w: 260,
    h: 40,
    color: 'default',
    data: { text },
    createdAt: now(),
    updatedAt: now(),
  }
  await db.nodes.add(node)
  return node
}

/** Узел-зеркало: тело заметки остаётся в pages, здесь только ссылка и координаты. */
export async function createPageNode(boardId: string, refPageId: string, x: number, y: number) {
  const node: BoardNode = {
    id: newId(),
    boardId,
    kind: 'page',
    refPageId,
    x,
    y,
    w: 240,
    h: 110,
    color: 'default',
    data: {},
    createdAt: now(),
    updatedAt: now(),
  }
  await db.nodes.add(node)
  return node
}

export function updateNode(id: string, patch: Partial<BoardNode>) {
  return db.nodes.update(id, { ...patch, updatedAt: now() })
}

/** Поля внутри data сливаем, а не заменяем: у узла могут быть и текст, и подпись. */
export async function updateNodeData(id: string, patch: Partial<BoardNode['data']>) {
  const node = await db.nodes.get(id)
  if (!node) return
  await db.nodes.update(id, { data: { ...node.data, ...patch }, updatedAt: now() })
}

/** Удаляем узел вместе с его стрелками, чтобы не осталось висящих связей. */
export function deleteNode(id: string) {
  return db.transaction('rw', db.nodes, db.edges, async () => {
    await db.edges.where('sourceId').equals(id).delete()
    await db.edges.where('targetId').equals(id).delete()
    await db.nodes.delete(id)
  })
}

export function deleteEdge(id: string) {
  return db.edges.delete(id)
}

export function createEdge(
  boardId: string,
  sourceId: string,
  targetId: string,
  handles: { sourceHandle?: string | null; targetHandle?: string | null } = {},
  isVisual: 0 | 1 = 0,
) {
  const edge: Edge = {
    id: newId(),
    boardId,
    sourceId,
    targetId,
    sourceHandle: handles.sourceHandle ?? null,
    targetHandle: handles.targetHandle ?? null,
    label: '',
    isVisual,
    hidden: 0,
    createdAt: now(),
  }
  return db.edges.add(edge)
}

export function updateEdge(id: string, patch: Partial<Edge>) {
  return db.edges.update(id, patch)
}

/** Разворачивает стрелку: узлы меняются местами вместе с точками привязки. */
export async function reverseEdge(id: string) {
  const edge = await db.edges.get(id)
  if (!edge) return
  await db.edges.update(id, {
    sourceId: edge.targetId,
    targetId: edge.sourceId,
    sourceHandle: edge.targetHandle ?? null,
    targetHandle: edge.sourceHandle ?? null,
  })
}

/** Рисование хранится на доске целиком: одна запись на завершённый штрих. */
export function updateDrawing(boardId: string, drawing: Stroke[]) {
  return updateBoard(boardId, { drawing })
}

/* ---------------------------------------------------------------- картинки */

/** Картинка целиком лежит в базе как Blob: в документе и в узле хранится только id. */
export async function putAsset(file: Blob, name = 'image'): Promise<Asset> {
  const asset: Asset = {
    id: newId(),
    name,
    mime: file.type || 'image/png',
    size: file.size,
    blob: file,
    createdAt: now(),
  }
  await db.assets.add(asset)
  return asset
}

export function getAsset(id: string) {
  return db.assets.get(id)
}

export function listAssets() {
  return db.assets.toArray()
}

export async function createImageNode(boardId: string, assetId: string, x: number, y: number, w = 280) {
  const node: BoardNode = {
    id: newId(),
    boardId,
    kind: 'image',
    refPageId: null,
    refAssetId: assetId,
    x,
    y,
    w,
    h: 0,
    color: 'default',
    data: { caption: '' },
    createdAt: now(),
    updatedAt: now(),
  }
  await db.nodes.add(node)
  return node
}
