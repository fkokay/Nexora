import { useEffect, type RefObject } from 'react'

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

export function useWorkspaceShortcuts({ page, moduleTabs, searchOpen, searchInputRef, onOpenSearch, onToggleSearch, onCloseSearch, onClearSearch, onSelectTab, onCloseTab }: Props) {
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest('input,textarea,select,[contenteditable="true"]'))
      const primary = event.ctrlKey || event.metaKey

      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault()
        onCloseSearch()
        return
      }
      if (primary && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (searchOpen) onClearSearch()
        else if (page === 'launcher') searchInputRef.current?.focus()
        else onOpenSearch()
        searchInputRef.current?.focus()
        return
      }
      if (typing) return
      if (primary && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        if (page === 'launcher') searchInputRef.current?.focus()
        else onToggleSearch()
        return
      }
      if ((primary && event.key === 'Tab') || (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft'))) {
        event.preventDefault()
        if (!moduleTabs.length) return
        const current = moduleTabs.findIndex(tab => tab.id === page)
        const delta = event.shiftKey || event.key === 'ArrowLeft' ? -1 : 1
        onSelectTab(moduleTabs[(current + delta + moduleTabs.length) % moduleTabs.length].id)
        return
      }
      if (primary && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        onCloseTab(page)
      }
    }

    window.addEventListener('keydown', onShortcut, true)
    return () => window.removeEventListener('keydown', onShortcut, true)
  }, [page, moduleTabs, searchOpen, searchInputRef, onOpenSearch, onToggleSearch, onCloseSearch, onClearSearch, onSelectTab, onCloseTab])
}
