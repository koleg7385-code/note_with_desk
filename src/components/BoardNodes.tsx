import { createContext, Fragment, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { GripVertical, Scissors, X } from 'lucide-react'
import { deleteNode, getNode, getNodeWithPage, updateNode, updateNodeData } from '../db/repo'
import { useAssetUrl } from '../lib/assets'
import { cx } from '../lib/ui'
import { CropModal } from './CropModal'

export type BoardFlowNode = Node<{ dbId: string }, 'page' | 'sticky' | 'image' | 'text'>

/** Действия доски, доступные из узлов: сейчас — переход в заметку по двойному клику. */
export const BoardActions = createContext<{ openPage: (pageId: string) => void } | null>(null)

export const STICKY_COLORS = {
  yellow: { name: 'Жёлтый', swatch: '#d9c96a', card: 'border-[#4d4626] bg-[#332e1c] text-[#e8dfae]', hint: 'text-[#8a7f4a]' },
  green: { name: 'Зелёный', swatch: '#7fc48f', card: 'border-[#2f4a35] bg-[#1e2f22] text-[#bfe3c6]', hint: 'text-[#5d8a68]' },
  blue: { name: 'Голубой', swatch: '#7fb2e0', card: 'border-[#2b4159] bg-[#1c2a3a] text-[#bcd6f0]', hint: 'text-[#5b7fa3]' },
  pink: { name: 'Розовый', swatch: '#e08fb0', card: 'border-[#4d3140] bg-[#33202a] text-[#f0c4d4]', hint: 'text-[#a3677f]' },
  purple: { name: 'Сиреневый', swatch: '#a98fe0', card: 'border-[#413257] bg-[#2a2138] text-[#d8c6f0]', hint: 'text-[#7d6aa3]' },
  gray: { name: 'Серый', swatch: '#9a9a9a', card: 'border-[#3a3a3a] bg-[#262626] text-[#d4d4d4]', hint: 'text-[#7a7a7a]' },
} as const

export type StickyColor = keyof typeof STICKY_COLORS
export const STICKY_COLOR_ORDER: StickyColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'gray']

/** Прозрачный хитбокс вокруг точки: попасть по связи в разы проще, чем по самому кружку. */
const hitboxStyle: CSSProperties = {
  width: 20,
  height: 20,
  background: 'transparent',
  border: 'none',
  borderRadius: 999,
}

/** Просьба сфокусировать только что созданный текстовый узел: id становится известен после вставки. */
const focusRequests = new Set<string>()
const focusHandlers = new Map<string, () => void>()

export function requestTextFocus(nodeId: string) {
  const handler = focusHandlers.get(nodeId)
  if (handler) handler()
  else focusRequests.add(nodeId)
}

/**
 * Узел, добавленный после первого рендера доски, React Flow сам не измеряет:
 * наблюдатель размера для него не срабатывает, и узел остаётся с нулевой геометрией —
 * связи и миникарта считают его размер по стартовым значениям. Просим пересчитать.
 */
function useMeasureNode(nodeId: string, deps: unknown[] = []) {
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    // Эффект узла срабатывает раньше, чем React Flow запомнит свой DOM-контейнер,
    // поэтому первый замер уходит в пустоту. Повторяем после кадра и после раскладки панели,
    // иначе у узла остаётся пустой handleBounds и все связи пропадают с холста.
    updateNodeInternals(nodeId)
    const frame = requestAnimationFrame(() => updateNodeInternals(nodeId))
    const timer = window.setTimeout(() => updateNodeInternals(nodeId), 150)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [nodeId, updateNodeInternals, ...deps])
}

// Точки со всех четырёх сторон: тянуть связь можно откуда удобно.
const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const

/**
 * Точки привязки спрятаны, пока курсор не на карточке: холст должен оставаться чистым.
 * На каждой стороне одна видимая точка, а точно под ней — невидимый приёмник:
 * старые связи хранят id приёмника, а ConnectionMode.Loose разрешает и тянуть,
 * и принимать из любой точки. Появление, ховер и подсветка при протягивании —
 * в index.css (.react-flow__handle), там же класс .connections-active на время связи.
 */
function Handles() {
  return (
    <>
      {SIDES.map((side) => (
        <Fragment key={side.id}>
          <Handle id={side.id} type="source" position={side.position} style={hitboxStyle} className="handle-source">
            <span className="handle-dot" />
          </Handle>
          <Handle id={side.id} type="target" position={side.position} style={hitboxStyle} className="handle-target" />
        </Fragment>
      ))}
    </>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={onDelete}
      title="Удалить узел"
      className="nodrag absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-raised text-faint opacity-0 transition hover:text-ink-strong group-hover:opacity-100"
    >
      <X size={11} />
    </button>
  )
}

