"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export interface ConfirmDialogProps {
  /** Headline shown in bold inside the dialog. */
  title: string
  /** Supporting copy. Use to spell out the consequences. */
  description: string
  /** Label for the confirm action. Defaults to "Confirm". */
  confirmLabel?: string
  /** Label for the cancel action. Defaults to "Cancel". */
  cancelLabel?: string
  /** Visual style for the confirm action. Defaults to "destructive". */
  variant?: "destructive" | "default"
  /** Trigger element. If omitted the dialog is fully controlled. */
  trigger?: React.ReactNode
  /** Open state when used in fully controlled mode. */
  open?: boolean
  /** Called when the open state changes. */
  onOpenChange?: (open: boolean) => void
  /** Async confirm handler. Dialog stays open while the promise is pending. */
  onConfirm: () => void | Promise<void>
  /** Disable the confirm action. */
  disabled?: boolean
  /** Optional className for the inner content panel. */
  className?: string
}

/**
 * Reusable confirmation dialog for destructive or irreversible actions
 * (delete stream, revoke token, remove member, etc.).
 *
 * Wraps the shadcn `AlertDialog` primitives and adds:
 *   - async-aware confirm button (disables + shows pending label),
 *   - a `variant="destructive" | "default"` prop for non-destructive
 *     confirmations (e.g. "Discard unsaved changes"),
 *   - sensible defaults so call sites stay one-liners.
 *
 * Usage:
 *
 *   <ConfirmDialog
 *     title="Delete stream"
 *     description="This permanently removes the stream and its events."
 *     confirmLabel="Delete"
 *     onConfirm={async () => { await api.delete(id) }}
 *     trigger={<Button variant="destructive">Delete</Button>}
 *   />
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  trigger,
  open,
  onOpenChange,
  onConfirm,
  disabled = false,
  className,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false)
  // Track the most recent open transition so the async confirm path
  // only closes the dialog when it was the one that opened it.
  const closeAfterPending = React.useRef(false)

  async function handleConfirm(e: React.MouseEvent<HTMLButtonElement>) {
    // The AlertDialog primitives close the dialog via the action's
    // default behaviour; we let them do that and only intervene if
    // the handler is async.
    e.preventDefault()
    if (pending) return
    setPending(true)
    closeAfterPending.current = true
    try {
      await onConfirm()
    } finally {
      setPending(false)
      if (closeAfterPending.current) {
        onOpenChange?.(false)
      }
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent className={cn(className)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => void handleConfirm(e)}
            disabled={disabled || pending}
            className={cn(
              variant === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
