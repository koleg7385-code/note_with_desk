import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import MiniSearch from 'minisearch'
import { Search } from 'lucide-react'
import { listPages } from '../db/repo'
import type { Page } from '../db/db'
import type { ScreenRef } from '../lib/screens'
import { cx } from '../lib/ui'

/** Поиск по заметкам: Ctrl+K открывает, Enter переходит, Esc закрывает. */
export function SearchPalette({ onSelect }: { onSelect: (screen: ScreenRef) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const pages = useLiveQuery(listPages, []) ?? []

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setQuery('')
        setCursor(0)
        setOpen((value) => !value)
        return
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const index = useMemo(() => {
    const mini = new MiniSearch<{ id: string; title: string; text: string }>({
      fields: ['title', 'text'],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 2 } },
    })
    mini.addAll(
      pages.map((page) => ({ id: page.id, title: page.title || 'Без названия', text: page.text })),
    )
    return mini
  }, [pages])

  const results = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return pages.slice(0, 8)
    return index
      .search(trimmed)
      .slice(0, 8)
      .map((hit) => pages.find((page) => page.id === hit.id))
      .filter((page): page is Page => Boolean(page))
  }, [index, pages, query])

  const openPage = (page: Page) => {
    onSelect({ kind: 'page', id: page.id })
    setOpen(false)
  }

  const onInputKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => Math.min(value + 1, results.length - 1))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => Math.max(value - 1, 0))
    }
    if (event.key === 'Enter' && results[cursor]) {
      event.preventDefault()
      openPage(results[cursor])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-6 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-raised shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={onInputKey}
            placeholder="Поиск по заметкам…"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint/70"
          />
          <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10.5px] text-faint">
            Esc
          </span>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-2.5 py-3 text-[13px] text-faint">Ничего не нашлось</p>
          ) : (
            results.map((page, position) => (
              <button
                key={page.id}
                onClick={() => openPage(page)}
                onMouseEnter={() => setCursor(position)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  position === cursor ? 'bg-active' : 'hover:bg-hover',
                )}
              >
                <span className="w-4 shrink-0 text-center text-[14px]">{page.icon || '📄'}</span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cx(
                      'block truncate text-[13.5px]',
                      position === cursor ? 'text-ink-strong' : 'text-ink',
                    )}
                  >
                    {page.title || 'Без названия'}
                  </span>
                  {page.text ? (
                    <span className="mt-0.5 block truncate text-[11.5px] text-faint">
                      {page.text.slice(0, 96)}
                    </span>
                  ) : null}
                </span>
                {position === cursor ? (
                  <span className="shrink-0 text-[10.5px] text-faint">Enter</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}