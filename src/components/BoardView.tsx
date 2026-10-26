import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import * as Popover from '@radix-ui/react-popover'
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
  useViewport,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type NodeTypes,
  type OnNodeDrag,
} from '@xyflow/react'
import {
  ArrowLeftRight,
  Eraser,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Smile,
  StickyNote,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import {
  createEdge,
  createImageNode,
  createPageNode,
  createSticky,
  createTextNode,
  deleteEdge,
  deleteNode,
  listEdges,
  listNodes,
  listPages,
  putAsset,
  reverseEdge,
  updateBoard,
  updateDrawing,
  updateEdge,
  updateNode,
} from '../db/repo'
import type { Board, BoardNode, Edge as DbEdge, Page, Stroke } from '../db/db'
import { imageFromDataTransfer, imageFromFileList } from '../lib/assets'
import { useAutosave } from '../lib/useAutosave'
import { cx, popoverPanel, SavePill, toolbarButton, toolbarButtonActive } from '../lib/ui'
import { EmojiPicker } from './EmojiPicker'
import {
  BoardActions,
  ImageFlowNode,
  PageFlowNode,
  requestTextFocus,
  StickyFlowNode,
  STICKY_COLORS,
  STICKY_COLOR_ORDER,
  TextFlowNode,
  type BoardFlowNode,
  type StickyColor,
} from './BoardNodes'

const nodeTypes: NodeTypes = {
  page: PageFlowNode,
  sticky: StickyFlowNode,
  image: ImageFlowNode,
  text: TextFlowNode,
}

const EDGE_COLORS = ['#4a4a4a', '#4a9eff', '#46b17b', '#d5a640', '#d95c5c', '#a071e0']
const EDGE_WIDTHS = [2, 4]
const PEN_COLORS = ['#ededed', '#4a9eff', '#46b17b', '#d5a640', '#d95c5c', '#e08fb0']
const PEN_SIZES = [2, 4, 7]

type BoardEdgeData = {
  label: string
  color: string
  dashed: boolean
  width: number
}

type BoardFlowEdge = Edge<BoardEdgeData, 'board'>

/** Правки стрелки из мини-тулбара: сами обработчики живут в BoardCanvas. */
const EdgeActions = createContext<{
  update: (id: string, patch: Partial<DbEdge>) => void
  reverse: (id: string) => void
  remove: (id: string) => void
  deselect: (id: string) => void
} | null>(null)

const edgeTypes: EdgeTypes = { board: BoardEdge }

type Tool = 'select' | 'draw' | 'erase'

function flowType(kind: BoardNode['kind']): BoardFlowNode['type'] {
  if (kind === 'page') return 'page'
  if (kind === 'image') return 'image'
  if (kind === 'text') return 'text'
  return 'sticky'
}

/**
 * Стартовые размеры обязательны: React Flow держит узел невидимым, пока не измерит его,
 * а для узлов, добавленных после первого рендера, замер может не прийти вовсе —
 * тогда узел остаётся с visibility: hidden и не принимает ни клики, ни перетаскивание.
 */
function toFlowNode(row: BoardNode): BoardFlowNode {
  const width = row.w || 240
  const height = row.h || (row.kind === 'image' ? 200 : row.kind === 'text' ? 40 : 120)
  return {
    id: row.id,
    type: flowType(row.kind),
    position: { x: row.x, y: row.y },
    data: { dbId: row.id },
    initialWidth: width,
    initialHeight: height,
    // Без measured React Flow держит nodesInitialized === false и не рисует НИ ОДНОЙ связи,
    // пока узел не будет измерен. Для узлов, добавленных после монтирования, это окно
    // может не закрыться само — подставляем размер, дальше его уточнит ResizeObserver.
    measured: { width, height },
    // Текст перетаскивается только за ручку: иначе выделение текста мышью двигало бы узел.
    ...(row.kind === 'text' ? { dragHandle: '.board-drag-handle' } : {}),
  }
}

/**
 * Состав узлов берём из базы, а позиции во время перетаскивания держит React Flow:
 * иначе узел дёргался бы на каждом изменении из базы.
 */
function mergeNodes(previous: BoardFlowNode[], rows: BoardNode[]): BoardFlowNode[] {
  const known = new Map(previous.map((node) => [node.id, node]))
  return rows.map((row) => {
    const current = known.get(row.id)
    if (!current) return toFlowNode(row)
    return { ...current, type: flowType(row.kind) }
  })
}

function toFlowEdge(row: DbEdge): BoardFlowEdge {
  const color = row.color || '#4a4a4a'
  return {
    id: row.id,
    type: 'board',
    source: row.sourceId,
    target: row.targetId,
    sourceHandle: row.sourceHandle ?? 'right',
    targetHandle: row.targetHandle ?? 'left',
    data: {
      label: row.label ?? '',
      color,
      dashed: row.dashed === 1,
      width: row.width ?? 2,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
  }
}

/**
 * Своя стрелка: тулбар живёт через EdgeLabelRenderer, поэтому не нужно искать SVG-путь
 * в DOM и считать координаты вручную.
 */
function BoardEdge(props: EdgeProps<BoardFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, markerEnd } = props
  const data = props.data ?? { label: '', color: '#4a4a4a', dashed: false, width: 2 }
  const actions = useContext(EdgeActions)

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const [label, setLabel] = useState(data.label)
  const latestLabel = useRef(data.label)
  const labelTimer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  // Подпись могла поменяться снаружи, например после отмены действия.
  useEffect(() => {
    if (!dirty.current) setLabel(data.label)
  }, [data.label])

  // Не теряем недописанную подпись, если тулбар закрыли сразу после ввода.
  useEffect(
    () => () => {
      window.clearTimeout(labelTimer.current)
      if (dirty.current) actions?.update(id, { label: latestLabel.current })
    },
    [actions, id],
  )

  const changeLabel = (value: string) => {
    setLabel(value)
    latestLabel.current = value
    dirty.current = true
    window.clearTimeout(labelTimer.current)
    labelTimer.current = window.setTimeout(() => {
      if (!dirty.current) return
      dirty.current = false
      actions?.update(id, { label: latestLabel.current })
    }, 300)
  }

  const positionStyle = { transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }
  const toolbarStyle = { ...positionStyle, pointerEvents: 'all' as const }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: data.color,
          strokeWidth: data.width,
          strokeDasharray: data.dashed ? '6 5' : undefined,
        }}
      />

      {data.label && !selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded border border-line bg-raised px-1.5 py-0.5 text-[10.5px] text-muted"
            style={positionStyle}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}

      {selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute z-30 flex items-center gap-1.5 rounded-lg border border-line bg-raised px-2 py-1.5 shadow-xl shadow-black/60"
            style={toolbarStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-1">
              {EDGE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => actions?.update(id, { color })}
                  title="Цвет линии"
                  className={
                    'h-3.5 w-3.5 rounded-full border transition-transform hover:scale-110 ' +
                    (data.color === color ? 'border-white' : 'border-black/40')
                  }
                  style={{ background: color }}
                />
              ))}
            </div>

            <span className="h-5 w-px bg-line" />

            <div className="flex items-center gap-0.5">
              {EDGE_WIDTHS.map((width) => (
                <button
                  key={width}
                  onClick={() => actions?.update(id, { width })}
                  title={`Толщина ${width}px`}
                  className={
                    'flex h-6 w-6 items-center justify-center rounded transition-colors ' +
                    (data.width === width ? 'bg-active text-ink-strong' : 'text-muted hover:bg-hover')
                  }
                >
                  <span className="block rounded-full bg-current" style={{ width: 12, height: width }} />
                </button>
              ))}
            </div>

            <button
              onClick={() => actions?.update(id, { dashed: data.dashed ? 0 : 1 })}
              title={data.dashed ? 'Сплошная линия' : 'Пунктир'}
              className={
                'flex h-6 w-6 items-center justify-center rounded transition-colors ' +
                (data.dashed ? 'bg-active text-ink-strong' : 'text-muted hover:bg-hover hover:text-ink')
              }
            >
              <svg width="14" height="4" aria-hidden>
                <line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
              </svg>
            </button>

            <button
              onClick={() => actions?.reverse(id)}
              title="Развернуть стрелку"
              className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-hover hover:text-ink-strong"
            >
              <ArrowLeftRight size={13} />
            </button>

            <input
              value={label}
              onChange={(event) => changeLabel(event.target.value)}
              placeholder="Подпись"
              className="w-24 rounded border border-line bg-app px-1.5 py-0.5 text-[11.5px] text-ink outline-none placeholder:text-faint/70"
            />

            <button
              onClick={() => {
                window.clearTimeout(labelTimer.current)
                actions?.remove(id)
              }}
              title="Удалить связь"
              className="flex h-6 w-6 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-[#d95c5c]"
            >
              <Trash2 size={13} />
            </button>
            <button
              onClick={() => actions?.deselect(id)}
              title="Закрыть"
              className="flex h-6 w-6 items-center justify-center rounded text-faint transition-colors hover:bg-hover hover:text-ink-strong"
            >
              <X size={13} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