/** Зеркало заметки: показывает её содержимое, но копию не хранит. */
export function PageFlowNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const view = useLiveQuery(() => getNodeWithPage(data.dbId), [data.dbId], null)
  const node = view?.node
  const page = view?.page
  const actions = useContext(BoardActions)

  useMeasureNode(data.dbId, [page?.text, node?.w])

  const openPage = () => {
    if (page?.id) actions?.openPage(page.id)
  }

  return (
    <div
      className="group relative"
      style={{ width: node?.w ?? 240 }}
      onDoubleClick={openPage}
      title={page ? 'Двойной клик — открыть заметку' : undefined}
    >
      <div
        className={cx(
          'flex flex-col gap-2 rounded-lg border border-line bg-raised p-3 shadow-lg shadow-black/30',
          selected && 'ring-2 ring-accent/70',
        )}
      >
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-strong">
          <span>{page?.icon ?? '📄'}</span>
          <span className="truncate">{page?.title || 'Без названия'}</span>
        </div>
        <p className="line-clamp-3 text-[11.5px] leading-snug text-muted">{page?.text || 'Пустая заметка'}</p>
        <span className="text-[10px] uppercase tracking-wide text-faint">зеркало · 2 клика — открыть</span>
      </div>
      <DeleteButton onDelete={() => void deleteNode(data.dbId)} />
      <Handles />
    </div>
  )
}

export function StickyFlowNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const node = useLiveQuery(() => getNode(data.dbId), [data.dbId], null)
  const [text, setText] = useState<string | null>(null)
  const latest = useRef('')
  const touched = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  const color = STICKY_COLORS[(node?.color as StickyColor) ?? 'yellow'] ?? STICKY_COLORS.yellow
  const value = text ?? node?.data.text ?? ''
  latest.current = value

  useMeasureNode(data.dbId, [node?.w])

  // Дописываем несохранённое при размонтировании узла.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (touched.current) void updateNodeData(data.dbId, { text: latest.current })
    },
    [data.dbId],
  )

  const onChange = (next: string) => {
    setText(next)
    touched.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void updateNodeData(data.dbId, { text: next }), 500)
  }

  return (
    <div className="group relative" style={{ width: node?.w ?? 220 }}>
      <div
        className={cx(
          'flex min-h-[130px] flex-col rounded-lg border p-3 shadow-lg shadow-black/30',
          color.card,
          selected && 'ring-2 ring-accent/70',
        )}
      >
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Мысль…"
          className="nodrag nowheel min-h-[76px] w-full flex-1 resize-none bg-transparent text-[12.5px] leading-snug outline-none placeholder:opacity-50"
        />
        <span className={cx('mt-1 text-[10px] uppercase tracking-wide', color.hint)}>стикер</span>
      </div>
      <DeleteButton onDelete={() => void deleteNode(data.dbId)} />
      <Handles />
    </div>
  )
}

/** Текст без рамки: подпись на холсте, а не карточка. */
export function TextFlowNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const node = useLiveQuery(() => getNode(data.dbId), [data.dbId], null)
  const [text, setText] = useState<string | null>(null)
  const latest = useRef('')
  const touched = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const ref = useRef<HTMLTextAreaElement>(null)

  const value = text ?? node?.data.text ?? ''
  latest.current = value

  useMeasureNode(data.dbId, [value, node?.w])

  // Только что созданный текст сразу готов к вводу. Остальные текстовые узлы фокус не крадут.
  useEffect(() => {
    const focus = () => ref.current?.focus()
    focusHandlers.set(data.dbId, focus)
    if (focusRequests.delete(data.dbId)) focus()
    return () => {
      focusHandlers.delete(data.dbId)
      focusRequests.delete(data.dbId)
    }
  }, [data.dbId])

  // Растём по содержимому: подпись не должна скроллиться внутри узла.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (touched.current) void updateNodeData(data.dbId, { text: latest.current })
    },
    [data.dbId],
  )

  const onChange = (next: string) => {
    setText(next)
    touched.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void updateNodeData(data.dbId, { text: next }), 500)
  }

  return (
    <div className="group relative" style={{ width: node?.w ?? 260 }}>
      <div
        className={cx(
          'relative rounded-md border bg-app/40 px-2.5 py-1.5 transition-colors',
          selected ? 'border-accent/70 ring-1 ring-accent/30' : 'border-zinc-700/80 hover:border-zinc-600',
        )}
      >
        {/* Ручка перетаскивания: сам текст остаётся текстом и не уезжает при выделении мышью. */}
        <div
          title="Перетащить"
          className="board-drag-handle absolute -left-6 top-1/2 flex h-7 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded text-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Текст…"
          rows={1}
          className="nowheel block w-full resize-none overflow-hidden bg-transparent text-[14px] font-medium leading-snug text-ink-strong outline-none placeholder:text-faint/60"
        />
      </div>
      <DeleteButton onDelete={() => void deleteNode(data.dbId)} />
      <Handles />
    </div>
  )
}

