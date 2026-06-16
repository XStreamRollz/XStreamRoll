import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog } from "./confirm-dialog"

describe("ConfirmDialog", () => {
  it("does not render content until triggered", () => {
    render(
      <ConfirmDialog
        title="Delete stream"
        description="This is permanent."
        onConfirm={() => {}}
        trigger={<button>Open</button>}
      />
    )
    expect(screen.queryByText("Delete stream")).not.toBeInTheDocument()
  })

  it("shows title and description when opened", async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Delete stream"
        description="This is permanent."
        onConfirm={() => {}}
        trigger={<button>Open</button>}
      />
    )
    await user.click(screen.getByText("Open"))
    expect(screen.getByText("Delete stream")).toBeInTheDocument()
    expect(screen.getByText("This is permanent.")).toBeInTheDocument()
  })

  it("calls onConfirm when the action button is clicked", async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    render(
      <ConfirmDialog
        title="Delete stream"
        description="This is permanent."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        trigger={<button>Open</button>}
      />
    )
    await user.click(screen.getByText("Open"))
    await user.click(screen.getByText("Delete"))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("supports custom confirm and cancel labels", async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Discard changes"
        description="You will lose your edits."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {}}
        trigger={<button>Open</button>}
      />
    )
    await user.click(screen.getByText("Open"))
    expect(screen.getByText("Discard")).toBeInTheDocument()
    expect(screen.getByText("Keep editing")).toBeInTheDocument()
  })
})
