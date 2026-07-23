import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for /dashboard/streams (list view).
 *
 * Mirrors the layout of the rendered `<StreamTagEditor>` card so the
 * perceived layout shift is minimal when real data arrives. The
 * required `aria-busy`/`aria-label` attributes keep the loading
 * state perceivable to screen readers (#369).
 */
export function StreamListSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading streams"
      role="status"
      className="space-y-4"
      data-testid="stream-list-skeleton"
    >
      {/* Header mirrors <h1> + description */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Card mirroring StreamTagEditor */}
      <div className="rounded-lg border">
        <div className="flex flex-col gap-1.5 p-6 pb-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-col gap-4 p-6 pt-0">
          {/* Combobox input */}
          <Skeleton className="h-10 w-full" />
          {/* "Attached" label + chip row */}
          <div>
            <Skeleton className="mb-2 h-3 w-16" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
