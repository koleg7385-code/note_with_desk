import Dexie from 'dexie'
import type { JSONContent } from '@tiptap/core'

/* ---------------------------------------------------------------- типы сущностей */

export type PageKind = 'note' | 'database' | 'daily'
export type NodeKind = 'page' | 'sticky' | 'text' | 'image' | 'group'
export type LinkKind = 'mention' | 'relates' | 'parent' | 'causal'

/** Тип колонки в базе данных. */
export type ColumnType = 'text' | 'number' | 'status' | 'date' | 'checkbox'
export type DbView = 'table' | 'gallery' | 'calendar'
export type CellValue = string | number | boolean | null

export interface DbColumn {
  id: string
  name: string
  type: ColumnType
  /** Варианты для колонки-статуса. */
  options?: string[]
}

export interface DbRow {
  id: string
  cells: Record<string, CellValue>
  createdAt: number
}

export interface DatabaseDoc {
  columns: DbColumn[]
  rows: DbRow[]
  view: DbView
  /** Доступные вкладки представлений; нет — показываем все подходящие. */
  views?: DbView[]
}

export interface Page {
  id: string
  title: string
  icon?: string
  /** Плоская проекция документа: поиск, превью в узле-зеркале, сайдбар. */
  text: string
  /** Дерево документа Tiptap. Нет — значит заметка ещё в старом формате, собираем из text. */
  doc?: JSONContent | null
  parentId: string | null
  kind: PageKind
  tags: string[]
  archived: 0 | 1
  /** 1 — страница в избранном. */
  favorite?: 0 | 1
  /** 1 — редактор на всю ширину окна. */
  wide?: 0 | 1
  /** Обложка: 'g1'…'g6' — готовый градиент, 'a:<id>' — картинка из assets. */
  cover?: string | null
  /** Содержимое базы, если kind === 'database'. */
  db?: DatabaseDoc | null
  createdAt: number
  updatedAt: number
}

export interface Board {
  id: string
  title: string
  icon?: string
  description: string
  parentId?: string | null
  favorite?: 0 | 1
  viewport: { x: number; y: number; zoom: number }
  /** Свободное рисование поверх холста, координаты — в системе холста. */
  drawing?: Stroke[]
  createdAt: number
  updatedAt: number
}

export interface Stroke {
  color: string
  width: number
  /** Плоский список координат: [x0, y0, x1, y1, …]. */
  points: number[]
}

export interface BoardNode {
  id: string
  boardId: string
  kind: NodeKind
  /** Узел-зеркало: ссылка на заметку вместо копии текста. */
  refPageId: string | null
  /** Картинка хранится в assets, узел держит только ссылку. */
  refAssetId?: string | null
  x: number
  y: number
  w: number
  h: number
  color: string
  data: { text?: string; caption?: string }
  createdAt: number
  updatedAt: number
}

export interface Edge {
  id: string
  boardId: string
  sourceId: string
  targetId: string
  /** С какой стороны выходит стрелка и в какую входит. */
  sourceHandle?: string | null
  targetHandle?: string | null
  label: string
  /** Цвет линии; нет — стандартный серый. */
  color?: string | null
  /** Толщина линии в пикселях; нет — 2. */
  width?: number | null
  /** 1 — пунктирная линия. */
  dashed?: 0 | 1
  /** 1 — стрелка нарисована для наглядности и смысловой связи не создаёт. */
  isVisual: 0 | 1
  hidden: 0 | 1
  createdAt: number
}

export interface Link {
  id: string
  fromType: 'page' | 'node'
  fromId: string
  toType: 'page' | 'node'
  toId: string
  kind: LinkKind
  origin: 'mention' | 'edge' | 'manual'
  createdAt: number
}

export interface Asset {
  id: string
  name: string
  mime: string
  size: number
  blob: Blob
  createdAt: number
}

export const newId = () => crypto.randomUUID()

/* ---------------------------------------------------------------- схема и сид */

// Флаги храним числами: IndexedDB не индексирует boolean.
// Поля icon, doc, refAssetId, favorite, cover, db, drawing и т.п. не индексируются,
// поэтому версия схемы для них не нужна: у старых записей их просто нет,
// а интерфейс подставляет значения по умолчанию.
class AppDatabase extends Dexie {
  pages!: Dexie.Table<Page, string>
  boards!: Dexie.Table<Board, string>
  nodes!: Dexie.Table<BoardNode, string>
  edges!: Dexie.Table<Edge, string>
  links!: Dexie.Table<Link, string>
  assets!: Dexie.Table<Asset, string>

  constructor() {
    super('note-with-desk')

    this.version(1).stores({
      pages: 'id, parentId, updatedAt, kind, archived, *tags',
      boards: 'id, updatedAt',
      nodes: 'id, boardId, refPageId',
      edges: 'id, boardId, sourceId, targetId',
      links: 'id, fromId, toId, kind, createdAt',
    })

    // Версия 2 добавляет хранилище картинок.
    this.version(2).stores({
      pages: 'id, parentId, updatedAt, kind, archived, *tags',
      boards: 'id, updatedAt',
      nodes: 'id, boardId, refPageId',
      edges: 'id, boardId, sourceId, targetId',
      links: 'id, fromId, toId, kind, createdAt',
      assets: 'id, createdAt',
    })

    // Срабатывает один раз — когда база создаётся впервые.
    this.on('populate', () => seed())
  }
}

