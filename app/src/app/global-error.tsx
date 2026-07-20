"use client"

import { AlertTriangle } from "lucide-react"
import * as React from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1rem",
            textAlign: "center",
            fontFamily: "sans-serif",
          }}
        >
          <AlertTriangle
            style={{ width: "3rem", height: "3rem", color: "#ef4444" }}
            aria-hidden="true"
          />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Application error
          </h1>
          <p
            style={{
              maxWidth: "24rem",
              fontSize: "0.875rem",
              color: "#6b7280",
            }}
          >
            {error.message || "A critical error occurred. Please try again."}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.375rem",
              background: "#111827",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
