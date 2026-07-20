"use client"

/**
 * Unified toast helper.
 *
 * The app has two toast libraries installed (shadcn `use-toast` and
 * `sonner`). Rather than forcing callers to pick one, this module
 * re-exports a single, consistent API that:
 *   - delegates to `sonner` (the de-facto standard, already used by
 *     `StreamTagEditor`), and
 *   - exposes `useToast` for components that prefer the hook shape.
 *
 * Centralising the import also means we can swap implementations
 * later (e.g. to `react-hot-toast`) without touching call sites.
 */
import { toast as sonnerToast } from "sonner"

type ToastVariant = "default" | "destructive" | "success" | "info" | "warning"

interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

function show(options: ToastOptions | string): string | number {
  if (typeof options === "string") {
    return sonnerToast(options)
  }
  const { title, description, variant = "default", duration } = options
  const message = title ?? description ?? ""
  const fullDescription = title && description ? description : undefined

  switch (variant) {
    case "destructive":
      return sonnerToast.error(message, {
        description: fullDescription,
        duration,
      })
    case "success":
      return sonnerToast.success(message, {
        description: fullDescription,
        duration,
      })
    case "info":
      return sonnerToast.info(message, {
        description: fullDescription,
        duration,
      })
    case "warning":
      return sonnerToast.warning(message, {
        description: fullDescription,
        duration,
      })
    default:
      return sonnerToast(message, { description: fullDescription, duration })
  }
}

export const toast = Object.assign(show, {
  success: (
    message: string,
    opts: Omit<ToastOptions, "variant" | "title"> = {},
  ) => sonnerToast.success(message, opts),
  error: (
    message: string,
    opts: Omit<ToastOptions, "variant" | "title"> = {},
  ) => sonnerToast.error(message, opts),
  info: (message: string, opts: Omit<ToastOptions, "variant" | "title"> = {}) =>
    sonnerToast.info(message, opts),
  warning: (
    message: string,
    opts: Omit<ToastOptions, "variant" | "title"> = {},
  ) => sonnerToast.warning(message, opts),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
})

export function useToast() {
  return { toast, dismiss: toast.dismiss }
}

export type { ToastOptions, ToastVariant }
