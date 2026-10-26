import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Scissors, X } from 'lucide-react'
import { putAsset } from '../db/repo'
import { useAssetUrl } from '../lib/assets'
import { cx } from '../lib/ui'

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type Interaction =
  | { mode: 'new'; startX: number; startY: number }
  | { mode: 'move'; startX: number; startY: number; base: CropRect }
  | { mode: 'resize'; startX: number; startY: number; base: CropRect; corner: Corner }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Обрезка фото: выделяем рамку прямо по картинке, применяем — в базу кладётся
 * новый asset, а документ/узел начинает ссылаться на него. Исходник не трогаем.
 */
export function CropModal({
  assetId,
  onApply,
  onClose,
}: {
  assetId: string
  onApply: (assetId: string) => void
  onClose: () => void
}) {
  const url = useAssetUrl(assetId)
  const imageRef = useRef<HTMLImageElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const interaction = useRef<Interaction | null>(null)
  const [rect, setRect] = useState<CropRect | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0, w: 0, h: 0 }
    return {
      x: clamp(event.clientX - box.left, 0, box.width),
      y: clamp(event.clientY - box.top, 0, box.height),
      w: box.width,
      h: box.height,
    }
  }

  const startNew = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy) return
    const point = localPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    interaction.current = { mode: 'new', startX: point.x, startY: point.y }
    setRect({ x: point.x, y: point.y, w: 0, h: 0 })
  }

  const startMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || !rect) return
    event.stopPropagation()
    const point = localPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    interaction.current = { mode: 'move', startX: point.x, startY: point.y, base: rect }
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, corner: Corner) => {
    if (busy || !rect) return
    event.stopPropagation()
    const point = localPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    interaction.current = { mode: 'resize', startX: point.x, startY: point.y, base: rect, corner }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interaction.current
    if (!current) return
    const point = localPoint(event)

    if (current.mode === 'new') {
      const x = Math.min(current.startX, point.x)
      const y = Math.min(current.startY, point.y)
      setRect({
        x,
        y,
        w: Math.abs(point.x - current.startX),
        h: Math.abs(point.y - current.startY),
      })
      return
    }

    if (current.mode === 'move') {
      const dx = point.x - current.startX
      const dy = point.y - current.startY
      setRect({
        x: clamp(current.base.x + dx, 0, point.w - current.base.w),
        y: clamp(current.base.y + dy, 0, point.h - current.base.h),
        w: current.base.w,
        h: current.base.h,
      })
      return
    }

    const { base, corner } = current
    const dx = point.x - current.startX
    const dy = point.y - current.startY
    const right = base.x + base.w
    const bottom = base.y + base.h
    let x = base.x
    let y = base.y
    let w = base.w
    let h = base.h

    if (corner === 'nw' || corner === 'sw') {
      x = clamp(base.x + dx, 0, right - 8)
      w = right - x
    } else {
      w = clamp(base.w + dx, 8, point.w - base.x)
    }
    if (corner === 'nw' || corner === 'ne') {
      y = clamp(base.y + dy, 0, bottom - 8)
      h = bottom - y
    } else {
      h = clamp(base.h + dy, 8, point.h - base.y)
    }

    setRect({ x, y, w, h })
  }

  const onPointerUp = () => {
    const current = interaction.current
    interaction.current = null
    if (!current) return
    setRect((value) => (value && (value.w < 8 || value.h < 8) ? null : value))
  }

  const apply = () => {
    const image = imageRef.current
    if (!image || !rect || rect.w < 4 || rect.h < 4) return

    const display = image.getBoundingClientRect()
    const scaleX = image.naturalWidth / display.width
    const scaleY = image.naturalHeight / display.height
    const width = Math.max(1, Math.round(rect.w * scaleX))
    const height = Math.max(1, Math.round(rect.h * scaleY))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(
      image,
      Math.round(rect.x * scaleX),
      Math.round(rect.y * scaleY),
      width,
      height,
      0,
      0,
      width,
      height,
    )

    setBusy(true)
    canvas.toBlob((blob) => {
      if (!blob) {
        setBusy(false)
        return
      }
      void putAsset(blob, 'crop.png').then((asset) => {
        onApply(asset.id)
        onClose()
      })
    }, 'image/png')
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
          <Scissors size={15} className="text-accent" />
          <span className="text-[13.5px] font-semibold text-ink-strong">Обрезать фото</span>
          <span className="text-[11.5px] text-faint">— выдели нужную часть рамкой</span>
          <button
            onClick={onClose}
            title="Закрыть"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#101010] p-4">
          {url ? (
            <div
              ref={boxRef}
              onPointerDown={startNew}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative inline-block max-w-full cursor-crosshair touch-none select-none"
            >
              <img
                ref={imageRef}
                src={url}
                alt="Обрезка"
                draggable={false}
                onLoad={(event) => {
                  const element = event.currentTarget
                  const width = element.getBoundingClientRect().width
                  const height = element.getBoundingClientRect().height
                  setRect({ x: width * 0.08, y: height * 0.08, w: width * 0.84, h: height * 0.84 })
                }}
                className="block max-h-[62vh] max-w-full rounded-md"
              />

              {rect && (
                <div
                  onPointerDown={startMove}
                  className="absolute cursor-move"
                  style={{
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
                    outline: '1px solid rgba(255, 255, 255, 0.9)',
                  }}
                >
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-y-0 left-1/3 w-px bg-white/20" />
                    <div className="absolute inset-y-0 right-1/3 w-px bg-white/20" />
                    <div className="absolute inset-x-0 top-1/3 h-px bg-white/20" />
                    <div className="absolute inset-x-0 bottom-1/3 h-px bg-white/20" />
                  </div>
                  {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
                    <div
                      key={corner}
                      onPointerDown={(event) => startResize(event, corner)}
                      className={cx(
                        'absolute h-3 w-3 rounded-sm border border-white bg-accent',
                        corner === 'nw' && '-left-1.5 -top-1.5 cursor-nwse-resize',
                        corner === 'ne' && '-right-1.5 -top-1.5 cursor-nesw-resize',
                        corner === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                        corner === 'se' && '-bottom-1.5 -right-1.5 cursor-nwse-resize',
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="py-16 text-[12.5px] text-faint">Картинка загружается…</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
          <span className="text-[11px] text-faint">
            {rect ? `${Math.round(rect.w)} × ${Math.round(rect.h)} px на экране` : 'Рамка не выбрана'}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
            >
              Отмена
            </button>
            <button
              onClick={apply}
              disabled={!rect || rect.w < 4 || rect.h < 4 || busy}
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1d70c4] disabled:cursor-default disabled:opacity-50"
            >
              {busy ? 'Обрезаю…' : 'Применить'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
