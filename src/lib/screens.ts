import { archiveItemTree, getRefItemById, listTree } from '../db/repo'
import type { ItemRef } from '../db/repo'

/** Что сейчас открыто в рабочей области. */
export type ScreenRef = ItemRef

export function sameScreen(a: ScreenRef | null, b: ScreenRef | null) {
  return a?.kind === b?.kind && a?.id === b?.id
}

/**
 * Убирает объект вместе с содержимым и говорит, что открыть вместо него:
 * сначала родителя, иначе первый оставшийся файл.
 */
export async function removeScreen(ref: ScreenRef): Promise<ScreenRef | null> {
  const item = await getRefItemById(ref.id)
  const parent = await getRefItemById(item?.parentId ?? null)

  await archiveItemTree(ref)

  if (parent) {
    const stillThere = await getRefItemById(parent.id)
    if (stillThere) return { kind: stillThere.kind, id: stillThere.id }
  }

  const rest = await listTree()
  const next = rest.find((entry) => !(entry.kind === ref.kind && entry.id === ref.id))
  return next ? { kind: next.kind, id: next.id } : null
}
