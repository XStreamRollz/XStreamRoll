import { type RenderOptions, render } from "@testing-library/react"
import * as React from "react"

export type ThemeMode = "light" | "dark"

export function setDocumentTheme(mode: ThemeMode) {
  if (mode === "dark") {
    document.documentElement.classList.add("dark")
  } else {
    document.documentElement.classList.remove("dark")
  }
}

export function buildThemeTest(
  name: string,
  renderFn: () => React.ReactElement,
) {
  describe(name, () => {
    let consoleError: jest.SpyInstance

    beforeEach(() => {
      consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
      setDocumentTheme("light")
    })

    afterEach(() => {
      consoleError.mockRestore()
    })

    it("renders without errors in light mode", () => {
      render(renderFn())
      expect(consoleError).not.toHaveBeenCalled()
    })

    it("renders without errors in dark mode", () => {
      setDocumentTheme("dark")
      render(renderFn())
      expect(consoleError).not.toHaveBeenCalled()
    })
  })
}
