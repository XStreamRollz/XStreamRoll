import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TagCombobox } from "./tag-combobox"
import { listTags, Tag, PagedTags } from "@/lib/api/tags"

jest.mock("@/lib/api/tags")

const mockListTags = listTags as jest.MockedFunction<typeof listTags>

describe("TagCombobox", () => {
  const selectedTags: Tag[] = [
    { id: 1, name: "Gaming", slug: "gaming", createdAt: "2026-06-18" },
  ]
  const availableTags: Tag[] = [
    { id: 1, name: "Gaming", slug: "gaming", createdAt: "2026-06-18" },
    { id: 2, name: "Music", slug: "music", createdAt: "2026-06-18" },
    { id: 3, name: "Coding", slug: "coding", createdAt: "2026-06-18" },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockListTags.mockResolvedValue({
      data: availableTags,
      page: 1,
      limit: 100,
      total: 3,
      hasMore: false,
    })
  })

  it("renders selected tags and placeholder (rendering test)", () => {
    render(<TagCombobox value={selectedTags} onChange={jest.fn()} />)

    expect(screen.getByText("Gaming")).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveTextContent("Add tags…")
  })

  it("renders empty state when no tags are selected", () => {
    render(<TagCombobox value={[]} onChange={jest.fn()} />)
    expect(screen.getByText("No tags yet.")).toBeInTheDocument()
  })

  it("opens the popover and loads available tags (interaction / network test)", async () => {
    const user = userEvent.setup()
    let resolveListTags: () => void
    const listTagsPromise = new Promise<PagedTags>((resolve) => {
      resolveListTags = () =>
        resolve({
          data: availableTags,
          page: 1,
          limit: 100,
          total: 3,
          hasMore: false,
        })
    })
    mockListTags.mockReturnValueOnce(listTagsPromise)

    render(<TagCombobox value={selectedTags} onChange={jest.fn()} />)

    const trigger = screen.getByRole("combobox")
    await user.click(trigger)

    expect(screen.getByText("Loading…")).toBeInTheDocument()
    expect(mockListTags).toHaveBeenCalled()

    await act(async () => {
      resolveListTags()
      await listTagsPromise
    })

    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Existing")).toBeInTheDocument()
    expect(screen.getByText("Music")).toBeInTheDocument()
    expect(screen.getByText("Coding")).toBeInTheDocument()
  })

  it("calls onChange with updated list when removing a selected tag badge (interaction test)", async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    render(<TagCombobox value={selectedTags} onChange={handleChange} />)

    const removeBtn = screen.getByRole("button", { name: "Remove tag Gaming" })
    await user.click(removeBtn)

    expect(handleChange).toHaveBeenCalledWith([])
  })

  it("calls onChange with updated list when selecting an existing tag in dropdown (interaction test)", async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    render(<TagCombobox value={selectedTags} onChange={handleChange} />)

    await user.click(screen.getByRole("combobox"))
    await waitFor(() => {
      expect(screen.getByText("Music")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Music"))
    expect(handleChange).toHaveBeenCalledWith([...selectedTags, availableTags[1]])
  })

  it("handles loading error gracefully (error state test)", async () => {
    const user = userEvent.setup()
    mockListTags.mockRejectedValueOnce(new Error("API offline"))

    render(<TagCombobox value={[]} onChange={jest.fn()} />)
    await user.click(screen.getByRole("combobox"))

    await waitFor(() => {
      expect(screen.getByText("API offline")).toBeInTheDocument()
    })
  })

  it("shows create new button and calls onCreate when creating a tag (interaction test)", async () => {
    const user = userEvent.setup()
    const handleChange = jest.fn()
    const handleCreate = jest.fn().mockResolvedValue({
      id: 4,
      name: "React",
      slug: "react",
      createdAt: "2026-06-18",
    })

    render(
      <TagCombobox
        value={selectedTags}
        onChange={handleChange}
        onCreate={handleCreate}
      />,
    )

    await user.click(screen.getByRole("combobox"))
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search or create…")).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText("Search or create…")
    await user.type(input, "React")

    const createBtn = screen.getByText(/Create.*React/)
    expect(createBtn).toBeInTheDocument()

    await user.click(createBtn)

    expect(handleCreate).toHaveBeenCalledWith("React")
    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith([
        ...selectedTags,
        { id: 4, name: "React", slug: "react", createdAt: "2026-06-18" },
      ])
    })
  })
})
