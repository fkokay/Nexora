import { useEffect, useRef, type RefObject } from 'react'
import { useCommandRegistry } from './commands/CommandProvider'

type Tab = { id: string; label: string }
type Props = {
  page: string
  moduleTabs: Tab[]
  searchOpen: boolean
  searchInputRef: RefObject<HTMLInputElement | null>
  onOpenSearch: () => void
  onToggleSearch: () => void
  onCloseSearch: () => void
  onClearSearch: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
}

/** Workspace-level shortcuts (search, tab navigation) registered as global commands on the single key listener. */
export function useWorkspaceGlobalCommands(props: Props) {
  const registry = useCommandRegistry()
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const cycleTab = (delta: number) => {
      const { moduleTabs, page, onSelectTab } = latest.current
      if (!moduleTabs.length) return
      const current = moduleTabs.findIndex(tab => tab.id === page)
      onSelectTab(moduleTabs[(current + delta + moduleTabs.length) % moduleTabs.length].id)
    }
    const disposers = [
      registry.registerGlobal({
        id: 'workspace.search',
        shortcut: 'Ctrl+K',
        allowWhileTyping: true,
        allowInModal: true,
        run: () => {
          const { searchOpen, page, searchInputRef, onClearSearch, onOpenSearch } = latest.current
          if (searchOpen) onClearSearch()
          else if (page === 'launcher') searchInputRef.current?.focus()
          else onOpenSearch()
          searchInputRef.current?.focus()
        },
      }),
      registry.registerGlobal({
        id: 'workspace.search-toggle',
        shortcut: 'Ctrl+B',
        run: () => {
          const { page, searchInputRef, onToggleSearch } = latest.current
          if (page === 'launcher') searchInputRef.current?.focus()
          else onToggleSearch()
        },
      }),
      registry.registerGlobal({ id: 'workspace.tab-next', shortcut: 'Ctrl+Tab', run: () => cycleTab(1) }),
      registry.registerGlobal({ id: 'workspace.tab-previous', shortcut: 'Ctrl+Shift+Tab', run: () => cycleTab(-1) }),
      registry.registerGlobal({ id: 'workspace.tab-next-arrow', shortcut: 'Alt+ArrowRight', run: () => cycleTab(1) }),
      registry.registerGlobal({ id: 'workspace.tab-previous-arrow', shortcut: 'Alt+ArrowLeft', run: () => cycleTab(-1) }),
      registry.registerGlobal({ id: 'workspace.tab-close', shortcut: 'Ctrl+W', run: () => latest.current.onCloseTab(latest.current.page) }),
    ]
    return () => disposers.forEach(dispose => dispose())
  }, [registry])

  // Escape is only claimed while the search is open, so it stays free for modals and inputs otherwise.
  const { searchOpen } = props
  useEffect(() => {
    if (!searchOpen) return
    return registry.registerGlobal({
      id: 'workspace.search-close',
      shortcut: 'Escape',
      allowWhileTyping: true,
      allowInModal: true,
      run: () => latest.current.onCloseSearch(),
    })
  }, [registry, searchOpen])
}
