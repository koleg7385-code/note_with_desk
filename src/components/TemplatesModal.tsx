import { useEffect, useState } from 'react'
import { ArrowRight, Sparkles, X } from 'lucide-react'
import {
  DATABASE_TEMPLATES,
  createDatabaseFromTemplate,
  createEmptyDatabase,
  type DatabaseTemplate,
} from '../db/database'
import type { ScreenRef } from '../lib/screens'
import { cx } from '../lib/ui'

interface TemplatesModalProps {
  open: boolean
  parentId: string | null
  onClose: () => void
  onCreated: (screen: ScreenRef) => void
}

/**
 * Модалка шаблонов: карточки с живым превью, создание базы в один клик.
 * parentId !== null — создаём внутри открытой страницы, иначе в корне.
 */
export function TemplatesModal({ open, parentId, onClose, onCreated }: TemplatesModalProps) {
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBusy(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const create = async (template: DatabaseTemplate) => {
    setBusy(template.id)
    try {
      const page = await createDatabaseFromTemplate(template, parentId)
      onCreated({ kind: 'page', id: page.id })
    } finally {
      setBusy(null)
    }
  }

  const createBlank = async () => {
    setBusy('blank')
    try {
      const page = await createEmptyDatabase(parentId)
      onCreated({ kind: 'page', id: page.id })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-6 py-10"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-5">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink-strong">Шаблоны</h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              {parentId
                ? 'База создастся внутри открытой страницы.'
                : 'База создастся в корне воркспейса — потом её можно вложить куда угодно.'}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Закрыть"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {DATABASE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => void create(template)}
                disabled={busy !== null}
                className={cx(
                  'group flex flex-col overflow-hidden rounded-xl border border-line bg-raised text-left transition-all',
                  'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl hover:shadow-black/40',
                  busy !== null && 'opacity-60',
                )}
              >
                <div
                  className="relative h-[136px] overflow-hidden border-b border-line px-3.5 py-3"
                  style={{
                    background: `radial-gradient(120% 100% at 20% 0%, ${template.accent}24, #1a1a1a 70%)`,
                  }}
                >
                  <Preview template={template} />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] leading-none">{template.icon}</span>
                    <span className="text-[13.5px] font-semibold text-ink-strong">{template.name}</span>
                  </div>
                  <p className="text-[12px] leading-snug text-faint">{template.tagline}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors group-hover:text-accent">
                    {busy === template.id ? 'Создаю…' : 'Создать базу'}
                    <ArrowRight size={12} />
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-line px-4 py-3">
            <div>
              <p className="text-[12.5px] text-ink">Нужна просто пустая база?</p>
              <p className="text-[11.5px] text-faint">Две колонки: название и статус. Дальше настроишь сам.</p>
            </div>
            <button
              onClick={() => void createBlank()}
              disabled={busy !== null}
              className="shrink-0 rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
            >
              {busy === 'blank' ? 'Создаю…' : 'Пустая база'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Мини-превью: настоящая раскладка будущей базы, а не скриншот. */
function Preview({ template }: { template: DatabaseTemplate }) {
  if (template.id === 'tasks') {
    return (
      <div className="space-y-1.5">
        {['Каркас', 'Крепёж', 'Покраска', 'Крыша'].map((row, index) => (
          <div key={row} className="flex items-center gap-2 rounded border border-white/5 bg-black/25 px-2 py-1">
            <span
              className="h-2.5 w-2.5 rounded-sm border"
              style={{
                borderColor: index < 2 ? template.accent : '#4a4a4a',
                background: index < 2 ? template.accent : 'transparent',
              }}
            />
            <span className="h-1.5 flex-1 rounded bg-white/10" style={{ maxWidth: `${52 - index * 6}%` }} />
            <span
              className="h-2 w-8 rounded-full"
              style={{
                background: index === 2 ? '#3a3a3a' : `${template.accent}55`,
              }}
            />
          </div>
        ))}
      </div>
    )
  }

  if (template.id === 'projects') {
    return (
      <div className="grid h-full grid-cols-3 gap-1.5">
        {['Идея', 'В работе', 'Готово'].map((column, index) => (
          <div key={column} className="rounded-md bg-black/25 p-1.5">
            <p className="mb-1 text-[8px] uppercase tracking-wide text-white/35">{column}</p>
            <div className="space-y-1">
              {Array.from({ length: 2 + (index % 2) }).map((_, card) => (
                <div key={card} className="rounded border border-white/5 bg-white/[0.06] p-1">
                  <span className="block h-1 w-3/4 rounded bg-white/20" />
                  <span
                    className="mt-1 block h-1 w-1/2 rounded"
                    style={{ background: index === 2 ? `${template.accent}88` : '#4a4a4a' }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (template.id === 'finance') {
    return (
      <div className="flex h-full flex-col justify-end gap-1.5">
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {[38, 62, 30, 74, 48, 86, 56].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-sm"
              style={{ height: `${height}%`, minHeight: 4, background: `${template.accent}${index % 2 ? '55' : 'aa'}` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-white/5 pt-1 text-[8px] text-white/30">
          <span>Доходы</span>
          <span>Расходы</span>
          <span style={{ color: `${template.accent}cc` }}>Итого</span>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-7 gap-1">
      {Array.from({ length: 28 }).map((_, day) => {
        const filled = day === 4 || day === 11 || day === 17 || day === 23
        return (
          <div
            key={day}
            className="flex flex-col items-center justify-center rounded-[3px] border border-white/[0.04] bg-black/20 text-[7px] text-white/25"
            style={filled ? { borderColor: `${template.accent}66`, background: `${template.accent}22` } : undefined}
          >
            {day + 1}
            {filled && <span className="mt-0.5 h-0.5 w-2.5 rounded-full" style={{ background: template.accent }} />}
          </div>
        )
      })}
    </div>
  )
}
