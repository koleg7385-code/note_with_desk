import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  ChevronDown,
  Code,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  SquareCode,
  Table,
  Underline,
} from 'lucide-react'
import { putAsset } from '../db/repo'
import { imageFromFileList } from '../lib/assets'
import { cx, popoverPanel, toolbarButton, toolbarButtonActive } from '../lib/ui'

const TEXT_COLORS: Array<{ name: string; value: string | null }> = [
  { name: 'По умолчанию', value: null },
  { name: 'Серый', value: '#9a9a9a' },
  { name: 'Коричневый', value: '#b08968' },
  { name: 'Оранжевый', value: '#e08b3c' },
  { name: 'Жёлтый', value: '#d9b93a' },
  { name: 'Зелёный', value: '#5aa469' },
  { name: 'Синий', value: '#4d8fd6' },
  { name: 'Фиолетовый', value: '#9b6fd6' },
  { name: 'Розовый', value: '#d671a4' },
  { name: 'Красный', value: '#d95c5c' },
]

const HIGHLIGHTS: Array<{ name: string; value: string | null }> = [
  { name: 'Без выделения', value: null },
  { name: 'Жёлтый', value: '#f2e28a' },
  { name: 'Зелёный', value: '#b8e0a8' },
  { name: 'Голубой', value: '#a8d8e8' },
  { name: 'Розовый', value: '#f0b8d0' },
  { name: 'Фиолетовый', value: '#d0b8f0' },
  { name: 'Красный', value: '#f0a8a8' },
  { name: 'Серый', value: '#c8c8c8' },
]

const FONT_SIZES = [12, 14, 16, 18, 24, 32]

const BLOCKS = [
  { level: 0, name: 'Обычный текст' },
  { level: 1, name: 'Заголовок 1' },
  { level: 2, name: 'Заголовок 2' },
  { level: 3, name: 'Заголовок 3' },
]

/** Картинка кладётся в базу отдельной записью, в документе остаётся только её id. */
export async function insertImageFile(editor: Editor, file: File) {
  const asset = await putAsset(file, file.name)
  editor
    .chain()
    .focus()
    .insertContent({ type: 'image', attrs: { assetId: asset.id, alt: file.name } })
    .run()
}

function useToolbarState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading: current.isActive('heading', { level: 1 })
        ? 1
        : current.isActive('heading', { level: 2 })
          ? 2
          : current.isActive('heading', { level: 3 })
            ? 3
            : 0,
      fontSize: (current.getAttributes('textStyle').fontSize as string | undefined) ?? null,
      color: (current.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (current.getAttributes('highlight').color as string | undefined) ?? null,
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      inlineCode: current.isActive('code'),
      bulletList: current.isActive('bulletList'),
      taskList: current.isActive('taskList'),
      codeBlock: current.isActive('codeBlock'),
      inTable: current.isActive('table'),
    }),
  })
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useToolbarState(editor)
  const blockName = BLOCKS.find((block) => block.level === state.heading)?.name ?? 'Обычный текст'
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const setBlock = (level: number) => {
    if (level === 0) editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
  }

  const pickImage = async (files: FileList | null) => {
    const file = imageFromFileList(files)
    if (!file) return
    setUploading(true)
    try {
      await insertImageFile(editor, file)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line px-3 py-1.5">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" title="Стиль блока" className={cx(toolbarButton, 'gap-1 px-2 text-[12.5px]')}>
            {blockName}
            <ChevronDown size={11} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[176px]')}>
            {BLOCKS.map((block) => (
              <button
                key={block.level}
                onClick={() => setBlock(block.level)}
                className={cx(
                  'block w-full rounded px-2 py-1.5 text-left text-muted transition-colors hover:bg-hover hover:text-ink-strong',
                  block.level === 0 && 'text-[13px]',
                  block.level === 1 && 'text-[16px] font-bold',
                  block.level === 2 && 'text-[14.5px] font-bold',
                  block.level === 3 && 'text-[13.5px] font-semibold',
                )}
              >
                {block.name}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" title="Размер текста" className={cx(toolbarButton, 'gap-1 px-2 text-[12.5px]')}>
            {state.fontSize ? state.fontSize.replace('px', '') : 'Aa'}
            <ChevronDown size={11} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[92px]')}>
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => editor.chain().focus().setFontSize(`${size}px`).run()}
                className={cx(
                  'block w-full rounded px-2 py-1 text-left text-muted transition-colors hover:bg-hover hover:text-ink-strong',
                  state.fontSize === `${size}px` && toolbarButtonActive,
                )}
              >
                {size} px
              </button>
            ))}
            <button
              onClick={() => editor.chain().focus().unsetFontSize().run()}
              className="block w-full rounded px-2 py-1 text-left text-[12.5px] text-faint transition-colors hover:bg-hover hover:text-ink-strong"
            >
              Сбросить
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Divider />

      <ToolButton label="Жирный" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
      </ToolButton>
      <ToolButton label="Курсив" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
      </ToolButton>
      <ToolButton
        label="Подчёркнутый"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={14} />
      </ToolButton>

      <Palette
        label="Цвет текста"
        icon={<span className="text-[13px] font-semibold leading-none">A</span>}
        colors={TEXT_COLORS}
        active={state.color}
        onPick={(color) =>
          color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run()
        }
      />
      <Palette
        label="Цвет выделения"
        icon={<Highlighter size={14} />}
        colors={HIGHLIGHTS}
        active={state.highlight}
        onPick={(color) =>
          color
            ? editor.chain().focus().setHighlight({ color }).run()
            : editor.chain().focus().unsetHighlight().run()
        }
      />

      <Divider />

      <ToolButton
        label="Маркированный список"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </ToolButton>
      <ToolButton
        label="Чек-лист"
        active={state.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks size={14} />
      </ToolButton>
      <ToolButton
        label="Блок кода"
        active={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <SquareCode size={14} />
      </ToolButton>

      <TableMenu editor={editor} inTable={state.inTable} />

      <ToolButton label="Вставить картинку" onClick={() => fileInput.current?.click()} loading={uploading}>
        <ImagePlus size={14} />
      </ToolButton>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void pickImage(event.target.files)}
      />
    </div>
  )
}

