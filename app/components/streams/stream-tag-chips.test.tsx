import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StreamTagChips } from "./stream-tag-chips"
import { Tag } from "@/lib/api/tags"

describe("StreamTagChips", () => {
  const mockTags: Tag[] = [
    { id: 1, name: "Gaming", slug: "gaming", createdAt: "2026-06-18" },
    { id: 2, name: "Music", slug: "music", createdAt: "2026-06-18" },
  ]

  it("renders empty label when tags list is empty (empty state test)", () => {
    render(<StreamTagChips tags={[]} />)
    expect(screen.getByText("No tags attached.")).toBeInTheDocument()
  })

  it("renders custom empty label when provided", () => {
    render(<StreamTagChips tags={[]} emptyLabel="Empty list" />)
    expect(screen.getByText("Empty list")).toBeInTheDocument()
  })

  it("renders tags badges in read-only mode (rendering test)", () => {
    render(<StreamTagChips tags={mockTags} />)
    expect(screen.getByText("Gaming")).toBeInTheDocument()
    expect(screen.getByText("Music")).toBeInTheDocument()
    // No remove buttons should be present
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("renders tags with remove buttons and triggers onRemove on click (interaction test)", async () => {
    const user = userEvent.setup()
    const handleRemove = jest.fn()

    render(<StreamTagChips tags={mockTags} onRemove={handleRemove} />)

    expect(screen.getByText("Gaming")).toBeInTheDocument()
    expect(screen.getByText("Music")).toBeInTheDocument()

    const removeButtons = screen.getAllByRole("button")
    expect(removeButtons).toHaveLength(2)

    expect(
      screen.getByRole("button", { name: "Remove tag Gaming" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Remove tag Music" }),
    ).toBeInTheDocument()

    await user.click(removeButtons[0])
    expect(handleRemove).toHaveBeenCalledTimes(1)
    expect(handleRemove).toHaveBeenCalledWith(mockTags[0])
  })
})
