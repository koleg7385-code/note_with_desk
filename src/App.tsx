import { useCallback, useEffect, useMemo, useState } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { Sidebar } from './components/Sidebar'
import { SearchPalette } from './components/SearchPalette'
import { TemplatesModal } from './components/TemplatesModal'
import { Workspace } from './components/Workspace'
import { ActionsContext } from './lib/appActions'
import type { AppActions } from './lib/appActions'
import type { ScreenRef } from './lib/screens'

const ACTIVE_KEY = 'nwd.active'

function readActive(): ScreenRef | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    return raw ? (JSON.parse(raw) as ScreenRef) : null
  } catch {
    return null
  }
}

export default function App() {
  const [active, setActive] = useState<ScreenRef | null>(readActive)
  const [peek, setPeek] = useState<ScreenRef | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [templates, setTemplates] = useState<{ open: boolean; parentId: string | null }>({
    open: false,
    parentId: null,
  })
  const sidebarRef = usePanelRef()

  // Последний открытый экран переживает перезагрузку.
  useEffect(() => {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active))
  }, [active])

  const setCollapsed = useCallback(
    (next: boolean) => {
      // Ставим состояние сразу, не дожидаясь колбэка: иначе кнопка возврата появляется с задержкой.
      setSidebarCollapsed(next)
      if (next) sidebarRef.current?.collapse()
      else sidebarRef.current?.expand()
    },
    [sidebarRef],
  )

  const openTemplates = useCallback((parentId: string | null = null) => {
    setTemplates({ open: true, parentId })
  }, [])

  const actions = useMemo<AppActions>(
    () => ({
      select: setActive,
      openPeek: setPeek,
      closePeek: () => setPeek(null),
      peek,
      openTemplates,
    }),
    [peek, openTemplates],
  )

  return (
    <ActionsContext.Provider value={actions}>
      <div className="h-screen w-full">
        <Group orientation="horizontal">
          <Panel
            panelRef={sidebarRef}
            defaultSize={272}
            minSize={210}
            maxSize={480}
            collapsible
            collapsedSize={0}
            onResize={(size) => setSidebarCollapsed(size.inPixels === 0)}
            style={{ overflow: 'hidden' }}
            className="bg-panel"
          >
            <Sidebar active={active} onCollapse={() => setCollapsed(true)} />
          </Panel>

          <Separator className="group relative shrink-0 bg-app" style={{ width: 7 }}>
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent/60" />
          </Separator>

          <Panel style={{ overflow: 'hidden' }} className="bg-app">
            <Workspace
              active={active}
              sidebarCollapsed={sidebarCollapsed}
              onOpenSidebar={() => setCollapsed(false)}
            />
          </Panel>
        </Group>

        <SearchPalette onSelect={setActive} />

        <TemplatesModal
          open={templates.open}
          parentId={templates.parentId}
          onClose={() => setTemplates((value) => ({ ...value, open: false }))}
          onCreated={(screen) => {
            setTemplates((value) => ({ ...value, open: false }))
            setActive(screen)
          }}
        />
      </div>
    </ActionsContext.Provider>
  )
}
