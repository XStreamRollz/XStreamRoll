"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import type { StreamEvent } from "./types";

// Threshold (px) for considering the user "at the bottom" of the feed.
// Anything larger than this is treated as scrolled up: we then surface
// the scroll-to-bottom button and skip the auto-scroll-on-new-event
// path so an actively reading user doesn't get yanked away from where
// they are looking.
const AT_BOTTOM_THRESHOLD_PX = 50;

// Fixed row height keeps the virtualizer overhead minimal while our rows
// are uniform. Event cards grow slightly with message length, so we
// apply a relaxed upper bound that the virtualizer uses for *scrolling*
// math; actual rendered height is unconstrained and only the visible
// window is materialized in the DOM.
const ROW_HEIGHT_ESTIMATE = 84;
const ROW_HEIGHT_OVERSCAN = 6;

interface Props {
  events: StreamEvent[];
}

export const StreamFeed = ({ events }: Props) => {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // Track whether the user is parked at the bottom of the scroll
  // container. Computed in the scroll handler and used both to gate
  // the auto-scroll-on-new-event path AND to show/hide the jump-to
  // latest button (#358).
  const [isAtBottom, setIsAtBottom] = useState(true);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: ROW_HEIGHT_OVERSCAN,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Auto-scroll-to-bottom-while-parked. When the user is at (or within
  // the threshold of) the bottom and new events arrive we follow them;
  // when they have scrolled up to read history we deliberately leave
  // them alone and surface the "Jump to latest" button instead.
  // `virtualizer` is intentionally omitted from the dep array — it’s
  // re-created on every render and including it would re-run this
  // effect on every parent re-render. The effect body only reads
  // `events.length` and `isAtBottom`, which is exactly what we want.
  useEffect(() => {
    if (!isAtBottom) return;
    if (events.length === 0) return;
    virtualizer.scrollToIndex(events.length - 1, { align: "end" });
  }, [events.length, isAtBottom, virtualizer]);

  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-500" role="status">
        No events received yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={parentRef}
        role="log"
        aria-label="Stream events"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(e) => {
          const el = e.currentTarget;
          const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
          setIsAtBottom(distanceFromBottom <= AT_BOTTOM_THRESHOLD_PX);
        }}
        className="h-[500px] overflow-y-auto rounded-lg border"
      >
        {/* The inner element carries the virtualizer's total height so
            the scrollbar reflects the full content length even though
            only a subset of rows is actually mounted in the DOM. */}
        <div
          style={{
            height: `${totalSize}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualItem: VirtualItem) => {
            const event = events[virtualItem.index];
            if (!event) return null;
            return (
              <div
                key={event.id}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 top-0 w-full p-2"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="rounded-lg border bg-background p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{event.type}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{event.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* "Jump to latest" affordance. Only mounted when the user has
          scrolled up; clicking jumps to the most-recent event so they
          don't have to scroll-find it manually. The button is a real
          focusable control so keyboard users get the same affordance
          as pointer users. */}
      {!isAtBottom ? (
        <button
          type="button"
          onClick={() => {
            parentRef.current?.scrollTo({
              top: parentRef.current.scrollHeight,
              behavior: "smooth",
            });
            setIsAtBottom(true);
          }}
          className="absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-md hover:bg-accent"
          aria-label="Scroll to latest stream event"
        >
          Jump to latest ↓
        </button>
      ) : null}
    </div>
  );
};
