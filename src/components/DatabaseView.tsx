import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GalleryVerticalEnd,
  Hash,
  Plus,
  SquareCheck,
  Table as TableIcon,
  Tag,
  Trash2,
  Type,
} from 'lucide-react'
import { updatePage } from '../db/repo'
import type {
  CellValue,
  ColumnType,
  DatabaseDoc,
  DbColumn,
  Page,
} from '../db/db'
import {
  availableViews,
  COLUMN_LABELS,
  DEFAULT_STATUS_OPTIONS,
  dateColumn,
  emptyDatabase,
  newColumn,
  newRow,
  titleColumn,
} from '../db/database'
import { useAutosave } from '../lib/useAutosave'
import { cx, GrowTextarea, menuItem, popoverPanel, SavePill, toolbarButton } from '../lib/ui'
import { EmojiPicker } from './EmojiPicker'
import { PageCover } from './PageCover'

const COLUMN_TYPES: ColumnType[] = ['text', 'number', 'status', 'date', 'checkbox']

const VIEWS: Array<{ id: DatabaseDoc['view']; label: string; icon: typeof TableIcon }> = [
  { id: 'table', label: 'Таблица', icon: TableIcon },
  { id: 'gallery', label: 'Галерея', icon: GalleryVerticalEnd },
  { id: 'calendar', label: 'Календарь', icon: CalendarRange },
]

const NEUTRAL_STATUS = { bg: '#2a2a2a', text: '#a6a6a6', dot: '#6a6a6a' }
const GREEN_STATUS = { bg: '#1f3a2b', text: '#8fd6a8', dot: '#4ade80' }
const AMBER_STATUS = { bg: '#3a3320', text: '#e0c97f', dot: '#fbbf24' }
const BLUE_STATUS = { bg: '#233246', text: '#93b8e0', dot: '#60a5fa' }
const RED_STATUS = { bg: '#3a2323', text: '#e0a0a0', dot: '#f87171' }
const PURPLE_STATUS = { bg: '#2e2a3f', text: '#b7a8e0', dot: '#a78bfa' }
const PINK_STATUS = { bg: '#3a2630', text: '#e0a3bb', dot: '#f472b6' }
const STATUS_FALLBACK = [NEUTRAL_STATUS, BLUE_STATUS, AMBER_STATUS, PURPLE_STATUS, PINK_STATUS, GREEN_STATUS]

/** Цвет статуса читаем по смыслу («Готово» зелёное), а не только по порядку вариантов. */
function statusStyle(column: DbColumn, value: CellValue) {
  const text = typeof value === 'string' ? value : ''
  if (!text) return NEUTRAL_STATUS
  const lower = text.toLowerCase()
  if (/(готов|done|сдан|заверш|оплач|доход|passed)/.test(lower)) return GREEN_STATUS
  if (/(расход|отмен|ошиб|просроч|fail)/.test(lower)) return RED_STATUS
  if (/(работ|progress|active|идёт|идет|процесс)/.test(lower)) return BLUE_STATUS
  if (/(не начат|todo|идея|план|backlog)/.test(lower)) return NEUTRAL_STATUS
  const index = (column.options ?? []).indexOf(text)
  return STATUS_FALLBACK[(index < 0 ? 0 : index) % STATUS_FALLBACK.length]
}

function TypeIcon({ type }: { type: ColumnType }) {
  const props = { size: 12, className: 'shrink-0 text-faint' }
  if (type === 'number') return <Hash {...props} />
  if (type === 'status') return <Tag {...props} />
  if (type === 'date') return <CalendarDays {...props} />
  if (type === 'checkbox') return <SquareCheck {...props} />
  return <Type {...props} />
}

/**
 * База данных — это страница с kind === 'database'. Три представления читают
 * один и тот же документ (колонки + строки), поэтому переключение вида не теряет данные.
 */
