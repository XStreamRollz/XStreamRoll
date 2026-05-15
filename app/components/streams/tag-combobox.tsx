"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { listTags, Tag, TagsApiError } from "@/lib/api/tags"

export interface TagComboboxProps {
  /**
   * Currently-selected tags. The combobox is a controlled component:
   * the parent owns the array and is responsible for persisting changes.
   */
  value: Tag[]
  onChange: (next: Tag[]) => void
  /**
   * Invoked when the user types a brand-new name and presses Enter.
   * Resolving the promise with the canonical Tag (id+slug) tells the
   * combobox to attach it to the selected set.
   */
  onCreate?: (name: string) => Promise<Tag>
  placeholder?: string
  className?: string
  disabled?: boolean
}

const TAG_PAGE_LIMIT = 100

export function TagCombobox({
  value,
  onChange,
  onCreate,
  placeholder = "Add tags…",
  className,
  disabled,
}: TagComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [available, setAvailable] = React.useState<Tag[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  // Load the full first page of tags whenever the popover opens. We
  // cache the result inside the component so re-opening is instant.
  React.useEffect(() => {
    if (!open || available !== null) return
    const controller = new AbortController()
    listTags({ limit: TAG_PAGE_LIMIT, signal: controller.signal })
      .then((page) => setAvailable(page.items))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setLoadError(err instanceof Error ? err.message : "failed to load tags")
        setAvailable([])
      })
    return () => controller.abort()
  }, [open, available])

  const selectedIds = React.useMemo(() => new Set(value.map((t) => t.id)), [value])
  const trimmedSearch = search.trim()
  const normalizedSearch = trimmedSearch.toLowerCase()

  const canCreate =
    !!onCreate &&
    trimmedSearch.length > 0 &&
    !(available ?? []).some(
      (t) =>
        t.name.toLowerCase() === normalizedSearch ||
        t.slug === normalizedSearch,
    ) &&
    !value.some(
      (t) =>
        t.name.toLowerCase() === normalizedSearch ||
        t.slug === normalizedSearch,
    )

  function toggleTag(tag: Tag) {
    if (selectedIds.has(tag.id)) {
      onChange(value.filter((t) => t.id !== tag.id))
    } else {
      onChange([...value, tag])
    }
  }

  function removeTag(id: number) {
    onChange(value.filter((t) => t.id !== id))
  }

  async function handleCreate() {
    if (!onCreate || !canCreate || creating) return
    setCreating(true)
    try {
      const created = await onCreate(trimmedSearch)
      // Update the local available list so the new tag appears under
      // "Existing" next time the user opens the popover.
      setAvailable((prev) => (prev ? [...prev, created] : [created]))
      if (!selectedIds.has(created.id)) {
        onChange([...value, created])
      }
      setSearch("")
    } catch (err) {
      const message =
        err instanceof TagsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "failed to create tag"
      setLoadError(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Selected chips */}
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5"
        aria-label="selected tags"
      >
        {value.length === 0 && (
          <span className="text-sm text-muted-foreground">
            No tags yet.
          </span>
        )}
        {value.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="gap-1">
            <span>{tag.name}</span>
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              disabled={disabled}
              className="-mr-1 rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className="text-muted-foreground">{placeholder}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter>
            <CommandInput
              placeholder="Search or create…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {loadError && (
                <div className="px-3 py-2 text-xs text-destructive">{loadError}</div>
              )}
              {!loadError && available === null && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              )}
              {available && available.length === 0 && !canCreate && (
                <CommandEmpty>No tags yet.</CommandEmpty>
              )}
              {available && available.length > 0 && (
                <CommandGroup heading="Existing">
                  {available.map((tag) => {
                    const checked = selectedIds.has(tag.id)
                    return (
                      <CommandItem
                        key={tag.id}
                        value={`${tag.name} ${tag.slug}`}
                        onSelect={() => toggleTag(tag)}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            checked ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span>{tag.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {tag.slug}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
              {canCreate && (
                <CommandGroup heading="Create new">
                  <CommandItem
                    onSelect={() => void handleCreate()}
                    disabled={creating}
                  >
                    <Plus className="mr-2 size-4" />
                    Create &ldquo;{trimmedSearch}&rdquo;
                    {creating && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        creating…
                      </span>
                    )}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
