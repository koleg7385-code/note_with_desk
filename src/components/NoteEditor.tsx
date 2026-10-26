import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import { ArrowRight, Smile, Sparkles } from 'lucide-react'
import { updatePage } from '../db/repo'
import type { Page } from '../db/db'
import { DATABASE_TEMPLATES, createDatabaseFromTemplate } from '../db/database'
import { useActions } from '../lib/appActions'
import { imageFromDataTransfer } from '../lib/assets'
import { useAutosave } from '../lib/useAutosave'
import { cx, GrowTextarea, SavePill } from '../lib/ui'
import { EmojiPicker } from './EmojiPicker'
import { EditorBubbleMenu, EditorToolbar, insertImageFile } from './EditorToolbar'
import { NoteImage } from './NoteImage'
import { PageCover } from './PageCover'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/** Заметки из старого формата (плоский текст) превращаем в параграфы документа. */
function textToDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) =>
      line.trim() ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  }
}

export function NoteEditor({ page }: { page: Page }) {
  const { values, set, status } = useAutosave(
    { title: page.title, doc: page.doc ?? null, text: page.text },
    (patch) => void updatePage(page.id, patch),
  )
  const actions = useActions()
  const [hasBody, setHasBody] = useState(() => Boolean(page.text.trim()))
  const [creating, setCreating] = useState<string | null>(null)

  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      NoteImage,
      Placeholder.configure({ placeholder: 'Начни печатать…' }),
    ],
    content: page.doc ?? textToDoc(page.text),
    editorProps: {
      attributes: { class: 'tiptap' },
      // Картинку из буфера кладём в assets и вставляем в текст узлом со ссылкой.
      // Через editorProps, а не через подписку на DOM: обработчик вызывается,
      // когда редактор уже смонтирован, и не падает на отсутствующем view.
      handlePaste: (_view, event) => {
        const file = imageFromDataTransfer(event.clipboardData)
        if (!file || !editorRef.current) return false
        void insertImageFile(editorRef.current, file)
        return true
      },
    },
    // Каждое изменение уходит в отложенное сохранение: в базу попадает результат, а не набор символов.
    onUpdate: ({ editor: current }) => {
      set({ doc: current.getJSON(), text: current.getText() })
      setHasBody(Boolean(current.getText().trim()))
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  if (!editor) return null

  const wide = page.wide === 1
  const contentClass = cx(
    'mx-auto w-full',
    wide ? 'max-w-none px-10' : 'max-w-[820px] px-16',
  )
  const isEmpty = !hasBody && !values.title.trim()

  const createFromTemplate = async (template: (typeof DATABASE_TEMPLATES)[number]) => {
    setCreating(template.id)
    try {
      const created = await createDatabaseFromTemplate(template, page.id)
      actions.select({ kind: 'page', id: created.id })
    } finally {
      setCreating(null)
    }
  }

  return (
    <>
      <EditorToolbar editor={editor} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PageCover page={page} containerClass={contentClass} />

        <div className={cx(contentClass, 'pb-32 pt-4')}>
          <EmojiPicker icon={page.icon} onPick={(icon) => void updatePage(page.id, { icon })}>
            <button
              type="button"
              title="Сменить иконку"
              className="mb-1 flex h-11 w-11 items-center justify-center rounded-md text-[38px] leading-none transition-colors hover:bg-hover"
            >
              {page.icon || <Smile size={28} className="text-faint" />}
            </button>
          </EmojiPicker>

          <GrowTextarea
            value={values.title}
            onChange={(title) => set({ title })}
            placeholder="Без названия"
            className="text-[40px] font-bold leading-[1.15] text-ink-strong"
          />

          <div className="mt-3">
            <EditorContent editor={editor} />
          </div>

          {isEmpty && (
            <div className="mt-10 rounded-xl border border-dashed border-line bg-panel/40 p-4">
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint">
                <Sparkles size={12} className="text-[#d5a640]" />
                Быстрый старт: создай базу внутри этой страницы
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DATABASE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => void createFromTemplate(template)}
                    disabled={creating !== null}
                    className={cx(
                      'group flex items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2 text-left transition-all',
                      'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-black/30',
                      creating !== null && 'opacity-60',
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[16px]" style={{ background: `${template.accent}22` }}>
                      {template.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-ink-strong">
                        {template.name}
                      </span>
                      <span className="block truncate text-[10.5px] text-faint">
                        {creating === template.id ? 'Создаю…' : template.tagline}
                      </span>
                    </span>
                    <ArrowRight size={13} className="shrink-0 text-faint transition-colors group-hover:text-accent" />
                  </button>
                ))}
              </div>
              <button
                onClick={() => actions.openTemplates(page.id)}
                className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-accent"
              >
                Все шаблоны
                <ArrowRight size={11} />
              </button>
            </div>
          )}

          <p className="mt-10 text-[12px] text-faint">
            Создано {dateFormat.format(page.createdAt)} · изменено {dateFormat.format(page.updatedAt)}
          </p>
        </div>
      </div>

      <EditorBubbleMenu editor={editor} />
      <SavePill status={status} />
    </>
  )
}