export function ImageFlowNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const node = useLiveQuery(() => getNode(data.dbId), [data.dbId], null)
  const url = useAssetUrl(node?.refAssetId)
  const { getZoom } = useReactFlow()
  const [crop, setCrop] = useState(false)

  const [caption, setCaption] = useState<string | null>(null)
  const latestCaption = useRef('')
  const captionTimer = useRef<number | undefined>(undefined)

  const [width, setWidth] = useState<number | null>(null)

  const captionValue = caption ?? node?.data.caption ?? ''
  latestCaption.current = captionValue

  // Пересчитываем после загрузки картинки и после каждого изменения ширины.
  useMeasureNode(data.dbId, [url, width])

  // Зависимость только от id: при размонтировании нужен последний введённый текст, а не он же в deps.
  useEffect(
    () => () => {
      window.clearTimeout(captionTimer.current)
      if (caption !== null) void updateNodeData(data.dbId, { caption: latestCaption.current })
    },
    [data.dbId],
  )

  const onCaption = (value: string) => {
    setCaption(value)
    window.clearTimeout(captionTimer.current)
    captionTimer.current = window.setTimeout(() => void updateNodeData(data.dbId, { caption: value }), 500)
  }

  /** Тянем за уголок: ширина узла меняется с учётом текущего зума холста. */
  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Без preventDefault: он гасит совместимые события мыши, а от выделения текста
    // спасает select-none на самой ручке.
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = width ?? node?.w ?? 280
    const zoom = getZoom() || 1
    let next = startWidth

    const onMove = (moveEvent: PointerEvent) => {
      next = Math.max(120, Math.min(1000, Math.round(startWidth + (moveEvent.clientX - startX) / zoom)))
      setWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      void updateNode(data.dbId, { w: next })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="group relative" style={{ width: width ?? node?.w ?? 280 }}>
      <div
        className={cx(
          'flex flex-col rounded-lg border border-line bg-raised p-1.5 shadow-lg shadow-black/30',
          selected && 'ring-2 ring-accent/70',
        )}
      >
        {url ? (
          <img src={url} alt={captionValue} draggable={false} className="w-full rounded-md" />
        ) : (
          <div className="flex h-28 items-center justify-center rounded-md bg-app text-[11.5px] text-faint">
            Картинка загружается…
          </div>
        )}
        <input
          value={captionValue}
          onChange={(event) => onCaption(event.target.value)}
          placeholder="Подпись"
          className="nodrag mt-1.5 w-full bg-transparent px-1 text-[11.5px] text-muted outline-none placeholder:text-faint/70"
        />
      </div>

      {url && node?.refAssetId && (
        <button
          onClick={() => setCrop(true)}
          title="Вырезать фрагмент"
          className="nodrag absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/65 text-white/85 opacity-0 backdrop-blur transition hover:bg-black/80 hover:text-white group-hover:opacity-100"
        >
          <Scissors size={12} />
        </button>
      )}

      <div
        onPointerDown={onResizeStart}
        title="Потяни, чтобы изменить ширину"
        className="nodrag absolute -bottom-1 -right-1 h-3.5 w-3.5 cursor-nwse-resize select-none rounded-sm border border-[#6a6a6a] bg-raised opacity-0 transition-opacity group-hover:opacity-100"
      />
      <DeleteButton onDelete={() => void deleteNode(data.dbId)} />
      <Handles />

      {crop && node?.refAssetId && (
        <CropModal
          assetId={node.refAssetId}
          onClose={() => setCrop(false)}
          onApply={(assetId) => void updateNode(data.dbId, { refAssetId: assetId })}
        />
      )}
    </div>
  )
}
