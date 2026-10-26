import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { SaveStatus } from './useAutosave'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export const iconButton =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink-strong'

export const newItemButton =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink-strong'

export const toolbarButton =
  'inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded px-1.5 text-muted transition-colors hover:bg-hover hover:text-ink-strong'

export const toolbarButtonActive = 'bg-active text-ink-strong'

export const popoverPanel =
  'z-50 rounded-lg border border-line bg-raised p-2 shadow-xl shadow-black/50 outline-none'

export const menuItem =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong'

/** Текстовое поле, которое растёт под содержимое: заголовок страницы и базы. */
export function GrowTextarea({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Растём по содержимому, чтобы заголовок переносился как обычный текст.
  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    resize()
  }, [value, resize])

  // На первом кадре панель может быть ещё нулевой ширины: пересчитываем, когда ширина меняется,
  // иначе заголовок запоминает высоту, посчитанную в узком столбце.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - width) < 1) return
      width = el.clientWidth
      resize()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [resize])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cx(
        'block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-faint/60',
        className,
      )}
    />
  )
}

export function SavePill({ status }: { status: SaveStatus }) {
  return (
    <div className="pointer-events-none absolute bottom-5 right-6 flex items-center gap-2 text-[12px] text-faint">
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full transition-colors',
          status === 'saving' ? 'bg-accent' : 'bg-line',
        )}
      />
      {status === 'saving' ? 'Сохранение…' : 'Сохранено'}
    </div>
  )
}
