import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, PanelRight, X } from 'lucide-react'
import { getBoard, getPage, getTrail, listNodes } from '../db/repo'
import type { BoardNode } from '../db/db'
import { titleColumn } from '../db/database'
import { useActions } from '../lib/appActions'
import type { ScreenRef } from '../lib/screens'
import { cx } from '../lib/ui'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/** Боковой просмотр: быстро глянуть содержимое, не уходя с текущей страницы. */
export function SidePeek({ screen, onClose }: { screen: ScreenRef; onClose: () => void }) {
  const actions = useActions()
  const page = useLiveQuery(
    () => (screen.kind === 'page' ? getPage(screen.id) : undefined),
    [screen.kind, screen.id],
    null,
  )
  const board = useLiveQuery(
    () => (screen.kind === 'board' ? getBoard(screen.id) : undefined),
    [screen.kind, screen.id],
    null,
  )
  const trail = useLiveQuery(() => getTrail(screen), [screen.kind, screen.id], null)
  const nodes = useLiveQuery(
    (): Promise<BoardNode[]> =>
      screen.kind === 'board' ? listNodes(screen.id) : Promise.resolve([]),
    [screen.kind, screen.id],
    null,
  )

  const openFully = () => {
    actions.select(screen)
    onClose()
  }

  const trailPath = (trail ?? []).slice(0, -1)
  const icon = page?.icon || board?.icon || (screen.kind === 'board' ? '🧩' : '📄')
  const title = page?.title || board?.title || 'Без названия'
  const updatedAt = page?.updatedAt ?? board?.updatedAt

  return (
    <aside className="flex h-full w-[400px] max-w-[45%] shrink-0 flex-col border-l border-line bg-panel">
      <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-3">
        <PanelRight size={14} className="shrink-0 text-faint" />
        <span className="text-[11px] uppercase tracking-wide text-faint">Боковой просмотр</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={openFully}
            title="Открыть на весь экран"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            <ArrowRight size={15} />
          </button>
          <button
            onClick={onClose}
            title="Закрыть"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {trailPath.length > 0 && (
          <p className="mb-2 truncate text-[11px] text-faint">
            {trailPath.map((crumb) => crumb.title || 'Без названия').join(' / ')}
          </p>
        )}

        <div className="flex items-start gap-2.5">
          <span className="text-[30px] leading-none">{icon}</span>
          <h2 className="min-w-0 flex-1 break-words pt-1 text-[20px] font-bold leading-tight text-ink-strong">
            {title}
          </h2>
        </div>

        {updatedAt ? (
          <p className="mt-1.5 text-[11px] text-faint">Изменено {dateFormat.format(updatedAt)}</p>
        ) : null}

        <div className="mt-4">
          {screen.kind === 'page' ? (
            page === null ? (
              <Hint text="Открываю…" />
            ) : !page ? (
              <Hint text="Объект не найден" />
            ) : page.kind === 'database' ? (
              <DatabasePreview page={page} />
            ) : (
              <NotePreview text={page.text} />
            )
          ) : board === null ? (
            <Hint text="Открываю…" />
          ) : !board ? (
            <Hint text="Объект не найден" />
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] leading-relaxed text-muted">
                {board.description || 'Доска без описания.'}
              </p>
              <p className="text-[12px] text-faint">
                {nodes ? `${nodes.length} узлов` : 'Считаю узлы…'} · свободное рисование и текст без рамки
              </p>
            </div>
          )}
        </div>

        <button
          onClick={openFully}
          className={cx(
            'mt-5 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5',
            'text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink-strong',
          )}
        >
          Открыть страницу
          <ArrowRight size={12} />
        </button>
      </div>
    </aside>
  )
}

function NotePreview({ text }: { text: string }) {
  const lines = text.split('\n')
  if (!text.trim()) return <Hint text="Пустая заметка" />

  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed text-ink">
      {lines.map((line, index) =>
        line.trim() ? <p key={index}>{line}</p> : <div key={index} className="h-1.5" />,
      )}
    </div>
  )
}

function DatabasePreview({ page }: { page: NonNullable<Awaited<ReturnType<typeof getPage>>> }) {
  const doc = page.db
  if (!doc) return <Hint text="Пустая база" />

  const title = titleColumn(doc)
  const columns = doc.columns.slice(0, 3)

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-faint">
        База данных · {doc.rows.length} записей · {doc.columns.length} колонок
      </p>

      {title && doc.rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-line">
          {doc.rows.slice(0, 6).map((row, index) => (
            <div
              key={row.id}
              className={cx(
                'flex items-center gap-2 px-2.5 py-1.5 text-[12px]',
                index > 0 && 'border-t border-line',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-ink">
                {String(row.cells[title.id] ?? 'Без названия')}
              </span>
              {columns
                .filter((column) => column.id !== title.id)
                .slice(0, 2)
                .map((column) => (
                  <span key={column.id} className="shrink-0 text-[10.5px] text-faint">
                    {String(row.cells[column.id] ?? '—')}
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {doc.columns.map((column) => (
          <span
            key={column.id}
            className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-faint"
          >
            {column.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function Hint({ text }: { text: string }) {
  return <p className="text-[12.5px] text-faint">{text}</p>
}
