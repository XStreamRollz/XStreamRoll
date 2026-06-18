import { ExternalLink, ThumbsUp, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { VouchRequest } from "@/lib/api/vouching"

interface VouchRequestCardProps {
  request: VouchRequest
  onReviewProfile: (request: VouchRequest) => void
  onVouch: (request: VouchRequest) => void
  onDecline: (request: VouchRequest) => void
  disabled?: boolean
}

export function VouchRequestCard({
  request,
  onReviewProfile,
  onVouch,
  onDecline,
  disabled = false,
}: VouchRequestCardProps) {
  const truncatedAddress = `${request.learnerAddress.slice(0, 6)}...${request.learnerAddress.slice(-4)}`

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-mono">{truncatedAddress}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Requested {new Date(request.requestedAt).toLocaleDateString()}
            </p>
          </div>
          <Badge variant="secondary" className="font-mono tabular-nums">
            Score: {request.reputationScore}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Loan Amount</p>
            <p className="font-medium">{request.loanAmount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Purpose</p>
            <p className="font-medium truncate" title={request.purpose}>
              {request.purpose}
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReviewProfile(request)}
            disabled={disabled}
          >
            <ExternalLink className="size-3.5" />
            Review Profile
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onVouch(request)}
            disabled={disabled}
          >
            <ThumbsUp className="size-3.5" />
            Vouch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDecline(request)}
            disabled={disabled}
          >
            <X className="size-3.5" />
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
