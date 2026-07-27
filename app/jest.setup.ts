import "@testing-library/jest-dom"

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: jest.fn(() => false),
}))

// jsdom does not have a real layout engine, so `@tanstack/react-virtual`
// cannot measure the scroll container's height or compute the visible
// window — every `useVirtualizer` call would return zero items in tests.
// The mock below materialises every row so that any consumer of
// `StreamFeed` (directly, or via `StreamViewer`) continues to expose
// the rendered text in the DOM, which is what every test assertion in
// this repo happens to check on. The virtual scroll on the production
// path keeps the actual mounting bounded; this is purely a test-time
// ergonomic shim.
jest.mock("@tanstack/react-virtual", () => {
  return {
    useVirtualizer: jest.fn(({ count, getScrollElement, estimateSize }) => {
      const scrollElement = getScrollElement?.()
      const rowHeight = estimateSize?.() ?? 84
      const virtualItems = Array.from({ length: count }, (_, index) => ({
        index,
        start: index * rowHeight,
        size: rowHeight,
        key: index,
      }))
      return {
        getVirtualItems: () => virtualItems,
        getTotalSize: () => count * rowHeight,
        measureElement: jest.fn(),
        scrollToIndex: jest.fn(),
        scrollElement,
      }
    }),
  }
})

class MockResizeObserver {
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
}

global.ResizeObserver = MockResizeObserver

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}

