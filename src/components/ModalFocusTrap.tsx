import FocusTrap from 'focus-trap-react'

interface ModalFocusTrapProps {
  active: boolean
  children: React.ReactNode
  onDeactivate?: () => void
}

/** يقيّد التركيز داخل النافذة المنبثقة وعند Esc يعيده للعنصر الذي فتحها */
export function ModalFocusTrap({ active, children, onDeactivate }: ModalFocusTrapProps) {
  return (
    <FocusTrap
      active={active}
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: true,
        onDeactivate,
      }}
    >
      {children}
    </FocusTrap>
  )
}
