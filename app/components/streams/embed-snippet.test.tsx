import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EmbedSnippet } from "./embed-snippet"

describe("EmbedSnippet", () => {
  const mockWriteText = jest.fn()
  let originalClipboardDescriptor: PropertyDescriptor | undefined

  beforeAll(() => {
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      "clipboard",
    )

    const mockClipboard = {
      writeText: mockWriteText,
    }

    // Define on prototype
    Object.defineProperty(Navigator.prototype, "clipboard", {
      value: mockClipboard,
      configurable: true,
      writable: true,
    })

    // Define on window.navigator
    try {
      Object.defineProperty(window.navigator, "clipboard", {
        value: mockClipboard,
        configurable: true,
        writable: true,
      })
    } catch (e) {}

    // Define on global.navigator
    try {
      Object.defineProperty(navigator, "clipboard", {
        value: mockClipboard,
        configurable: true,
        writable: true,
      })
    } catch (e) {}
  })

  afterAll(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(
        Navigator.prototype,
        "clipboard",
        originalClipboardDescriptor,
      )
    } else {
      // @ts-ignore
      delete Navigator.prototype.clipboard
    }

    try {
      // @ts-ignore
      delete window.navigator.clipboard
    } catch (e) {}

    try {
      // @ts-ignore
      delete navigator.clipboard
    } catch (e) {}
  })




  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockWriteText.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("renders the iframe embed code with publicId (rendering test)", () => {
    render(<EmbedSnippet publicId="stream-123" />)

    expect(screen.getByText("Embed snippet")).toBeInTheDocument()
    const codeContainer = screen.getByLabelText("iframe embed code")
    expect(codeContainer).toHaveTextContent(
      '<iframe src="https://xstreamroll.example.com/embed/stream-123"',
    )
    expect(codeContainer).toHaveTextContent('width="640" height="360"')
  })

  it("supports custom width, height, and viewerBase", () => {
    render(
      <EmbedSnippet
        publicId="stream-abc"
        viewerBase="https://myviewer.net/"
        width={800}
        height={450}
      />,
    )

    const codeContainer = screen.getByLabelText("iframe embed code")
    expect(codeContainer).toHaveTextContent(
      '<iframe src="https://myviewer.net/embed/stream-abc"',
    )
    expect(codeContainer).toHaveTextContent('width="800" height="450"')
  })

  it("copies the code to clipboard and displays Copied state (interaction test)", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: mockWriteText,
      },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockWriteText,
      },
      configurable: true,
      writable: true,
    })

    render(<EmbedSnippet publicId="stream-123" />)



    const copyBtn = screen.getByRole("button", { name: "Copy embed snippet" })
    await user.click(copyBtn)

    const expectedSnippet =
      '<iframe src="https://xstreamroll.example.com/embed/stream-123"\n' +
      '        width="640" height="360"\n' +
      '        frameborder="0"\n' +
      '        allow="autoplay; encrypted-media; picture-in-picture"\n' +
      '        allowfullscreen></iframe>'

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(expectedSnippet)
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument()
    })

    // Fast-forward 1800ms
    act(() => {
      jest.advanceTimersByTime(1800)
    })

    expect(
      screen.getByRole("button", { name: "Copy embed snippet" }),
    ).toBeInTheDocument()
  })

  it("throws error in dev if publicId is missing (validation test)", () => {
    // Suppress console.error output to avoid test pollution
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      render(<EmbedSnippet publicId="" />)
    }).toThrow("EmbedSnippet: publicId is required")

    consoleSpy.mockRestore()
  })

  it("throws error in dev if publicId looks like a secret (validation / security test)", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})

    // Containing dot (like JWT or token)
    expect(() => {
      render(<EmbedSnippet publicId="stream.jwt.token" />)
    }).toThrow("EmbedSnippet: publicId looks like a secret token")

    // Too long (length > 64)
    const longId = "a".repeat(65)
    expect(() => {
      render(<EmbedSnippet publicId={longId} />)
    }).toThrow("EmbedSnippet: publicId looks like a secret token")

    consoleSpy.mockRestore()
  })
})
