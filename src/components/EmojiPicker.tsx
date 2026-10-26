import { useState } from 'react'
import type { ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { cx, popoverPanel } from '../lib/ui'

const GROUPS: Array<{ title: string; emojis: string[] }> = [
  {
    title: 'Для страниц',
    emojis: ['📄', '📝', '📌', '📚', '🗂️', '🗒️', '📊', '🧩', '💡', '✅', '🎯', '🚀', '🔥', '⭐', '⏰', '🛠️'],
  },
  {
    title: 'Смайлы',
    emojis: ['😀', '😄', '🙂', '😉', '😍', '🤔', '😐', '😴', '🥳', '😎', '🤯', '😭', '😤', '🤗', '🙃', '😇'],
  },
  {
    title: 'Жесты',
    emojis: ['👍', '👎', '👌', '✌️', '🤝', '👏', '🙌', '👋', '✍️', '💪', '🤞', '🫡', '👀', '🧠', '❤️', '🖐️'],
  },
  {
    title: 'Природа и еда',
    emojis: ['🌱', '🌳', '🍀', '🌸', '🌊', '☀️', '🌙', '⚡', '❄️', '🍎', '🍋', '🍕', '☕', '🍵', '🥑', '🍩'],
  },
  {
    title: 'Символы',
    emojis: ['⚠️', '❗', '❓', '💬', '🔗', '🔒', '🔑', '📈', '📉', '♻️', '🕹️', '🎵', '🎨', '🧪', '🔬', '🏁'],
  },
]

export function EmojiPicker({
  icon,
  onPick,
  children,
}: {
  icon?: string
  onPick: (icon: string) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  const pick = (emoji: string) => {
    onPick(emoji)
    setOpen(false)
    setCustom('')
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="start"
          collisionPadding={12}
          className={cx(popoverPanel, 'w-[336px]')}
        >
          <input
            value={custom}
            onChange={(event) => {
              const value = event.target.value
              setCustom(value)
              const first = [...value][0]
              if (first) pick(first)
            }}
            placeholder="Свой эмодзи: вставь или набери"
            className="w-full rounded-md border border-line bg-app px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint/70 focus:border-accent/60"
          />

          <div className="mt-2 max-h-[268px] space-y-2.5 overflow-y-auto pr-1">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-1 px-0.5 text-[10.5px] uppercase tracking-wide text-faint">{group.title}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={`${group.title}-${emoji}`}
                      onClick={() => pick(emoji)}
                      className={cx(
                        'flex h-8 w-8 items-center justify-center rounded text-[17px] leading-none transition-colors hover:bg-hover',
                        emoji === icon && 'bg-active',
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => pick('')}
            className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            Убрать иконку
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
