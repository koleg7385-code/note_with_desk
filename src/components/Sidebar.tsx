import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import * as Popover from '@radix-ui/react-popover'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  Ellipsis,
  FileText,
  LayoutGrid,
  PanelLeftClose,
  PanelRight,
  PencilLine,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  createBoard,
  createChildBoard,
  createChildPage,
  createPage,
  duplicateItem,
  listTree,
  renameItem,
  toggleFavorite,
  type TreeItem,
} from '../db/repo'
import { exportDatabase, importDatabase } from '../db/backup'
import { useActions } from '../lib/appActions'
import { openTextFile, saveTextFile } from '../lib/desktop'
import { removeScreen, sameScreen } from '../lib/screens'
import type { ScreenRef } from '../lib/screens'
import { cx, iconButton, menuItem, newItemButton, popoverPanel } from '../lib/ui'

interface SidebarProps {
  active: ScreenRef | null
  onCollapse: () => void
}

type SidebarTab = 'tree' | 'library'
type LibraryFilter = 'recent' | 'favorites' | 'all'

const TAB_KEY = 'nwd.sidebar.tab'

const backupButton =
  'flex items-center justify-center gap-1 rounded-md border border-line px-1 py-1.5 text-[11px] text-muted transition-colors hover:bg-hover hover:text-ink-strong disabled:cursor-default'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })

const itemKey = (item: TreeItem) => `${item.kind}:${item.id}`
const iconOf = (item: TreeItem) =>
  item.icon || (item.kind === 'board' ? '🧩' : item.pageKind === 'database' ? '📊' : '📄')

