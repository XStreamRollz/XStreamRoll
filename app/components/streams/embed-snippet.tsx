"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface EmbedSnippetProps {
  /**
   * The stream's PUBLIC identifier. Must NOT be the stream's secret
   * API key — the snippet is intended for third-party sites and will
   * be shown to anyone the owner shares it with.
   */
  publicId: string
  /**
   * Base URL of the public viewer. Falls back to
   * `NEXT_PUBLIC_VIEWER_URL` so deployments can override it. The
   * generated iframe `src` is `<viewerBase>/embed/<publicId>`.
   */
  viewerBase?: string
  width?: number
  height?: number
  className?: string
}

const COPY_RESET_MS = 1800

/**
 * Renders a copy-to-clipboard snippet that third-party sites can paste
 * into their own pages to embed the stream viewer.
 *
 * Security note: only `publicId` is interpolated into the snippet —
 * never a stream key, secret URL, or signed token. The component
 * defends against accidental misuse by throwing in dev when `publicId`
 * looks like a secret (length > 64 or contains a dot, suggesting a
 * JWT-style payload).
 */
export function EmbedSnippet({
  publicId,
  viewerBase,
  width = 640,
  height = 360,
  className,
}: EmbedSnippetProps) {
  if (process.env.NODE_ENV !== "production") {
    if (typeof publicId !== "string" || publicId.length === 0) {
      throw new Error("EmbedSnippet: publicId is required")
    }
    if (publicId.length > 64 || publicId.includes(".")) {
      // Heuristic: real public IDs are short and slug-like. Anything
      // longer or containing a dot is suspicious enough to refuse.
      throw new Error(
        "EmbedSnippet: publicId looks like a secret token. Pass the stream's public id, not the API key.",
      )
    }
  }

  const resolvedBase = (
    viewerBase ??
    process.env.NEXT_PUBLIC_VIEWER_URL ??
    "https://xstreamroll.example.com"
  ).replace(/\/+$/, "")

  const snippet = buildSnippet(resolvedBase, publicId, width, height)
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(snippet)
      } else {
        // Fallback for environments without the async clipboard API.
        fallbackCopy(snippet)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPY_RESET_MS)
    } catch {
      // Swallow — UI stays in the "Copy" state so the user can retry.
    }
  }

  return (
    <Card className={cn("relative", className)}>
      <CardHeader>
        <CardTitle className="text-lg">Embed snippet</CardTitle>
        <CardDescription>
          Paste this snippet into any site to embed the stream. The snippet
          uses the stream's public id — no secrets are exposed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <pre
            className="overflow-x-auto rounded-md border bg-muted/50 p-3 pr-12 text-xs"
            aria-label="iframe embed code"
            // The snippet is plain text; rendering inside <pre><code>
            // preserves whitespace without risking HTML interpretation.
          >
            <code>{snippet}</code>
          </pre>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleCopy()}
            aria-label={copied ? "Copied" : "Copy embed snippet"}
            className="absolute right-2 top-2"
          >
            {copied ? (
              <>
                <Check className="size-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Copy
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function buildSnippet(
  viewerBase: string,
  publicId: string,
  width: number,
  height: number,
): string {
  // Use HTML-attribute-safe values: the publicId is already validated
  // above; viewerBase comes from configuration, not user input.
  const src = `${viewerBase}/embed/${encodeURIComponent(publicId)}`
  return (
    `<iframe src="${src}"\n` +
    `        width="${width}" height="${height}"\n` +
    `        frameborder="0"\n` +
    `        allow="autoplay; encrypted-media; picture-in-picture"\n` +
    `        allowfullscreen></iframe>`
  )
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "absolute"
  textarea.style.left = "-9999px"
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
  }
}
