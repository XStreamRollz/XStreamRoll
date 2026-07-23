import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StreamTagEditor } from "@/src/app/dashboard/streams/stream-tag-editor"
import {
  attachTagToStream,
  detachTagFromStream,
  listTags,
  Tag,
  TagsApiError,
} from "@/lib/api/tags"
import { renderWithQueryClient } from "@/lib/test-utils"
import { toast } from "sonner"

jest.mock("@/lib/api/tags", () => {
  const actual = jest.requireActual("@/lib/api/tags")
  return {
    ...actual,
    attachTagToStream: jest.fn(),
    detachTagFromStream: jest.fn(),
    listTags: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 100, total: 0, hasMore: false }),
  }
})
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}))

const mockAttach = attachTagToStream as jest.MockedFunction<
  typeof attachTagToStream
>
const mockDetach = detachTagFromStream as jest.MockedFunction<
  typeof detachTagFromStream
>
const mockListTags = listTags as jest.MockedFunction<typeof listTags>
const mockToastError = toast.error as jest.MockedFunction<typeof toast.error>


describe("StreamTagEditor", () => {
  const initialTags: Tag[] = [
    { id: 1, name: "Gaming", slug: "gaming", createdAt: "2026-06-18" },
    { id: 2, name: "Music", slug: "music", createdAt: "2026-06-18" },
  ]

  function renderEditor(props: Partial<React.ComponentProps<typeof StreamTagEditor>> = {}) {
    return renderWithQueryClient(
      <StreamTagEditor
        streamId={123}
        initialTags={initialTags}
        actingUserId="user-1"
        {...props}
      />,
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockListTags.mockResolvedValue({ items: [], page: 1, limit: 100, total: 0, hasMore: false })
  })

  it("renders with initial tags (rendering test)", () => {
    renderEditor()

    expect(screen.getByText("Tags")).toBeInTheDocument()
    const selectedList = screen.getByLabelText("selected tags")
    expect(within(selectedList).getByText("Gaming")).toBeInTheDocument()
    expect(within(selectedList).getByText("Music")).toBeInTheDocument()
  })

  it("performs optimistic update and calls detachTagFromStream on tag removal (interaction test)", async () => {
    const user = userEvent.setup()
    mockDetach.mockResolvedValueOnce()

    renderEditor()

    const removeGamingBtns = screen.getAllByRole("button", {
      name: "Remove tag Gaming",
    })

    // Click to remove tag "Gaming"
    await user.click(removeGamingBtns[0])

    // Check optimistic update (React Query cache updates first):
    await waitFor(() => {
      const selectedList = screen.getByLabelText("selected tags")
      expect(within(selectedList).queryByText("Gaming")).not.toBeInTheDocument()
    })

    const attachedList = screen.getByLabelText("stream tags")
    expect(within(attachedList).queryByText("Gaming")).not.toBeInTheDocument()

    // Check that detach API was called
    expect(mockDetach).toHaveBeenCalledWith(123, 1, { userId: "user-1" })
  })

  it("rolls back state and displays error toast on detachment failure (error state test)", async () => {
    const user = userEvent.setup()
    mockDetach.mockRejectedValueOnce(new TagsApiError(500, "Database down"))

    renderEditor()

    const removeGamingBtns = screen.getAllByRole("button", {
      name: "Remove tag Gaming",
    })

    await user.click(removeGamingBtns[0])

    // Check rollback: Gaming tag should be restored in the UI
    await waitFor(() => {
      const selectedList = screen.getByLabelText("selected tags")
      expect(within(selectedList).getByText("Gaming")).toBeInTheDocument()
    })

    // Verify toast notification
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Database down"),
    )
  })

  it("attaches tag to stream when select option changes (interaction test)", async () => {
    const user = userEvent.setup()
    mockAttach.mockResolvedValueOnce({
      id: 3,
      name: "Coding",
      slug: "coding",
      createdAt: "2026-06-18",
    })

    // TagCombobox fetches the global tag catalogue on open.
    mockListTags.mockResolvedValueOnce({
      items: [
        { id: 1, name: "Gaming", slug: "gaming", createdAt: "2026-06-18" },
        { id: 2, name: "Music", slug: "music", createdAt: "2026-06-18" },
        { id: 3, name: "Coding", slug: "coding", createdAt: "2026-06-18" },
      ],
      page: 1,
      limit: 100,
      total: 3,
      hasMore: false,
    })

    renderEditor()

    // Open combobox and select "Coding"
    await user.click(screen.getByRole("combobox"))
    await waitFor(() => {
      expect(screen.getByText("Coding")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Coding"))

    // Verify attach was called with the right arguments
    expect(mockAttach).toHaveBeenCalledWith(123, "Coding", { userId: "user-1" })
  })

  it("rolls back state on attachment failure (error state test)", async () => {
    const user = userEvent.setup()
    mockAttach.mockRejectedValueOnce(new TagsApiError(400, "Tag limit reached"))

    mockListTags.mockResolvedValueOnce({
      items: [
        { id: 1, name: "Gaming", slug: "gaming", createdAt: "2026-06-18" },
        { id: 2, name: "Music", slug: "music", createdAt: "2026-06-18" },
        { id: 3, name: "Coding", slug: "coding", createdAt: "2026-06-18" },
      ],
      page: 1,
      limit: 100,
      total: 3,
      hasMore: false,
    })

    renderEditor()

    await user.click(screen.getByRole("combobox"))
    await waitFor(() => {
      expect(screen.getByText("Coding")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Coding"))

    // Optimistic attach + rollback means Coding never sticks around.
    await waitFor(() => {
      const selectedList = screen.getByLabelText("selected tags")
      expect(within(selectedList).queryByText("Coding")).not.toBeInTheDocument()

      const attachedList = screen.getByLabelText("stream tags")
      expect(within(attachedList).queryByText("Coding")).not.toBeInTheDocument()
    })

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Tag limit reached"),
    )
  })
})