export function Sidebar({ active, onCollapse }: SidebarProps) {
  const actions = useActions()
  // undefined — запрос ещё не вернулся, и это не то же самое, что пустой список.
  const items = useLiveQuery(listTree, [])
  const [tab, setTab] = useState<SidebarTab>(() =>
    localStorage.getItem(TAB_KEY) === 'library' ? 'library' : 'tree',
  )
  const [filter, setFilter] = useState<LibraryFilter>('recent')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const cancelRename = useRef(false)

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  const byId = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items])

  const childrenOf = useMemo(() => {
    const map = new Map<string, TreeItem[]>()
    for (const item of items ?? []) {
      if (!item.parentId || !byId.has(item.parentId)) continue
      const list = map.get(item.parentId) ?? []
      list.push(item)
      map.set(item.parentId, list)
    }
    return map
  }, [items, byId])

  const roots = useMemo(
    () => (items ?? []).filter((item) => !item.parentId || !byId.has(item.parentId)),
    [items, byId],
  )

  // Открытый из поиска ребёнок не должен оставаться внутри свёрнутой ветки.
  useEffect(() => {
    if (!active || !items) return
    const chain: string[] = []
    let current = byId.get(active.id)
    while (current?.parentId) {
      chain.push(current.parentId)
      current = byId.get(current.parentId)
    }
    if (chain.length === 0) return
    setCollapsed((previous) => {
      if (!chain.some((id) => previous.has(id))) return previous
      const next = new Set(previous)
      for (const id of chain) next.delete(id)
      return next
    })
  }, [active, items, byId])

  const toggleCollapsed = (item: TreeItem) => {
    const key = itemKey(item)
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expand = (parentId: string) => {
    setCollapsed((previous) => {
      if (!previous.has(parentId)) return previous
      const next = new Set(previous)
      next.delete(parentId)
      return next
    })
  }

  const addRootPage = async () => {
    const page = await createPage()
    actions.select({ kind: 'page', id: page.id })
  }

  const addRootBoard = async () => {
    const board = await createBoard()
    actions.select({ kind: 'board', id: board.id })
  }

  const addChild = async (item: TreeItem, kind: ScreenRef['kind']) => {
    setMenuKey(null)
    expand(item.id)
    const created = kind === 'page' ? await createChildPage(item.id) : await createChildBoard(item.id)
    actions.select({ kind, id: created.id })
  }

  const duplicate = async (item: TreeItem) => {
    setMenuKey(null)
    const copy = await duplicateItem({ kind: item.kind, id: item.id })
    if (!copy) return
    if (item.parentId) expand(item.parentId)
    actions.select(copy)
  }

  const startRename = (item: TreeItem) => {
    setMenuKey(null)
    cancelRename.current = false
    setRenaming(itemKey(item))
    setDraft(item.title)
  }

  const commitRename = async (item: TreeItem) => {
    if (cancelRename.current) {
      cancelRename.current = false
      setRenaming(null)
      return
    }
    const title = draft.trim()
    setRenaming(null)
    if (title === item.title) return
    await renameItem({ kind: item.kind, id: item.id }, title)
  }

  const favorite = async (item: TreeItem) => {
    setMenuKey(null)
    await toggleFavorite({ kind: item.kind, id: item.id }, !item.favorite)
  }

  const peek = (item: TreeItem) => {
    setMenuKey(null)
    actions.openPeek({ kind: item.kind, id: item.id })
  }

  const remove = async (item: TreeItem) => {
    setMenuKey(null)
    const label = item.title || 'Без названия'
    const question =
      item.kind === 'board'
        ? `Удалить доску «${label}» вместе со всем, что внутри?`
        : `Удалить страницу «${label}» вместе с подстраницами?`
    if (!confirm(question)) return

    const ref: ScreenRef = { kind: item.kind, id: item.id }
    const next = await removeScreen(ref)
    if (sameScreen(actions.peek, ref)) actions.closePeek()
    if (sameScreen(active, ref)) actions.select(next)
  }

  // В десктопной оболочке файл выбирается системным диалогом, в браузере — скачиванием.
  const doExport = async () => {
    setBusy(true)
    try {
      const json = await exportDatabase()
      const stamp = new Date().toISOString().slice(0, 10)
      await saveTextFile(`note-with-desk-${stamp}.json`, json)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    const json = await openTextFile()
    if (!json) return
    if (!confirm('Импорт заменит все текущие заметки и доски. Продолжить?')) return
    setBusy(true)
    try {
      await importDatabase(json)
      actions.select(null)
    } catch (error) {
      alert(`Не получилось: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const sourceOf = (item: TreeItem) => {
    const parts: string[] = []
    let parent = item.parentId ? byId.get(item.parentId) : undefined
    while (parent && parts.length < 8) {
      parts.unshift(parent.title || 'Без названия')
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return parts.length > 0 ? parts.join(' / ') : 'Корень'
  }

  const libraryRows = useMemo(() => {
    const all = [...(items ?? [])]
    if (filter === 'favorites') {
      return all.filter((item) => item.favorite).sort((a, b) => b.updatedAt - a.updatedAt)
    }
    if (filter === 'all') {
      return all.sort((a, b) => (a.title || 'Без названия').localeCompare(b.title || 'Без названия', 'ru'))
    }
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40)
  }, [items, filter])

  const renderTree = (item: TreeItem, depth: number) => {
    const key = itemKey(item)
    const kids = childrenOf.get(item.id) ?? []
    const open = !collapsed.has(key)
    const selected = active?.kind === item.kind && active.id === item.id

    return (
      <div key={key}>
        <div
          className={cx('group flex items-center rounded-md pr-1', selected ? 'bg-active' : 'hover:bg-hover')}
          style={{ paddingLeft: depth * 13 }}
        >
          {kids.length > 0 ? (
            <button
              onClick={() => toggleCollapsed(item)}
              title={open ? 'Свернуть ветку' : 'Развернуть ветку'}
              className="flex h-6 w-4 shrink-0 items-center justify-center text-faint transition-colors hover:text-ink"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {renaming === key ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commitRename(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void commitRename(item)
                }
                if (event.key === 'Escape') {
                  cancelRename.current = true
                  setRenaming(null)
                }
              }}
              className="my-0.5 min-w-0 flex-1 rounded border border-accent/70 bg-app px-1.5 py-0.5 text-[13px] text-ink-strong outline-none"
            />
          ) : (
            <button
              onClick={() => actions.select({ kind: item.kind, id: item.id })}
              onDoubleClick={() => startRename(item)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-[5px] pr-1 text-left text-[13.5px]"
            >
              <span className="w-4 shrink-0 text-center text-[13px] leading-none">{iconOf(item)}</span>
              <span className={cx('truncate', selected ? 'text-ink-strong' : 'text-muted group-hover:text-ink')}>
                {item.title || 'Без названия'}
              </span>
              {item.favorite && <Star size={10} className="shrink-0 fill-[#d5a640] text-[#d5a640]" />}
            </button>
          )}

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              onClick={() => void addChild(item, 'page')}
              title="Добавить подстраницу"
              className="flex h-6 w-6 items-center justify-center rounded text-faint transition hover:bg-raised hover:text-ink-strong"
            >
              <Plus size={13} />
            </button>

            <Popover.Root open={menuKey === key} onOpenChange={(value) => setMenuKey(value ? key : null)}>
              <Popover.Trigger asChild>
                <button
                  title="Действия"
                  className="flex h-6 w-6 items-center justify-center rounded text-faint transition hover:bg-raised hover:text-ink-strong"
                >
                  <Ellipsis size={14} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[212px]')}>
                  <button onClick={() => void favorite(item)} className={menuItem}>
                    <Star size={13} className={cx(item.favorite && 'fill-[#d5a640] text-[#d5a640]')} />
                    {item.favorite ? 'Убрать из избранного' : 'В избранное'}
                  </button>
                  <button onClick={() => void duplicate(item)} className={menuItem}>
                    <Copy size={13} />
                    Дублировать
                  </button>
                  <button onClick={() => startRename(item)} className={menuItem}>
                    <PencilLine size={13} />
                    Переименовать
                  </button>
                  <button onClick={() => peek(item)} className={menuItem}>
                    <PanelRight size={13} />
                    Открыть сбоку
                  </button>

                  <div className="my-1 h-px bg-line" />
                  <p className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-faint">Создать внутри</p>
                  <button onClick={() => void addChild(item, 'page')} className={menuItem}>
                    <FileText size={13} />
                    Подстраницу
                  </button>
                  <button onClick={() => void addChild(item, 'board')} className={menuItem}>
                    <LayoutGrid size={13} />
                    Доску
                  </button>

                  <div className="my-1 h-px bg-line" />
                  <button
                    onClick={() => void remove(item)}
                    className={cx(menuItem, 'text-[#d95c5c] hover:text-[#f07a7a]')}
                  >
                    <Trash2 size={13} />
                    Удалить
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>

        {kids.length > 0 && open && kids.map((child) => renderTree(child, depth + 1))}
      </div>
    )
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-11 shrink-0 items-center justify-between pl-3 pr-2">
        <span className="text-[13px] font-medium text-ink-strong">Мой воркспейс</span>
        <button onClick={onCollapse} title="Свернуть сайдбар" className={iconButton}>
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="mx-2 grid shrink-0 grid-cols-2 gap-0.5 rounded-lg bg-raised p-0.5">
        <button
          onClick={() => setTab('tree')}
          className={cx(
            'flex items-center justify-center gap-1 rounded-md py-1 text-[12px] transition-colors',
            tab === 'tree' ? 'bg-active text-ink-strong' : 'text-muted hover:text-ink',
          )}
        >
          <FileText size={12} />
          Дерево
        </button>
        <button
          onClick={() => setTab('library')}
          className={cx(
            'flex items-center justify-center gap-1 rounded-md py-1 text-[12px] transition-colors',
            tab === 'library' ? 'bg-active text-ink-strong' : 'text-muted hover:text-ink',
          )}
        >
          📚 Библиотека
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {tab === 'tree' ? (
          items === undefined ? (
            <Placeholder text="Загружаю…" />
          ) : roots.length === 0 ? (
            <Placeholder text="Пока пусто — создай первую страницу" />
          ) : (
            <div className="mt-2">{roots.map((item) => renderTree(item, 0))}</div>
          )
        ) : (
          <div className="mt-2">
            <div className="flex gap-1">
              {(
                [
                  { id: 'recent', label: 'Недавние' },
                  { id: 'favorites', label: '⭐ Избранное' },
                  { id: 'all', label: 'Все файлы' },
                ] as Array<{ id: LibraryFilter; label: string }>
              ).map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setFilter(chip.id)}
                  className={cx(
                    'rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
                    filter === chip.id
                      ? 'border-accent/50 bg-accent/15 text-ink-strong'
                      : 'border-line text-faint hover:text-ink',
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <table className="mt-2 w-full border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-faint">
                  <th className="px-1 pb-1 text-left font-medium">Файл</th>
                  <th className="px-1 pb-1 text-right font-medium">Изменено</th>
                </tr>
              </thead>
              <tbody>
                {libraryRows.length === 0 ? (
                  <tr>
                    <td colSpan={2}>
                      <Placeholder text={filter === 'favorites' ? 'В избранном пусто' : 'Пока пусто'} />
                    </td>
                  </tr>
                ) : (
                  libraryRows.map((item) => (
                    <tr
                      key={itemKey(item)}
                      onClick={() => actions.select({ kind: item.kind, id: item.id })}
                      onDoubleClick={() => actions.openPeek({ kind: item.kind, id: item.id })}
                      className={cx(
                        'cursor-pointer',
                        active?.kind === item.kind && active.id === item.id ? 'bg-active' : 'hover:bg-hover',
                      )}
                    >
                      <td className="min-w-0 rounded-l-md px-1 py-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="w-4 shrink-0 text-center text-[12px]">{iconOf(item)}</span>
                          <span className="truncate text-[12.5px] text-ink">{item.title || 'Без названия'}</span>
                          {item.favorite && (
                            <Star size={9} className="shrink-0 fill-[#d5a640] text-[#d5a640]" />
                          )}
                        </div>
                        <div className="truncate pl-[22px] text-[10px] text-faint">{sourceOf(item)}</div>
                      </td>
                      <td className="whitespace-nowrap rounded-r-md px-1 py-1.5 text-right align-top text-[10.5px] tabular-nums text-faint">
                        {dateFormat.format(item.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-0.5 border-t border-line p-2">
        <button onClick={() => void addRootPage()} className={newItemButton}>
          <Plus size={14} />
          Новая заметка
        </button>
        <button onClick={() => void addRootBoard()} className={newItemButton}>
          <Plus size={14} />
          Новая доска
        </button>
        <button onClick={() => actions.openTemplates(null)} className={newItemButton}>
          <Sparkles size={14} className="text-[#d5a640]" />
          Шаблоны и базы
          <Database size={12} className="ml-auto text-faint" />
        </button>
        <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-line pt-1.5">
          <button
            onClick={() => void doExport()}
            disabled={busy}
            title="Сохранить всю базу в один JSON"
            className={cx(backupButton, busy && 'opacity-50')}
          >
            <Download size={12} />
            Экспорт .json
          </button>
          <button
            onClick={() => void doImport()}
            disabled={busy}
            title="Загрузить базу из JSON (заменит текущие данные)"
            className={cx(backupButton, busy && 'opacity-50')}
          >
            <Upload size={12} />
            Импорт .json
          </button>
        </div>
      </div>
    </aside>
  )
}

function Placeholder({ text }: { text: string }) {
  return <p className="px-2 py-2 text-[12.5px] text-faint">{text}</p>
}