/** Плавающая панель: то же самое, но только для выделенного текста. */
export function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const state = useToolbarState(editor)

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      className="flex items-center gap-0.5 rounded-lg border border-line bg-raised p-1 shadow-xl shadow-black/50"
    >
      <ToolButton label="Жирный" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
      </ToolButton>
      <ToolButton label="Курсив" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
      </ToolButton>
      <ToolButton
        label="Подчёркнутый"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={14} />
      </ToolButton>
      <ToolButton
        label="Код в строке"
        active={state.inlineCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={14} />
      </ToolButton>

      <Palette
        label="Цвет текста"
        icon={<span className="text-[13px] font-semibold leading-none">A</span>}
        colors={TEXT_COLORS}
        active={state.color}
        onPick={(color) =>
          color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run()
        }
      />
      <Palette
        label="Цвет выделения"
        icon={<Highlighter size={14} />}
        colors={HIGHLIGHTS}
        active={state.highlight}
        onPick={(color) =>
          color
            ? editor.chain().focus().setHighlight({ color }).run()
            : editor.chain().focus().unsetHighlight().run()
        }
      />
    </BubbleMenu>
  )
}

function TableMenu({ editor, inTable }: { editor: Editor; inTable: boolean }) {
  const item = 'block w-full rounded px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-hover'

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Таблица"
          aria-label="Таблица"
          className={cx(toolbarButton, inTable && toolbarButtonActive)}
        >
          <Table size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[212px]')}>
          {inTable ? (
            <>
              <button
                className={cx(item, 'text-muted hover:text-ink-strong')}
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                Добавить строку снизу
              </button>
              <button
                className={cx(item, 'text-muted hover:text-ink-strong')}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                Добавить столбец справа
              </button>
              <div className="my-1 h-px bg-line" />
              <button
                className={cx(item, 'text-muted hover:text-ink-strong')}
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                Удалить строку
              </button>
              <button
                className={cx(item, 'text-muted hover:text-ink-strong')}
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                Удалить столбец
              </button>
              <button
                className={cx(item, 'text-muted hover:text-ink-strong')}
                onClick={() => editor.chain().focus().mergeOrSplit().run()}
              >
                Объединить / разбить ячейки
              </button>
              <button
                className={cx(item, 'text-muted hover:text-ink-strong')}
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                Строка заголовка
              </button>
              <div className="my-1 h-px bg-line" />
              <button
                className={cx(item, 'text-[#d95c5c] hover:bg-hover')}
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                Удалить таблицу
              </button>
            </>
          ) : (
            <>
              {[
                { rows: 2, cols: 2, name: 'Таблица 2 × 2' },
                { rows: 3, cols: 3, name: 'Таблица 3 × 3' },
                { rows: 4, cols: 5, name: 'Таблица 4 × 5' },
              ].map((size) => (
                <button
                  key={size.name}
                  className={cx(item, 'text-muted hover:text-ink-strong')}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: size.rows, cols: size.cols, withHeaderRow: true })
                      .run()
                  }
                >
                  {size.name}
                </button>
              ))}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ToolButton({
  label,
  active,
  onClick,
  loading,
  children,
}: {
  label: string
  active?: boolean
  loading?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={loading}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cx(toolbarButton, active && toolbarButtonActive, loading && 'opacity-50')}
    >
      {children}
    </button>
  )
}

function Palette({
  label,
  icon,
  colors,
  active,
  onPick,
}: {
  label: string
  icon: ReactNode
  colors: Array<{ name: string; value: string | null }>
  active: string | null
  onPick: (color: string | null) => void
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" title={label} aria-label={label} className={cx(toolbarButton, 'gap-0.5 px-1.5')}>
          {icon}
          <ChevronDown size={10} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className={cx(popoverPanel, 'w-[188px]')}>
          <div className="grid grid-cols-5 gap-1">
            {colors.map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={() => onPick(color.value)}
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded border transition-colors hover:bg-hover',
                  active === color.value ? 'border-accent' : 'border-line/60',
                )}
              >
                {color.value === null ? (
                  <Eraser size={13} className="text-muted" />
                ) : (
                  <span className="h-4 w-4 rounded-sm" style={{ background: color.value }} />
                )}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Divider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-line" />
}