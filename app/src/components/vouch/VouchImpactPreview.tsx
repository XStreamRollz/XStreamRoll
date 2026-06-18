import { ArrowRight, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { VouchImpact } from "@/lib/api/vouching"

interface VouchImpactPreviewProps {
  impact: VouchImpact
}

export function VouchImpactPreview({ impact }: VouchImpactPreviewProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Vouch Impact Preview
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="cursor-help">
                  <Info className="size-3.5 text-muted-foreground" />
                  <span className="sr-only">More info about vouch impact</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-60">
                A Silver-tier vouch adds 12 reputation points, lowering the
                learner&apos;s interest rate from 8% to 6%.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Reputation Score</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold tabular-nums">
                {impact.scoreBefore}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="text-xl font-semibold tabular-nums text-green-600 dark:text-green-400">
                {impact.scoreAfter}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Interest Rate</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm font-semibold tabular-nums">
                {impact.interestRateBefore}
              </Badge>
              <ArrowRight className="size-4 text-muted-foreground" />
              <Badge
                variant="outline"
                className="text-sm font-semibold tabular-nums border-green-500 text-green-600 dark:text-green-400"
              >
                {impact.interestRateAfter}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