export function DatabaseView({ page }: { page: Page }) {
  const { values, set, status } = useAutosave(
    { title: page.title, db: page.db ?? emptyDatabase() },
    (patch) => void updatePage(page.id, patch),
  )
  const doc = values.db
  const wide = page.wide === 1
  const contentClass = cx('mx-auto w-full', wide ? 'max-w-none px-10' : 'max-w-[1040px] px-10')

  // Шаблон сам решает, какие вкладки ему нужны; календарь без колонки с датой не показываем.
  const allowedViews = availableViews(doc)
  const views = VIEWS.filter((item) => allowedViews.includes(item.id))
  const view = views.some((item) => item.id === doc.view) ? doc.view : 'table'

  const mutate = (fn: (draft: DatabaseDoc) => void) => {
    const next = structuredClone(doc)
    fn(next)
    set({ db: next })
  }

  const setCell = (rowId: string, columnId: string, value: CellValue) =>
    mutate((draft) => {
      const row = draft.rows.find((item) => item.id === rowId)
      if (row) row.cells[columnId] = value
    })

  const addRow = (cells: Record<string, CellValue> = {}) =>
    mutate((draft) => {
      draft.rows.push(newRow(cells))
    })

  const removeRow = (rowId: string) =>
    mutate((draft) => {
      draft.rows = draft.rows.filter((row) => row.id !== rowId)
    })

  const addColumn = (type: ColumnType) =>
    mutate((draft) => {
      draft.columns.push(newColumn(type))
    })

  const renameColumn = (columnId: string, name: string) =>
    mutate((draft) => {
      const column = draft.columns.find((item) => item.id === columnId)
      if (column) column.name = name
    })

  const changeColumnType = (columnId: string, type: ColumnType) =>
    mutate((draft) => {
      const column = draft.columns.find((item) => item.id === columnId)
      if (!column) return
      column.type = type
      if (type === 'status' && (!column.options || column.options.length === 0)) {
        column.options = [...DEFAULT_STATUS_OPTIONS]
      }
    })

  const removeColumn = (columnId: string) =>
    mutate((draft) => {
      draft.columns = draft.columns.filter((column) => column.id !== columnId)
      for (const row of draft.rows) delete row.cells[columnId]
    })

  const addStatusOption = (columnId: string) =>
    mutate((draft) => {
      const column = draft.columns.find((item) => item.id === columnId)
      if (!column) return
      const options = column.options ?? [...DEFAULT_STATUS_OPTIONS]
      column.options = [...options, `Вариант ${options.length + 1}`]
    })

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PageCover page={page} containerClass={contentClass} />

        <div className={cx(contentClass, 'pb-32 pt-3')}>
          <EmojiPicker icon={page.icon} onPick={(icon) => void updatePage(page.id, { icon })}>
            <button
              type="button"
              title="Сменить иконку"
              className="mb-1 flex h-11 w-11 items-center justify-center rounded-md text-[38px] leading-none transition-colors hover:bg-hover"
            >
              {page.icon || '📊'}
            </button>
          </EmojiPicker>

          <GrowTextarea
            value={values.title}
            onChange={(title) => set({ title })}
            placeholder="Без названия"
            className="text-[40px] font-bold leading-[1.15] text-ink-strong"
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-raised p-0.5">
              {views.map((item) => {
                const ViewIcon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => mutate((draft) => void (draft.view = item.id))}
                    className={cx(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors',
                      view === item.id ? 'bg-active text-ink-strong' : 'text-muted hover:text-ink',
                    )}
                  >
                    <ViewIcon size={13} />
                    {item.label}
                  </button>
                )
              })}
            </div>

            <span className="text-[11.5px] text-faint">
              {doc.rows.length} записей · {doc.columns.length} колонок
            </span>

            <button
              onClick={() => {
                if (view === 'calendar') {
                  const date = dateColumn(doc)
                  addRow(date ? { [date.id]: new Date().toISOString().slice(0, 10) } : {})
                } else {
                  addRow()
                }
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#1d70c4]"
            >
              <Plus size={13} />
              Запись
            </button>
          </div>

          <div className="mt-4">
            {view === 'table' && (
              <TableView
                doc={doc}
                setCell={setCell}
                addRow={addRow}
                removeRow={removeRow}
                addColumn={addColumn}
                renameColumn={renameColumn}
                changeColumnType={changeColumnType}
                removeColumn={removeColumn}
                addStatusOption={addStatusOption}
              />
            )}
            {view === 'gallery' && (
              <GalleryView doc={doc} setCell={setCell} addRow={addRow} removeRow={removeRow} />
            )}
            {view === 'calendar' && (
              <CalendarView
                doc={doc}
                setCell={setCell}
                addRow={addRow}
                removeRow={removeRow}
                addColumn={addColumn}
              />
            )}
          </div>
        </div>
      </div>

      <SavePill status={status} />
    </>
  )
}

