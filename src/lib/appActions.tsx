import { createContext, useContext } from 'react'
import type { ScreenRef } from './screens'

/** Действия оболочки, доступные из любой панели без протаскивания пропсов. */
export interface AppActions {
  select: (screen: ScreenRef | null) => void
  openPeek: (screen: ScreenRef) => void
  closePeek: () => void
  peek: ScreenRef | null
  /** Без родителя создаём в корне; с ним — как подстраницу текущей. */
  openTemplates: (parentId?: string | null) => void
}

export const ActionsContext = createContext<AppActions | null>(null)

export function useActions(): AppActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('ActionsContext не подключён')
  return actions
}
