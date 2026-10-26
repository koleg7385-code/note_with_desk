import { useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Scissors } from 'lucide-react'
import { useAssetUrl } from '../lib/assets'
import { CropModal } from './CropModal'

/**
 * Картинка в заметке хранится ссылкой на запись в assets, а не в самом документе:
 * иначе каждое сохранение перезаписывало бы весь документ вместе с base64 картинок.
 */
function ImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const assetId = node.attrs.assetId as string | undefined
  const url = useAssetUrl(assetId)
  const [crop, setCrop] = useState(false)

  return (
    <NodeViewWrapper className="note-image" data-selected={selected ? 'true' : undefined}>
      <div className="group/image relative inline-block max-w-full">
        {url ? (
          <img src={url} alt={(node.attrs.alt as string) || ''} draggable={false} />
        ) : (
          <span className="note-image-pending">Картинка загружается…</span>
        )}

        {url && assetId && (
          <button
            type="button"
            contentEditable={false}
            title="Вырезать фрагмент"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setCrop(true)
            }}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[11px] text-white/90 opacity-0 backdrop-blur transition-opacity hover:bg-black/80 group-hover/image:opacity-100"
          >
            <Scissors size={12} />
            Обрезать
          </button>
        )}
      </div>

      {crop && assetId && (
        <CropModal
          assetId={assetId}
          onClose={() => setCrop(false)}
          onApply={(nextAssetId) => updateAttributes({ assetId: nextAssetId })}
        />
      )}
    </NodeViewWrapper>
  )
}

export const NoteImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      alt: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-asset-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-asset-id': HTMLAttributes.assetId ?? '',
        alt: HTMLAttributes.alt ?? '',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})
