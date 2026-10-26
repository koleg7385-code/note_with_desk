import { Fragment, Suspense, lazy } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Maximize2, Minimize2, PanelLeft, Sparkles, Star, Trash2 } from 'lucide-react'
import {
  createBoard,
  createPage,
  getBoard,
  getPage,
  getTrail,
  toggleFavorite,
  updatePage,
} from '../db/repo'
import { useActions } from '../lib/appActions'
import { removeScreen, sameScreen } from '../lib/screens'
import type { ScreenRef } from '../lib/screens'
import { cx, iconButton } from '../lib/ui'
import { ErrorBoundary } from './ErrorBoundary'
import { SidePeek } from './SidePeek'

// Редактор и канвас тяжёлые: грузим их только когда экран действительно открыт.
const NoteEditor = lazy(() => import('./NoteEditor').then((module) => ({ default: module.NoteEditor })))
const DatabaseView = lazy(() =>
  import('./DatabaseView').then((module) => ({ default: module.DatabaseView })),
)
const BoardView = lazy(() => import('./BoardView').then((module) => ({ default: module.BoardView })))

const primaryButton =
  'rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1d70c4]'
const ghostButton =
  'rounded-md border border-line px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink-strong'

interface WorkspaceProps {
  active: ScreenRef | null
  sidebarCollapsed: boolean
  onOpenSidebar: () => void
}

export function Workspace({ active, sidebarCollapsed, onOpenSidebar }: WorkspaceProps) {
  const actions = useActions()

  // Третий аргумент даёт null на время запроса — иначе «не найдено» и «загружаю» не различить.
  const page = useLiveQuery(
    () => (active?.kind === 'page' ? getPage(active.id) : undefined),
    [active?.kind, active?.id],
    null,
  )
  const board = useLiveQuery(
    () => (active?.kind === 'board' ? getBoard(active.id) : undefined),
    [active?.kind, active?.id],
    null,
  )
  const trail = useLiveQuery(() => getTrail(active), [active?.kind, active?.id], null)

  const title = active?.kind === 'page' ? page?.title : board?.title
  const favorite = active?.kind === 'page' ? page?.favorite === 1 : board?.favorite === 1
  const wide = page?.wide === 1

  const removeActive = async () => {
    if (!active) return
    const question =
      active.kind === 'page'
        ? `Удалить страницу «${title || 'Без названия'}» вместе с подстраницами?`
        : `Удалить доску «${title || 'Без названия'}» вместе со всем, что внутри?`
    if (!confirm(question)) return
    const next = await removeScreen(active)
    if (sameScreen(actions.peek, active)) actions.closePeek()
    actions.select(next)
  }

  return (
    <div className="relative flex h-full min-h-0 bg-app">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-1 px-3">
          {sidebarCollapsed && (
            <button onClick={onOpenSidebar} title="Открыть сайдбар" className={iconButton}>
              <PanelLeft size={16} />
            </button>
          )}

          <Breadcrumbs trail={trail} active={active} />

          {active && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => void toggleFavorite(active, !favorite)}
                title={favorite ? 'Убрать из избранного' : 'В избранное'}
                className={cx(iconButton, favorite && 'text-[#d5a640] hover:text-[#e0b654]')}
              >
                <Star size={15} className={favorite ? 'fill-[#d5a640]' : undefined} />
              </button>
              {active.kind === 'page' && (
                <button
                  onClick={() => void updatePage(active.id, { wide: wide ? 0 : 1 })}
                  title={wide ? 'Обычная ширина' : 'На всю ширину'}
                  className={cx(iconButton, wide && 'bg-active text-ink-strong')}
                >
                  {wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              )}
              <button
                onClick={() => void removeActive()}
                title={active.kind === 'page' ? 'Удалить страницу' : 'Удалить доску'}
                className={iconButton}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </header>

        <Suspense fallback={<Pending />}>
          <ErrorBoundary key={active?.id ?? 'none'}>
            {!active ? (
              <StartScreen />
            ) : active.kind === 'page' ? (
              page === null ? (
                <Pending />
              ) : page ? (
                page.kind === 'database' ? (
                  <DatabaseView key={page.id} page={page} />
                ) : (
                  <NoteEditor key={page.id} page={page} />
                )
              ) : (
                <MissingScreen />
              )
            ) : board === null ? (
              <Pending />
            ) : board ? (
              <BoardView
                key={board.id}
                board={board}
                onSelect={(pageId) => actions.select({ kind: 'page', id: pageId })}
              />
            ) : (
              <MissingScreen />
            )}
          </ErrorBoundary>
        </Suspense>
      </div>

      {actions.peek && (
        <SidePeek screen={actions.peek} onClose={actions.closePeek} />
      )}
    </div>
  )
}

/** Хлебные крошки: каждый родитель кликабелен, текущая страница — просто текст. */
function Breadcrumbs({ trail, active }: { trail: Awaited<ReturnType<typeof getTrail>> | null; active: ScreenRef | null }) {
  const actions = useActions()

  if (!active) return <span />
  if (trail === null) return <span className="px-1 text-[12.5px] text-faint">Открываю…</span>
  if (trail.length === 0) return <span />

  return (
    <nav className="flex min-w-0 items-center gap-0.5 px-1 text-[12.5px]">
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1
        const label = crumb.title || 'Без названия'
        const icon = crumb.icon || (crumb.kind === 'board' ? '🧩' : '📄')
        return (
          <Fragment key={`${crumb.kind}:${crumb.id}`}>
            {index > 0 && <span className="shrink-0 px-0.5 text-faint">/</span>}
            {last ? (
              <span className="flex min-w-0 items-center gap-1 text-ink-strong">
                <span className="shrink-0">{icon}</span>
                <span className="truncate">{label}</span>
              </span>
            ) : (
              <button
                onClick={() => actions.select({ kind: crumb.kind, id: crumb.id })}
                title={label}
                className="flex max-w-[180px] min-w-0 items-center gap-1 rounded px-1 py-0.5 text-muted transition-colors hover:bg-hover hover:text-ink-strong"
              >
                <span className="shrink-0">{icon}</span>
                <span className="truncate">{label}</span>
              </button>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

function Pending() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-faint">
      Открываю…
    </div>
  )
}

function StartScreen() {
  const actions = useActions()

  const openNew = async (kind: ScreenRef['kind']) => {
    const created = kind === 'page' ? await createPage() : await createBoard()
    actions.select({ kind, id: created.id })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-[40px] leading-none">🗒️</div>
      <div>
        <p className="text-[15px] text-ink">Пока ничего не открыто</p>
        <p className="mt-1 text-[13px] text-faint">Выбери файл слева или начни с шаблона</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button className={primaryButton} onClick={() => void openNew('page')}>
          Новая заметка
        </button>
        <button className={ghostButton} onClick={() => void openNew('board')}>
          Новая доска
        </button>
        <button
          className={cx(ghostButton, 'inline-flex items-center gap-1.5')}
          onClick={() => actions.openTemplates(null)}
        >
          <Sparkles size={13} className="text-[#d5a640]" />
          Шаблоны
        </button>
      </div>
    </div>
  )
}

function MissingScreen() {
  const actions = useActions()

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[14px] text-muted">Объект не найден — похоже, его удалили</p>
      <button
        className={ghostButton}
        onClick={() => {
          void createPage().then((page) => actions.select({ kind: 'page', id: page.id }))
        }}
      >
        Создать заметку
      </button>
    </div>
  )
}
