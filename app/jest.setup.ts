import "@testing-library/jest-dom"

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: jest.fn(() => false),
}))

class MockResizeObserver {
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
}

global.ResizeObserver = MockResizeObserver

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
}

