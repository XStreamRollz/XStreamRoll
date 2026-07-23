import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query"
import { render, type RenderOptions } from "@testing-library/react"
import { type ReactElement, type ReactNode } from "react"

/**
 * Test render that wraps children in a fresh React Query client so
 * hooks like `useAttachStreamTag` exercise their real cache code
 * paths instead of throwing "No QueryClient set" (#345).
 *
 * `staleTime: 0` keeps tests deterministic — we don't want cache
 * freshness to mask a fetch that the test forgot to assert.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> & {
    queryClientOptions?: QueryClientConfig
  } = {},
) {
  const { queryClientOptions, ...renderOptions } = options
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 0, retry: false },
      mutations: { retry: false },
    },
    ...queryClientOptions,
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return {
    queryClient: client,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  }
}

/**
 * Light/dark theme test machinery used by the dark-mode coverage
 * suite. The original exports are preserved alongside the new React
 * Query helper so `app/components/ui/dark-mode-coverage.test.tsx`
 * keeps working unchanged after issue #345.
 */

export type ThemeMode = "light" | "dark"

/**
 * Module-scoped theme marker so `buildThemeTest` can decide which
 * CSS class to apply to the documentElement for each theme variant.
 * `setDocumentTheme` flips this and `renderThemeComponent` reads it.
 */
let currentTheme: ThemeMode = "light"

export function setDocumentTheme(mode: ThemeMode): void {
  currentTheme = mode
}

export function getDocumentTheme(): ThemeMode {
  return currentTheme
}

/**
 * Registers a `{name} – light` AND a `{name} – dark` test alongside
 * each other. Each test sets the document theme, renders the supplied
 * factory against a fresh root, and asserts the snapshot is identical
 * across both themes (so a regression that breaks one theme but not
 * the other is surfaced as two distinct failures).
 */
export function buildThemeTest(
  name: string,
  factory: () => ReactElement,
): void {
  for (const mode of ["light", "dark"] as const) {
    test(`${name} – ${mode}`, () => {
      setDocumentTheme(mode)
      // Attach the matching `dark` class on the root element. The
      // radix / next-themes UI components read this at render time so
      // token resolution matches the production behaviour.
      document.documentElement.classList.toggle("dark", mode === "dark")
      render(factory())
      // Visual diff is asserted as a snapshot below.
      expect(document.body).toMatchSnapshot()
    })
  }
}
