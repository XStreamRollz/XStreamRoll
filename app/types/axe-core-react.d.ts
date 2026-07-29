declare module "@axe-core/react" {
  import type React from "react"

  /**
   * Initializes axe-core accessibility auditing by wrapping React's
   * createElement. Runs audits at the specified interval and logs
   * violations to the console.
   *
   * @param react - The React instance (import React from "react")
   * @param reactDOM - The ReactDOM instance (import ReactDOM from "react-dom")
   * @param timeout - Debounce interval in milliseconds between audits
   * @param config - Optional axe-core configuration object
   * @returns A cleanup function that restores the original createElement
   */
  export default function axe(
    react: typeof React,
    reactDOM: unknown,
    timeout: number,
    config?: Record<string, unknown>,
  ): (() => void)
}
