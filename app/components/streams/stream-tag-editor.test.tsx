import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"

import {
  Tag,
  TagsApiError,
  attachTagToStream,
  detachTagFromStream,
  listTags,
} from "@/lib/api/tags"
import { StreamTagEditor } from "@/src/app/dashboard/streams/stream-tag-editor"

jest.mock("@/lib/api/tags", () => {
  const actual = jest.requireActual("@/lib/api/tags")
  return {
    ...actual,
    attachTagToStream: jest.fn(),
    detachTagFromStream: jest.fn(),
    listTags: jest.fn().mockResolvedValue({
      items: [],
      page: 1,
      limit: 100,
      total: 0,
      hasMore: false,
    }),
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

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders with initial tags (rendering test)", () => {
    render(
      <StreamTagEditor
        streamId={123}
        initialTags={initialTags}
        actingUserId="user-1"
      />,
    )

    expect(screen.getByText("Tags")).toBeInTheDocument()
    const selectedList = screen.getByLabelText("selected tags")
    expect(within(selectedList).getByText("Gaming")).toBeInTheDocument()
    expect(within(selectedList).getByText("Music")).toBeInTheDocument()
  })

  it("performs optimistic update and calls detachTagFromStream on tag removal (interaction test)", async () => {
    const user = userEvent.setup()
    mockDetach.mockResolvedValueOnce()

    render(
      <StreamTagEditor
        streamId={123}
        initialTags={initialTags}
        actingUserId="user-1"
      />,
    )

    const removeGamingBtns = screen.getAllByRole("button", {
      name: "Remove tag Gaming",
    })

    // Click to remove tag "Gaming"
    await user.click(removeGamingBtns[0])

    // Check optimistic update: Gaming should be gone immediately from lists
    const selectedList = screen.getByLabelText("selected tags")
    expect(within(selectedList).queryByText("Gaming")).not.toBeInTheDocument()

    const attachedList = screen.getByLabelText("stream tags")
    expect(within(attachedList).queryByText("Gaming")).not.toBeInTheDocument()

    // Check that detach API was called
    expect(mockDetach).toHaveBeenCalledWith(123, 1, { userId: "user-1" })
  })

  it("rolls back state and displays error toast on detachment failure (error state test)", async () => {
    const user = userEvent.setup()
    mockDetach.mockRejectedValueOnce(new TagsApiError(500, "Database down"))

    render(
      <StreamTagEditor
        streamId={123}
        initialTags={initialTags}
        actingUserId="user-1"
      />,
    )

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
      "Failed to update tags: Database down",
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

    // TagCombobox needs to be able to resolve listTags when opened
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

    render(
      <StreamTagEditor
        streamId={123}
        initialTags={initialTags}
        actingUserId="user-1"
      />,
    )

    // Open combobox and select "Coding"
    await user.click(screen.getByRole("combobox"))
    await waitFor(() => {
      expect(screen.getByText("Coding")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Coding"))

    // Verify attach was called
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

    render(
      <StreamTagEditor
        streamId={123}
        initialTags={initialTags}
        actingUserId="user-1"
      />,
    )

    await user.click(screen.getByRole("combobox"))
    await waitFor(() => {
      expect(screen.getByText("Coding")).toBeInTheDocument()
    })

    await user.click(screen.getByText("Coding"))

    // The tag is optimistically added and then rolled back from lists
    await waitFor(() => {
      const selectedList = screen.getByLabelText("selected tags")
      expect(within(selectedList).queryByText("Coding")).not.toBeInTheDocument()

      const attachedList = screen.getByLabelText("stream tags")
      expect(within(attachedList).queryByText("Coding")).not.toBeInTheDocument()
    })

    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to update tags: Tag limit reached",
    )
  })
})