/* ---------------------------------------------------------------- таблица */

interface ViewProps {
  doc: DatabaseDoc
  setCell: (rowId: string, columnId: string, value: CellValue) => void
  addRow: (cells?: Record<string, CellValue>) => void
  removeRow: (rowId: string) => void
}

interface TableProps extends ViewProps {
  addColumn: (type: ColumnType) => void
  renameColumn: (columnId: string, name: string) => void
  changeColumnType: (columnId: string, type: ColumnType) => void
  removeColumn: (columnId: string) => void
  addStatusOption: (columnId: string) => void
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

/** Колонка-статус, задающая знак суммы: «Доход» прибавляем, «Расход» вычитаем. */
function signColumn(doc: DatabaseDoc): DbColumn | undefined {
  return doc.columns.find((column) => {
    if (column.type !== 'status') return false
    const options = column.options ?? []
    return options.includes('Доход') && options.includes('Расход')
  })
}

function columnTotal(doc: DatabaseDoc, column: DbColumn, sign?: DbColumn) {
  let total = 0
  for (const row of doc.rows) {
    const value = row.cells[column.id]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    if (!sign) {
      total += value
      continue
    }
    const kind = typeof row.cells[sign.id] === 'string' ? String(row.cells[sign.id]).toLowerCase() : ''
    if (/доход/.test(kind)) total += value
    else if (/расход/.test(kind)) total -= value
  }
  return total
}

function TableView({
  doc,
  setCell,
  addRow,
  removeRow,
  addColumn,
  renameColumn,
  changeColumnType,
  removeColumn,
  addStatusOption,
}: TableProps) {
  const sign = signColumn(doc)
  const numericColumns = doc.columns.filter((column) => column.type === 'number')

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-panel">
            <th className="w-8 border-b border-line" />
            {doc.columns.map((column) => (
              <ColumnHeader
                key={column.id}
                column={column}
                renameColumn={renameColumn}
                changeColumnType={changeColumnType}
                removeColumn={removeColumn}
                addStatusOption={addStatusOption}
              />
            ))}
            <th className="w-10 border-b border-l border-line">
              <AddColumn onPick={addColumn} />
            </th>
          </tr>
        </thead>
        <tbody>
          {doc.rows.map((row) => (
            <tr key={row.id} className="group/row transition-colors hover:bg-hover/40">
              <td className="border-b border-line px-1 text-center">
                <button
                  onClick={() => removeRow(row.id)}
                  title="Удалить запись"
                  className="flex h-6 w-6 items-center justify-center rounded text-faint opacity-0 transition hover:bg-raised hover:text-[#d95c5c] group-hover/row:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </td>
              {doc.columns.map((column) => (
                <td key={column.id} className="border-b border-l border-line/70 p-0 align-middle">
                  <Cell
                    column={column}
                    value={row.cells[column.id]}
                    onChange={(value) => setCell(row.id, column.id, value)}
                  />
                </td>
              ))}
              <td className="border-b border-l border-line/70" />
            </tr>
          ))}
          <tr>
            <td colSpan={doc.columns.length + 2} className="p-1">
              <button
                onClick={() => addRow()}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[12px] text-faint transition-colors hover:bg-hover hover:text-ink"
              >
                <Plus size={12} />
                Новая запись
              </button>
            </td>
          </tr>
        </tbody>
        {numericColumns.length > 0 && (
          <tfoot>
            <tr className="bg-panel/60">
              <td className="border-t border-line px-2 py-1.5 text-[10.5px] uppercase tracking-wide text-faint">
                {sign ? 'Баланс' : 'Итого'}
              </td>
              {doc.columns.map((column) => {
                if (column.type !== 'number') {
                  return <td key={column.id} className="border-l border-t border-line/70" />
                }
                const total = columnTotal(doc, column, sign)
                return (
                  <td
                    key={column.id}
                    title={sign ? 'Доходы минус расходы' : `Сумма по колонке «${column.name}»`}
                    className={cx(
                      'border-l border-t border-line/70 px-2 py-1.5 text-[12px] font-medium tabular-nums',
                      total < 0 ? 'text-[#e0a0a0]' : 'text-ink-strong',
                    )}
                  >
                    {numberFormat.format(total)}
                  </td>
                )
              })}
              <td className="border-l border-t border-line" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function ColumnHeader({
  column,
  renameColumn,
  changeColumnType,
  removeColumn,
  addStatusOption,
}: {
  column: DbColumn
  renameColumn: (columnId: string, name: string) => void
  changeColumnType: (columnId: string, type: ColumnType) => void
  removeColumn: (columnId: string) => void
  addStatusOption: (columnId: string) => void
}) {
  return (
    <th className="min-w-[132px] border-b border-l border-line p-0 align-top">
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <TypeIcon type={column.type} />
        <input
          value={column.name}
          onChange={(event) => renameColumn(column.id, event.target.value)}
          placeholder="Колонка"
          className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-muted outline-none placeholder:text-faint focus:text-ink-strong"
        />
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              title="Настроить колонку"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <ChevronDown size={11} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[208px]')}>
              <p className="mb-1 px-0.5 text-[10px] uppercase tracking-wide text-faint">Тип колонки</p>
              {COLUMN_TYPES.map((type) => (
                <button key={type} onClick={() => changeColumnType(column.id, type)} className={menuItem}>
                  <TypeIcon type={type} />
                  {COLUMN_LABELS[type]}
                  {column.type === type && <Check size={12} className="ml-auto text-accent" />}
                </button>
              ))}
              {column.type === 'status' && (
                <button onClick={() => addStatusOption(column.id)} className={menuItem}>
                  <Plus size={13} />
                  Вариант статуса
                </button>
              )}
              <div className="my-1 h-px bg-line" />
              <button
                onClick={() => removeColumn(column.id)}
                className={cx(menuItem, 'text-[#d95c5c] hover:text-[#f07a7a]')}
              >
                <Trash2 size={13} />
                Удалить колонку
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </th>
  )
}

function AddColumn({ onPick }: { onPick: (type: ColumnType) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          title="Добавить колонку"
          className="flex h-8 w-full items-center justify-center text-faint transition-colors hover:bg-hover hover:text-ink-strong"
        >
          <Plus size={13} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className={cx(popoverPanel, 'w-[196px]')}>
          <p className="mb-1 px-0.5 text-[10px] uppercase tracking-wide text-faint">Новая колонка</p>
          {COLUMN_TYPES.map((type) => (
            <button key={type} onClick={() => onPick(type)} className={menuItem}>
              <TypeIcon type={type} />
              {COLUMN_LABELS[type]}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Cell({
  column,
  value,
  onChange,
}: {
  column: DbColumn
  value: CellValue
  onChange: (value: CellValue) => void
}) {
  const inputClass =
    'h-8 w-full min-w-0 bg-transparent px-2 text-[12.5px] text-ink outline-none placeholder:text-faint/50 focus:bg-active/60'

  if (column.type === 'checkbox') {
    return (
      <div className="flex h-8 items-center justify-center">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="h-3.5 w-3.5 accent-[#2383e2]"
        />
      </div>
    )
  }

  if (column.type === 'status') {
    const options = column.options ?? []
    const current = typeof value === 'string' ? value : ''
    const all = current && !options.includes(current) ? [...options, current] : options
    const style = statusStyle(column, value)
    return (
      <div className="p-1">
        <select
          value={current}
          onChange={(event) => onChange(event.target.value || null)}
          style={{ background: style.bg, color: style.text }}
          className="w-full max-w-[160px] cursor-pointer appearance-none rounded px-1.5 py-1 text-[11.5px] outline-none"
        >
          <option value="">—</option>
          {all.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (column.type === 'date') {
    return (
      <input
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={cx(inputClass, '[color-scheme:dark]')}
      />
    )
  }

  if (column.type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        placeholder="—"
        className={inputClass}
      />
    )
  }

  return (
    <input
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder="—"
      className={inputClass}
    />
  )
}

/* ---------------------------------------------------------------- галерея */

function GalleryView({ doc, setCell, addRow, removeRow }: ViewProps) {
  const title = titleColumn(doc)
  const status = doc.columns.find((column) => column.type === 'status')
  const details = doc.columns
    .filter((column) => column.id !== title?.id && column.id !== status?.id)
    .slice(0, 3)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {doc.rows.map((row) => {
        const style = status ? statusStyle(status, row.cells[status.id]) : NEUTRAL_STATUS
        return (
          <article
            key={row.id}
            className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-[#3d3d3d]"
          >
            <div className="h-1 w-full shrink-0" style={{ background: style.dot }} />
            <div className="flex flex-col gap-2 p-3">
              {title && (
                <input
                  value={typeof row.cells[title.id] === 'string' ? String(row.cells[title.id]) : ''}
                  onChange={(event) => setCell(row.id, title.id, event.target.value)}
                  placeholder="Без названия"
                  className="w-full bg-transparent text-[13.5px] font-semibold text-ink-strong outline-none placeholder:text-faint/60"
                />
              )}

              {status && (
                <select
                  value={typeof row.cells[status.id] === 'string' ? String(row.cells[status.id]) : ''}
                  onChange={(event) => setCell(row.id, status.id, event.target.value || null)}
                  style={{ background: style.bg, color: style.text }}
                  className="w-fit cursor-pointer appearance-none rounded px-2 py-0.5 text-[11px] outline-none"
                >
                  <option value="">—</option>
                  {(status.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}

              {details.map((column) => (
                <label key={column.id} className="block">
                  <span className="block text-[9.5px] uppercase tracking-wide text-faint">{column.name}</span>
                  <Cell
                    column={column}
                    value={row.cells[column.id]}
                    onChange={(value) => setCell(row.id, column.id, value)}
                  />
                </label>
              ))}
            </div>

            <button
              onClick={() => removeRow(row.id)}
              title="Удалить запись"
              className="absolute right-1.5 top-2 flex h-6 w-6 items-center justify-center rounded bg-panel/80 text-faint opacity-0 transition hover:text-[#d95c5c] group-hover:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </article>
        )
      })}

      <button
        onClick={() => addRow()}
        className="flex min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-faint transition-colors hover:border-accent/50 hover:bg-hover/40 hover:text-ink"
      >
        <Plus size={18} />
        <span className="text-[12px]">Новая запись</span>
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- календарь */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function CalendarView({ doc, setCell, addRow, removeRow, addColumn }: ViewProps & {
  addColumn: (type: ColumnType) => void
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const dateCol = dateColumn(doc)

  if (!dateCol) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center">
        <CalendarDays size={22} className="text-faint" />
        <p className="text-[13px] text-muted">Для календаря нужна колонка с датой</p>
        <button
          onClick={() => addColumn('date')}
          className="rounded-md border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
        >
          Добавить колонку «Дата»
        </button>
      </div>
    )
  }

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const gridStart = new Date(year, monthIndex, 1 - offset)

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return { date, inMonth: date.getMonth() === monthIndex }
  })

  const byDay = new Map<string, typeof doc.rows>()
  for (const row of doc.rows) {
    const value = row.cells[dateCol.id]
    if (typeof value !== 'string' || !value) continue
    const list = byDay.get(value) ?? []
    list.push(row)
    byDay.set(value, list)
  }

  const today = dayKey(new Date())
  const label = monthFormat.format(month)

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          title="Предыдущий месяц"
          className={toolbarButton}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="min-w-[170px] text-[13.5px] font-semibold capitalize text-ink-strong">{label}</span>
        <button
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          title="Следующий месяц"
          className={toolbarButton}
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => setMonth(startOfMonth(new Date()))}
          className="rounded-md border border-line px-2 py-1 text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
        >
          Сегодня
        </button>
        <span className="ml-auto text-[11px] text-faint">Дата: {dateCol.name}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-panel">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-1.5 text-center text-[10px] uppercase tracking-wide text-faint"
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map(({ date, inMonth }) => {
            const key = dayKey(date)
            const entries = byDay.get(key) ?? []
            const isToday = key === today
            return (
              <div
                key={key}
                className={cx(
                  'group/day min-h-[118px] border-b border-r border-line/70 p-1.5 last:border-r-0',
                  !inMonth && 'bg-app/50',
                )}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={cx(
                      'flex h-5 min-w-5 items-center justify-center rounded text-[10.5px] tabular-nums',
                      isToday ? 'bg-accent px-1 text-white' : inMonth ? 'text-muted' : 'text-faint',
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <button
                    onClick={() => addRow({ [dateCol.id]: key })}
                    title="Добавить запись на этот день"
                    className="ml-auto flex h-4 w-4 items-center justify-center rounded text-faint opacity-0 transition hover:bg-hover hover:text-ink-strong group-hover/day:opacity-100"
                  >
                    <Plus size={11} />
                  </button>
                </div>

                <div className="mt-1 space-y-1">
                  {entries.map((row) => (
                    <CalendarChip
                      key={row.id}
                      doc={doc}
                      row={row}
                      setCell={setCell}
                      removeRow={removeRow}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CalendarChip({
  doc,
  row,
  setCell,
  removeRow,
}: {
  doc: DatabaseDoc
  row: DatabaseDoc['rows'][number]
  setCell: ViewProps['setCell']
  removeRow: ViewProps['removeRow']
}) {
  const title = titleColumn(doc)
  const status = doc.columns.find((column) => column.type === 'status')
  const style = status ? statusStyle(status, row.cells[status.id]) : NEUTRAL_STATUS
  const label = title ? String(row.cells[title.id] ?? '') || 'Без названия' : 'Запись'

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          title={label}
          className="block w-full truncate rounded px-1 py-0.5 text-left text-[10.5px] transition-opacity hover:opacity-80"
          style={{ background: style.bg, color: style.text }}
        >
          {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[264px]')}>
          <p className="mb-1.5 px-0.5 text-[10px] uppercase tracking-wide text-faint">Запись</p>
          {doc.columns.map((column) => (
            <label key={column.id} className="mb-1 block">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
                <TypeIcon type={column.type} />
                {column.name}
              </span>
              <div className="mt-0.5 rounded border border-line">
                <Cell
                  column={column}
                  value={row.cells[column.id]}
                  onChange={(value) => setCell(row.id, column.id, value)}
                />
              </div>
            </label>
          ))}
          <button
            onClick={() => removeRow(row.id)}
            className={cx(menuItem, 'mt-1 text-[#d95c5c] hover:text-[#f07a7a]')}
          >
            <Trash2 size={13} />
            Удалить запись
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
