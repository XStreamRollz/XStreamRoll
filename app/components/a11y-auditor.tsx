"use client"

import * as React from "react"

/**
 * Initializes @axe-core/react for development-time accessibility
 * auditing. axe-core wraps React's createElement to detect DOM-level
 * accessibility violations in real-time as components render.
 *
 * Enabled only in development mode and only in the browser (never
 * during SSR or in Jest/jsdom). The dynamic import keeps the ~300 kB
 * axe-core library out of the production bundle.
 */
export function A11yAuditor() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return

    void import("@axe-core/react").then((axe) => {
      void import("react-dom").then((ReactDOM) => {
        axe.default(React, ReactDOM, 1000, undefined)
      })
    })
  }, [])

  return null
}