function strokeHit(stroke: Stroke, x: number, y: number, radius: number) {
  for (let index = 0; index < stroke.points.length - 1; index += 2) {
    const dx = stroke.points[index] - x
    const dy = stroke.points[index + 1] - y
    if (dx * dx + dy * dy <= radius * radius) return true
  }
  return false
}

function StrokePath({ stroke }: { stroke: Stroke }) {
  if (stroke.points.length < 2) return null
  if (stroke.points.length === 2) {
    return <circle cx={stroke.points[0]} cy={stroke.points[1]} r={stroke.width / 2} fill={stroke.color} />
  }

  let path = `M ${stroke.points[0]} ${stroke.points[1]}`
  for (let index = 2; index < stroke.points.length; index += 2) {
    path += ` L ${stroke.points[index]} ${stroke.points[index + 1]}`
  }
  return (
    <path
      d={path}
      fill="none"
      stroke={stroke.color}
      strokeWidth={stroke.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

export function BoardView({ board, onSelect }: { board: Board; onSelect: (pageId: string) => void }) {
  return (
    <ReactFlowProvider>
      <BoardCanvas board={board} onSelect={onSelect} />
    </ReactFlowProvider>
  )
}

function BoardCanvas({ board, onSelect }: { board: Board; onSelect: (pageId: string) => void }) {
  const { values, set, status } = useAutosave({ title: board.title }, (patch) =>
    void updateBoard(board.id, patch),
  )

  const rows = useLiveQuery(() => listNodes(board.id), [board.id])
  const edgeRows = useLiveQuery(() => listEdges(board.id), [board.id])
  const pages = useLiveQuery(listPages, []) ?? []

  const [nodes, setNodes, onNodesChange] = useNodesState<BoardFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<BoardFlowEdge>([])

  useEffect(() => {
    if (rows) setNodes((previous) => mergeNodes(previous, rows))
  }, [rows, setNodes])

  /**
   * Узлы приходят из IndexedDB уже после монтирования холста, поэтому React Flow успевает
   * отрисовать стрелки до того, как измерит точки привязки, и молча их прячет.
   * Догоняем замер, когда и узлы, и связи на месте.
   */
  const store = useStoreApi()
  useEffect(() => {
    if (!rows || !edgeRows) return
    const ids = rows.map((row) => row.id)
    // Замеряем синхронно: хук useUpdateNodeInternals откладывает работу в requestAnimationFrame,
    // а он в фоновой панели может не сработать вовсе — и тогда ни одна стрелка не появится.
    const measure = () => {
      const { domNode, updateNodeInternals } = store.getState()
      const updates = new Map()
      for (const id of ids) {
        const element = domNode?.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)
        if (element) updates.set(id, { id, nodeElement: element, force: true })
      }
      if (updates.size > 0) updateNodeInternals(updates)
    }
    measure()
    const first = window.setTimeout(measure, 60)
    const second = window.setTimeout(measure, 300)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [rows, edgeRows, store])

  useEffect(() => {
    if (!edgeRows) return
    // Выделение живёт в состоянии React Flow, а данные — в базе: после каждой правки стрелки
    // список приходит заново, и без переноса флага тулбар закрывался бы на первом же клике.
    setEdges((previous) => {
      const selected = new Set(previous.filter((edge) => edge.selected).map((edge) => edge.id))
      return edgeRows.map((row) => {
        const edge = toFlowEdge(row)
        return selected.has(edge.id) ? { ...edge, selected: true } : edge
      })
    })
  }, [edgeRows, setEdges])

  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const viewport = useViewport()

  /* ------------------------------------------------------------ рисование */

  const [tool, setTool] = useState<Tool>('select')
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [penWidth, setPenWidth] = useState(PEN_SIZES[1])

  const strokesRef = useRef<Stroke[]>(board.drawing ?? [])
  const [strokes, setStrokes] = useState<Stroke[]>(strokesRef.current)
  const [draft, setDraft] = useState<Stroke | null>(null)
  const drawingRef = useRef<Stroke | null>(null)
  const erasedRef = useRef(false)
  /** Снимки «как было» перед каждым изменением штрихов: Ctrl+Z отменяет последнее действие. */
  const historyRef = useRef<Stroke[][]>([])
  const erasePushed = useRef(false)

  const pushHistory = () => {
    historyRef.current.push(strokesRef.current)
    if (historyRef.current.length > 60) historyRef.current.shift()
  }

  const point = (event: { clientX: number; clientY: number }) =>
    screenToFlowPosition({ x: event.clientX, y: event.clientY })

  const undoStroke = useCallback(() => {
    const previous = historyRef.current.pop()
    if (!previous) return
    strokesRef.current = previous
    setStrokes(previous)
    void updateDrawing(board.id, previous)
  }, [board.id])

  const onDrawDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = point(event)
    if (tool === 'draw') {
      const stroke: Stroke = { color: penColor, width: penWidth, points: [start.x, start.y] }
      drawingRef.current = stroke
      setDraft(stroke)
      return
    }

    erasePushed.current = false
    const radius = 16 / (viewport.zoom || 1)
    const next = strokesRef.current.filter((item) => !strokeHit(item, start.x, start.y, radius))
    if (next.length !== strokesRef.current.length) {
      pushHistory()
      erasePushed.current = true
      strokesRef.current = next
      setStrokes(next)
      erasedRef.current = true
    }
  }

  const onDrawMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drawingRef.current
    if (tool === 'draw' && current) {
      const next = point(event)
      const length = current.points.length
      const lastX = current.points[length - 2]
      const lastY = current.points[length - 1]
      const minDistance = 1.2 / (viewport.zoom || 1)
      if ((next.x - lastX) ** 2 + (next.y - lastY) ** 2 < minDistance * minDistance) return
      current.points.push(next.x, next.y)
      setDraft({ ...current, points: [...current.points] })
      return
    }

    if (tool === 'erase') {
      const next = point(event)
      const radius = 16 / (viewport.zoom || 1)
      const kept = strokesRef.current.filter((item) => !strokeHit(item, next.x, next.y, radius))
      if (kept.length !== strokesRef.current.length) {
        if (!erasePushed.current) {
          pushHistory()
          erasePushed.current = true
        }
        strokesRef.current = kept
        setStrokes(kept)
        erasedRef.current = true
      }
    }
  }

  const onDrawUp = () => {
    if (tool === 'draw' && drawingRef.current) {
      pushHistory()
      const next = [...strokesRef.current, drawingRef.current]
      strokesRef.current = next
      setStrokes(next)
      setDraft(null)
      drawingRef.current = null
      void updateDrawing(board.id, next)
      return
    }

    if (erasedRef.current) {
      erasedRef.current = false
      void updateDrawing(board.id, strokesRef.current)
    }
  }

  // Ctrl+Z отменяет последнее действие с рисунком; в полях ввода отмену делает сам браузер.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undoStroke()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoStroke])

  /* ------------------------------------------------------------ узлы */

  /**
   * Новый узел появляется в центре видимой части холста. Если место занято,
   * сдвигаем его по диагонали — иначе узел прячется под уже существующим.
   */
  const freeSpot = (width: number, height: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 900) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    })
    let x = Math.round(center.x - width / 2)
    let y = Math.round(center.y - height / 2)
    for (let step = 0; step < 40; step += 1) {
      const taken = (rows ?? []).some(
        (node) => Math.abs(node.x - x) < 60 && Math.abs(node.y - y) < 60,
      )
      if (!taken) break
      x += 34
      y += 34
    }
    return { x, y }
  }

  const addSticky = (color: StickyColor) => {
    const spot = freeSpot(220, 130)
    void createSticky(board.id, spot.x, spot.y, color)
  }

  const addText = async () => {
    const spot = freeSpot(260, 40)
    const node = await createTextNode(board.id, spot.x, spot.y, '')
    requestTextFocus(node.id)
  }

  const addPageNode = (pageId: string) => {
    const spot = freeSpot(240, 110)
    void createPageNode(board.id, pageId, spot.x, spot.y)
  }

  const addImage = useCallback(
    async (file: File) => {
      const spot = freeSpot(280, 200)
      const asset = await putAsset(file, file.name)
      await createImageNode(board.id, asset.id, spot.x, spot.y)
    },
    // freeSpot читает текущий список узлов и трансформацию холста
    [board.id, rows, screenToFlowPosition],
  )

  // Картинка из буфера, когда открыта доска. Поля ввода не перехватываем.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      // Поля ввода не перехватываем: там вставка текста. Целью события может быть и не элемент.
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return
      const file = imageFromDataTransfer(event.clipboardData)
      if (!file) return
      event.preventDefault()
      void addImage(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImage])

  const onNodeDragStop: OnNodeDrag<BoardFlowNode> = useCallback((_event, node) => {
    void updateNode(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })
  }, [])

  /** Единственная точка создания связи: петля на себя и дубль — мусор на холсте, до базы не доходит. */
  const connectNodes = useCallback(
    (
      source: string,
      target: string,
      handles: { sourceHandle?: string | null; targetHandle?: string | null } = {},
    ) => {
      if (source === target) return
      const duplicate = (edgeRows ?? []).some(
        (edge) => edge.sourceId === source && edge.targetId === target,
      )
      if (duplicate) return
      void createEdge(board.id, source, target, handles)
    },
    [board.id, edgeRows],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      connectNodes(connection.source, connection.target, {
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      })
    },
    [connectNodes],
  )

  /* ------------------------------------------------------------ связь в два клика */

  /**
   * У React Flow есть свой режим «связь в два клика» (connectOnClick): первый клик по
   * точке ждёт второй клик по точке другой карточки. Сами клики обрабатывает React Flow,
   * мы добавляем только обрамление: подсказку, проявление точек на всех карточках и
   * отмену по Esc или клику по холсту — без этого режим «прилипает» до второго клика.
   */
  const [dragConnecting, setDragConnecting] = useState(false)
  const [clickConnecting, setClickConnecting] = useState(false)

  const cancelClickConnect = useCallback(() => {
    // Состояние режима живёт в сторе React Flow — сбрасываем его напрямую.
    store.setState({ connectionClickStartHandle: null })
    setClickConnecting(false)
  }, [store])

  useEffect(() => {
    if (!clickConnecting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelClickConnect()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clickConnecting, cancelClickConnect])

  const onNodesDelete = useCallback((deleted: BoardFlowNode[]) => {
    for (const node of deleted) void deleteNode(node.id)
  }, [])

  const onEdgesDelete = useCallback((deleted: BoardFlowEdge[]) => {
    for (const edge of deleted) void deleteEdge(edge.id)
  }, [])

  /** Действия мини-тулбара стрелки: контекст читает сама стрелка. */
  const edgeActions = useMemo(
    () => ({
      update: (id: string, patch: Partial<DbEdge>) => void updateEdge(id, patch),
      reverse: (id: string) => void reverseEdge(id),
      remove: (id: string) => void deleteEdge(id),
      deselect: (id: string) =>
        setEdges((current) => current.map((edge) => (edge.id === id ? { ...edge, selected: false } : edge))),
    }),
    [setEdges],
  )

  const drawing = tool !== 'select'

  const transform = `translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`

  return (
    <BoardActions.Provider value={{ openPage: onSelect }}>
      <EdgeActions.Provider value={edgeActions}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <EmojiPicker icon={board.icon} onPick={(icon) => void updateBoard(board.id, { icon })}>
          <button
            type="button"
            title="Сменить иконку"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[20px] leading-none transition-colors hover:bg-hover"
          >
            {board.icon || <Smile size={18} className="text-faint" />}
          </button>
        </EmojiPicker>

        <input
          value={values.title}
          onChange={(event) => set({ title: event.target.value })}
          placeholder="Без названия"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink-strong outline-none placeholder:text-faint/60"
        />

        <span className="hidden shrink-0 text-[12px] text-faint lg:inline">
          {nodes.length} узлов · {edges.length} связей
        </span>

        <StickerMenu onPick={addSticky} />
        <ToolbarButton
          icon={<Type size={13} />}
          label="Текст"
          title="Добавить текст без рамки"
          onClick={addText}
        />
        <ToolbarButton
          icon={<ImagePlus size={13} />}
          label="Фото"
          title="Добавить фото с компьютера"
          onClick={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = imageFromFileList(event.target.files)
            if (file) void addImage(file)
            event.target.value = ''
          }}
        />
        <PageMenu pages={pages} onPick={addPageNode} />

        <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />

        <button
          onClick={() => setTool((value) => (value === 'draw' ? 'select' : 'draw'))}
          title="Свободное рисование маркером"
          className={cx(toolbarButton, 'gap-1.5 px-2 text-[12.5px]', tool === 'draw' && toolbarButtonActive)}
        >
          <Pencil size={13} />
          Рисовать
        </button>
        <button
          onClick={() => setTool((value) => (value === 'erase' ? 'select' : 'erase'))}
          title="Ластик: убирает штрихи целиком"
          className={cx(toolbarButton, 'gap-1.5 px-2 text-[12.5px]', tool === 'erase' && toolbarButtonActive)}
        >
          <Eraser size={13} />
          Ластик
        </button>
      </div>

      {drawing && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-4 py-1.5">
          <span className="text-[11.5px] text-faint">
            {tool === 'draw' ? 'Маркер: веди мышью по холсту' : 'Ластик: проведи по штриху'}
          </span>
          {tool === 'draw' && (
            <>
              <div className="flex items-center gap-1">
                {PEN_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setPenColor(color)}
                    title={color}
                    className={cx(
                      'h-4 w-4 rounded-full border transition-transform',
                      penColor === color ? 'scale-110 border-white' : 'border-black/40 hover:scale-105',
                    )}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                {PEN_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => setPenWidth(size)}
                    title={`Толщина ${size}`}
                    className={cx(
                      'flex h-5 w-5 items-center justify-center rounded transition-colors',
                      penWidth === size ? 'bg-active' : 'hover:bg-hover',
                    )}
                  >
                    <span
                      className="block rounded-full bg-ink"
                      style={{ width: size + 2, height: size + 2 }}
                    />
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => setTool('select')}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-[11.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            Готово
          </button>
        </div>
      )}

      <div
        ref={canvasRef}
        className={cx('relative min-h-0 flex-1', (dragConnecting || clickConnecting) && 'connections-active')}
      >
        {clickConnecting && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg border border-accent/50 bg-raised px-3 py-1.5 text-[12px] text-ink shadow-lg shadow-black/40">
            Кликните по точке другой карточки, чтобы провести связь · клик по холсту или Esc — отмена
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectStart={() => setDragConnecting(true)}
          onConnectEnd={() => setDragConnecting(false)}
          onClickConnectStart={() => setClickConnecting(true)}
          onClickConnectEnd={() => setClickConnecting(false)}
          onPaneClick={cancelClickConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.35, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={2}
          zoomOnDoubleClick={false}
          // Backspace не удаляет узел: им правят текст в узлах.
          deleteKeyCode={['Delete']}
          panOnDrag={!drawing}
          nodesDraggable={!drawing}
          elementsSelectable={!drawing}
          zoomOnScroll={!drawing}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2b2b2b" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="top-right"
            pannable
            zoomable
            style={{ background: '#202020' }}
            maskColor="rgba(0, 0, 0, 0.55)"
            nodeColor="#3a3a3a"
          />
        </ReactFlow>

        {/* Штрихи видны всегда, даже когда инструмент выключен. */}
        <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full">
          <g transform={transform}>
            {strokes.map((stroke, index) => (
              <StrokePath key={index} stroke={stroke} />
            ))}
          </g>
        </svg>

        {/* Пока включён маркер или ластик, этот слой перехватывает мышь поверх холста. */}
        {drawing && (
          <svg
            className="absolute inset-0 z-[6] h-full w-full touch-none"
            style={{ cursor: tool === 'erase' ? 'cell' : 'crosshair' }}
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
            onPointerCancel={onDrawUp}
          >
            <g transform={transform}>
              {draft && <StrokePath stroke={draft} />}
            </g>
          </svg>
        )}

      </div>

      <SavePill status={status} />
      </EdgeActions.Provider>
    </BoardActions.Provider>
  )
}

function ToolbarButton({
  icon,
  label,
  title,
  onClick,
}: {
  icon: ReactNode
  label: string
  title?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
    >
      {icon}
      {label}
    </button>
  )
}

function StickerMenu({ onPick }: { onPick: (color: StickyColor) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong">
          <StickyNote size={13} />
          Стикер
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className={cx(popoverPanel, 'w-[188px]')}>
          <p className="mb-1.5 px-0.5 text-[11px] uppercase tracking-wide text-faint">Цвет стикера</p>
          <div className="grid grid-cols-3 gap-1">
            {STICKY_COLOR_ORDER.map((color) => (
              <button
                key={color}
                onClick={() => onPick(color)}
                title={STICKY_COLORS[color].name}
                className="flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
              >
                <span
                  className="h-5 w-8 rounded border border-black/30"
                  style={{ background: STICKY_COLORS[color].swatch }}
                />
                {STICKY_COLORS[color].name}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function PageMenu({ pages, onPick }: { pages: Page[]; onPick: (pageId: string) => void }) {
  const [query, setQuery] = useState('')
  const found = pages.filter((page) =>
    (page.title || 'Без названия').toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <Popover.Root onOpenChange={() => setQuery('')}>
      <Popover.Trigger asChild>
        <button className="hidden shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong xl:flex">
          <Plus size={13} />
          Заметка на доску
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className={cx(popoverPanel, 'w-[268px]')}>
          <div className="mb-1.5 flex items-center gap-1.5 rounded-md border border-line bg-app px-2 py-1">
            <Search size={13} className="shrink-0 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти заметку"
              className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint/70"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {found.length === 0 ? (
              <p className="px-1 py-2 text-[12.5px] text-faint">Ничего не нашлось</p>
            ) : (
              found.map((page) => (
                <button
                  key={page.id}
                  onClick={() => onPick(page.id)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
                >
                  <span className="w-4 shrink-0 text-center">{page.icon ?? '📄'}</span>
                  <span className="truncate">{page.title || 'Без названия'}</span>
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
