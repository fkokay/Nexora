import { useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

type Props = { children: ReactNode }
type Position = { top: number; left: number }

export function InventoryStockActionsMenu({ children }: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight || 190
      const top = rect.bottom + menuHeight + 8 <= window.innerHeight
        ? rect.bottom + 4
        : Math.max(8, rect.top - menuHeight - 4)
      setPosition({ top, left: Math.min(window.innerWidth - 196, Math.max(8, rect.right - 188)) })
    }
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    updatePosition()
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  return <>
    <button ref={triggerRef} type="button" className="inventory-stock-menu-trigger" aria-label="Stok kartı işlemleri" aria-haspopup="true" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
      <MoreHorizontal size={17} aria-hidden="true"/>
    </button>
    {open && createPortal(<div ref={menuRef} id={menuId} className="inventory-stock-actions-menu" role="group" aria-label="Stok kartı işlemleri" style={{ top: position.top, left: position.left }} onClick={event => { if ((event.target as HTMLElement).closest('button')) setOpen(false) }}>
      {children}
    </div>, document.body)}
  </>
}
