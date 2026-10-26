import { useRef } from 'react'
import type { ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ImagePlus, X } from 'lucide-react'
import { putAsset, updatePage } from '../db/repo'
import type { Page } from '../db/db'
import { imageFromFileList, useAssetUrl } from '../lib/assets'
import { cx, popoverPanel } from '../lib/ui'

const COVERS: Array<{ id: string; name: string; css: string }> = [
  { id: 'g1', name: 'Синий', css: 'linear-gradient(120deg, #1b2f4a 0%, #2383e2 100%)' },
  { id: 'g2', name: 'Закат', css: 'linear-gradient(120deg, #3a1f2b 0%, #c2603f 100%)' },
  { id: 'g3', name: 'Лес', css: 'linear-gradient(120deg, #16281f 0%, #3f7f5a 100%)' },
  { id: 'g4', name: 'Сирень', css: 'linear-gradient(120deg, #241f3a 0%, #8a6fd6 100%)' },
  { id: 'g5', name: 'Графит', css: 'linear-gradient(120deg, #141414 0%, #414141 100%)' },
  { id: 'g6', name: 'Океан', css: 'linear-gradient(120deg, #0f2a33 0%, #2a8f9e 100%)' },
]

function coverStyle(cover: string) {
  return COVERS.find((item) => item.id === cover)?.css ?? null
}

function assetIdOf(cover: string | null | undefined) {
  return cover?.startsWith('a:') ? cover.slice(2) : null
}

/**
 * Обложка над заголовком: градиент из набора или своя картинка.
 * Когда обложки нет, на месте остаётся тихая кнопка «Добавить обложку».
 */
export function PageCover({ page, containerClass }: { page: Page; containerClass: string }) {
  const cover = page.cover ?? null
  const url = useAssetUrl(assetIdOf(cover))
  const gradient = cover ? coverStyle(cover) : null

  if (!cover) {
    return (
      <div className={containerClass}>
        <CoverPicker page={page}>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <ImagePlus size={13} />
            Добавить обложку
          </button>
        </CoverPicker>
      </div>
    )
  }

  return (
    <div className="group relative h-[180px] w-full overflow-hidden">
      {url ? (
        <img src={url} alt="Обложка" draggable={false} className="h-full w-full object-cover" />
      ) : gradient ? (
        <div className="h-full w-full" style={{ background: gradient }} />
      ) : (
        <div className="h-full w-full bg-raised" />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/45 to-transparent p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="text-[10.5px] uppercase tracking-wide text-white/50">обложка</span>
        <div className="flex items-center gap-1">
          <CoverPicker page={page}>
            <button className="rounded-md bg-black/55 px-2 py-1 text-[11px] text-white/90 backdrop-blur transition-colors hover:bg-black/70">
              Сменить
            </button>
          </CoverPicker>
          <button
            onClick={() => void updatePage(page.id, { cover: null })}
            title="Убрать обложку"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

function CoverPicker({ page, children }: { page: Page; children: ReactNode }) {
  const fileInput = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | null) => {
    const file = imageFromFileList(files)
    if (!file) return
    const asset = await putAsset(file, file.name)
    await updatePage(page.id, { cover: `a:${asset.id}` })
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="start" className={cx(popoverPanel, 'w-[248px]')}>
          <p className="mb-1.5 px-0.5 text-[10.5px] uppercase tracking-wide text-faint">Готовые обложки</p>
          <div className="grid grid-cols-3 gap-1">
            {COVERS.map((cover) => (
              <button
                key={cover.id}
                title={cover.name}
                onClick={() => void updatePage(page.id, { cover: cover.id })}
                className="h-10 rounded-md border border-white/10 transition-transform hover:scale-[1.03]"
                style={{ background: cover.css }}
              />
            ))}
          </div>
          <div className="my-1.5 h-px bg-line" />
          <button
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink-strong"
          >
            <ImagePlus size={13} />
            Загрузить фото
          </button>
          {page.cover && (
            <button
              onClick={() => void updatePage(page.id, { cover: null })}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[12.5px] text-[#d95c5c] transition-colors hover:bg-hover hover:text-[#f07a7a]"
            >
              <X size={13} />
              Убрать обложку
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void upload(event.target.files)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
