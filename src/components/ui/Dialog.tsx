import { useEffect, useRef, type ReactNode } from 'react'
import { Button, type ButtonVariant } from './Button'

/** Diálogo modal nativo: hoja inferior en móvil, centrado en escritorio. */
export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-3xl bg-card p-0 text-fg shadow-float sm:m-auto sm:rounded-3xl"
    >
      {open && <div className="animate-rise p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  confirmVariant?: ButtonVariant
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={loading ? () => {} : onCancel} labelledBy="confirm-title">
      <h2 id="confirm-title" className="text-lg font-semibold">
        {title}
      </h2>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
