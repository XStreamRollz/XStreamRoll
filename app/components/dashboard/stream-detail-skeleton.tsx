import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for /dashboard/streams/[id] (detail view).
 *
 * Mirrors the layout of the rendered `<EmbedSnippet>` card so the
 * perceived layout shift is minimal when real data arrives. The
 * required `aria-busy`/`aria-label` attributes keep the loading
 * state perceivable to screen readers (#369). The label uses
 * singular "stream" because this view resolves a single entity.
 */
export function StreamDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading stream"
      role="status"
      className="space-y-4"
      data-testid="stream-detail-skeleton"
    >
      {/* Header mirrors <h1> + description */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Card mirroring EmbedSnippet */}
      <div className="rounded-lg border">
        <div className="flex flex-col gap-1.5 p-6 pb-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="p-6 pt-0">
          <Skeleton className="h-[110px] w-full" />
        </div>
      </div>
    </div>
  );
}