export const db = new AppDatabase()

function seedProjects(): DatabaseDoc {
  const statusId = newId()
  const nameId = newId()
  const deadlineId = newId()
  const budgetId = newId()
  const now = Date.now()

  const row = (name: string, status: string, deadline: string, budget: number): DbRow => ({
    id: newId(),
    createdAt: now,
    cells: { [nameId]: name, [statusId]: status, [deadlineId]: deadline, [budgetId]: budget },
  })

  return {
    view: 'table',
    columns: [
      { id: nameId, name: 'Проект', type: 'text' },
      { id: statusId, name: 'Статус', type: 'status', options: ['Идея', 'В работе', 'Готово'] },
      { id: deadlineId, name: 'Срок', type: 'date' },
      { id: budgetId, name: 'Бюджет', type: 'number' },
    ],
    rows: [
      row('Домик на дереве', 'В работе', '2026-11-20', 45000),
      row('Мастерская', 'Идея', '2027-03-01', 120000),
      row('Сарай для инструментов', 'Готово', '2026-08-10', 30000),
    ],
  }
}

function seed() {
  const now = Date.now()
  const pageId = newId()
  const childId = newId()
  const boardId = newId()
  const databaseId = newId()

  const page: Page = {
    id: pageId,
    title: 'Добро пожаловать',
    icon: '👋',
    doc: null,
    text: [
      'Это первая заметка. Заголовок, текст и оформление сохраняются в IndexedDB автоматически — обнови страницу, чтобы убедиться.',
      '',
      'Выдели текст, чтобы увидеть плавающую панель: жирный, курсив, подчёркнутый, цвет текста и выделения. Сверху — заголовки, размер, списки, чек-лист, блок кода и таблица.',
      '',
      'Картинку можно вставить прямо в текст через Ctrl+V, а потом обрезать кнопкой ✂️ на самой картинке.',
      '',
      'Слева — дерево: у любой страницы могут быть подстраницы. Наведи на строку и нажми «+», чтобы завести вложенную. «•••» — избранное, копия, переименование, боковой просмотр и удаление.',
      '',
      'Рядом лежит доска: узлы таскаются мышкой, соединяются стрелками, на них можно рисовать маркером и писать текст без рамки.',
      '',
      'А вкладка «📚 Библиотека» сверху сайдбара собирает всё в один список с датами и путём.',
    ].join('\n'),
    parentId: null,
    kind: 'note',
    tags: ['старт'],
    archived: 0,
    favorite: 1,
    createdAt: now,
    updatedAt: now,
  }

  const child: Page = {
    id: childId,
    title: 'Идеи для построек',
    icon: '🛠️',
    doc: null,
    text: [
      'Пристройка к мастерской: стеллажи во всю стену и вытяжка над верстаком.',
      '',
      'Навес для дров: косые стропила, чтобы снег скатывался сам.',
      '',
      'Показать, как работает дерево: у этой страницы есть «родитель», и хлебные крошки сверху кликабельны.',
    ].join('\n'),
    parentId: pageId,
    kind: 'note',
    tags: [],
    archived: 0,
    createdAt: now + 1,
    updatedAt: now + 1,
  }

  const database: Page = {
    id: databaseId,
    title: 'Проекты',
    icon: '📊',
    doc: null,
    text: 'База проектов: сроки, статусы и бюджеты.',
    parentId: null,
    kind: 'database',
    tags: [],
    archived: 0,
    db: seedProjects(),
    createdAt: now + 2,
    updatedAt: now + 2,
  }

  const board: Board = {
    id: boardId,
    title: 'Моя доска',
    icon: '🧩',
    description: 'Пробное пространство для мыслей и связей.',
    parentId: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  }

  const nodes: BoardNode[] = [
    {
      id: newId(),
      boardId,
      kind: 'page',
      refPageId: pageId,
      x: 60,
      y: 80,
      w: 240,
      h: 110,
      color: 'default',
      data: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: newId(),
      boardId,
      kind: 'sticky',
      refPageId: null,
      x: 400,
      y: 80,
      w: 220,
      h: 130,
      color: 'yellow',
      data: { text: 'Стикер живёт только на доске. Потяни за точки по бокам, чтобы связать его с заметкой.' },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: newId(),
      boardId,
      kind: 'text',
      refPageId: null,
      x: 400,
      y: 250,
      w: 260,
      h: 40,
      color: 'default',
      data: { text: 'Текст без рамки — просто подпись на холсте' },
      createdAt: now,
      updatedAt: now,
    },
  ]

  void db.pages.bulkAdd([page, child, database])
  void db.boards.add(board)
  void db.nodes.bulkAdd(nodes)
}

/** Без этого браузер вправе вытеснить базу при нехватке места. */
export function requestPersistence() {
  return navigator.storage?.persist?.().catch(() => false)
}
