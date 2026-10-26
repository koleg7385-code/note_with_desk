import { createPage } from './repo'
import type {
  CellValue,
  ColumnType,
  DatabaseDoc,
  DbColumn,
  DbRow,
  DbView,
  Page,
} from './db'

const uid = () => crypto.randomUUID()

export const COLUMN_LABELS: Record<ColumnType, string> = {
  text: 'Текст',
  number: 'Число',
  status: 'Статус',
  date: 'Дата',
  checkbox: 'Галочка',
}

export const DEFAULT_STATUS_OPTIONS = ['Не начато', 'В работе', 'Готово']

export function newColumn(type: ColumnType, name = COLUMN_LABELS[type]): DbColumn {
  return {
    id: uid(),
    name,
    type,
    ...(type === 'status' ? { options: [...DEFAULT_STATUS_OPTIONS] } : {}),
  }
}

export function newRow(cells: Record<string, CellValue> = {}): DbRow {
  return { id: uid(), cells, createdAt: Date.now() }
}

export function emptyDatabase(): DatabaseDoc {
  return {
    view: 'table',
    columns: [newColumn('text', 'Название'), newColumn('status', 'Статус')],
    rows: [newRow()],
  }
}

/** Первая текстовая колонка — заголовок записи в галерее и календаре. */
export function titleColumn(doc: DatabaseDoc): DbColumn | undefined {
  return doc.columns.find((column) => column.type === 'text') ?? doc.columns[0]
}

export function dateColumn(doc: DatabaseDoc): DbColumn | undefined {
  return doc.columns.find((column) => column.type === 'date')
}

/**
 * Какие вкладки имеет смысл показывать: таблица есть всегда, галерею и календарь
 * шаблон может отключить. Календарь без колонки с датой бесполезен — не показываем.
 */
export function availableViews(doc: DatabaseDoc): DbView[] {
  const allowed = doc.views ?? ['table', 'gallery', 'calendar']
  const views = allowed.filter((view) => view !== 'calendar' || Boolean(dateColumn(doc)))
  return views.includes('table') ? views : ['table', ...views]
}

export interface DatabaseTemplate {
  id: string
  name: string
  tagline: string
  icon: string
  /** Акцент превью в модалке шаблонов. */
  accent: string
  build: () => DatabaseDoc
}

function buildDoc(columns: DbColumn[], rows: CellValue[][]): DatabaseDoc {
  return {
    view: 'table',
    columns,
    rows: rows.map((values) => ({
      id: uid(),
      createdAt: Date.now(),
      cells: Object.fromEntries(columns.map((column, index) => [column.id, values[index] ?? null])),
    })),
  }
}

export const DATABASE_TEMPLATES: DatabaseTemplate[] = [
  {
    id: 'tasks',
    name: 'Tasks Tracker',
    tagline: 'Трекер задач: статусы, сроки и галочки выполнения.',
    icon: '✅',
    accent: '#46b17b',
    build: () => {
      const task = newColumn('text', 'Задача')
      const status = newColumn('status', 'Статус')
      const due = newColumn('date', 'Срок')
      const done = newColumn('checkbox', 'Готово')
      return buildDoc(
        [task, status, due, done],
        [
          ['Собрать каркас сарая', 'Готово', '2026-10-20', true],
          ['Купить крепёж', 'В работе', '2026-10-28', false],
          ['Покрасить стены', 'Не начато', '2026-11-05', false],
          ['Проверить крышу', 'Не начато', '2026-11-12', false],
        ],
      )
    },
  },
  {
    id: 'projects',
    name: 'Projects',
    tagline: 'Проекты со статусом, дедлайном и бюджетом.',
    icon: '🚀',
    accent: '#4a8fe0',
    build: () => {
      const project = newColumn('text', 'Проект')
      const status = newColumn('status', 'Статус')
      const deadline = newColumn('date', 'Дедлайн')
      const budget = newColumn('number', 'Бюджет')
      const done = newColumn('checkbox', 'Завершён')
      return buildDoc(
        [project, status, deadline, budget, done],
        [
          ['Домик на дереве', 'В работе', '2026-12-01', 45000, false],
          ['Мастерская в гараже', 'Не начато', '2027-03-15', 120000, false],
          ['Летняя кухня', 'Готово', '2026-08-01', 80000, true],
        ],
      )
    },
  },
  {
    id: 'finance',
    name: 'Таблица финансов',
    tagline: 'Доходы и расходы с датой, суммой и отметкой проверки.',
    icon: '💰',
    accent: '#d5a640',
    build: () => {
      const operation = newColumn('text', 'Операция')
      const type = newColumn('status', 'Тип')
      type.options = ['Доход', 'Расход', 'Перевод']
      const amount = newColumn('number', 'Сумма')
      const date = newColumn('date', 'Дата')
      const checked = newColumn('checkbox', 'Сверено')
      const doc = buildDoc(
        [operation, type, amount, date, checked],
        [
          ['Доски и крепёж', 'Расход', 12400, '2026-10-21', true],
          ['Продажа старых инструментов', 'Доход', 8000, '2026-10-22', false],
          ['Оплата электрики', 'Расход', 5600, '2026-10-24', false],
        ],
      )
      // Финансам нужна именно таблица с итогами: галерея и календарь здесь только мешают.
      doc.views = ['table']
      return doc
    },
  },
  {
    id: 'courses',
    name: 'Courses / Marks',
    tagline: 'Учёба: предметы, занятия, оценки и дедлайны.',
    icon: '🎓',
    accent: '#a071e0',
    build: () => {
      const course = newColumn('text', 'Курс')
      const kind = newColumn('status', 'Тип')
      kind.options = ['Лекция', 'Практика', 'Экзамен']
      const mark = newColumn('number', 'Оценка')
      const deadline = newColumn('date', 'Дедлайн')
      const passed = newColumn('checkbox', 'Сдано')
      const doc = buildDoc(
        [course, kind, mark, deadline, passed],
        [
          ['Математический анализ', 'Экзамен', 5, '2026-12-20', false],
          ['Физика', 'Практика', 4, '2026-12-15', true],
          ['История', 'Лекция', null, '2026-11-30', false],
        ],
      )
      doc.view = 'calendar'
      return doc
    },
  },
]

/** Создаёт страницу-базу из шаблона. Родитель — та страница, внутри которой нажали «Шаблоны». */
export async function createDatabaseFromTemplate(
  template: DatabaseTemplate,
  parentId: string | null = null,
): Promise<Page> {
  return createPage(template.name, '', template.icon, parentId, {
    kind: 'database',
    db: template.build(),
  })
}

export async function createEmptyDatabase(parentId: string | null = null): Promise<Page> {
  return createPage('Новая база', '', '📊', parentId, {
    kind: 'database',
    db: emptyDatabase(),
  })
}
