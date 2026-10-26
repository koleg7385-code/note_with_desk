import { useEffect, useState } from 'react'
import { getAsset } from '../db/repo'

/**
 * Blob из базы превращается в object URL на время жизни компонента.
 * Сам Blob в документе не хранится, поэтому автосохранение не тащит картинки.
 */
export function useAssetUrl(assetId?: string | null) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!assetId) {
      setUrl(null)
      return
    }

    let objectUrl: string | null = null
    let alive = true

    void getAsset(assetId).then((asset) => {
      if (!asset || !alive) return
      objectUrl = URL.createObjectURL(asset.blob)
      setUrl(objectUrl)
    })

    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])

  return url
}

function firstImage(files: ArrayLike<File> | null | undefined): File | null {
  if (!files) return null
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}

/** Картинка из буфера обмена или из перетаскивания. */
export function imageFromDataTransfer(data: DataTransfer | null | undefined): File | null {
  if (!data) return null
  return firstImage(data.files) ?? firstImage(Array.from(data.items).map((item) => item.getAsFile()).filter((f): f is File => !!f))
}

export function imageFromFileList(files: FileList | null | undefined): File | null {
  return firstImage(files)
}