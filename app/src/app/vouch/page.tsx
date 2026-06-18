"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Handshake, ScrollText, Search, UserCheck } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "@/lib/toast"
import {
  type VouchRequest,
  type ActiveVouch,
  type VouchImpact,
  VouchingApiError,
  getVouchRequests,
  getMyVouches,
  submitVouch,
  revokeVouch,
} from "@/lib/api/vouching"
import { VouchRequestCard } from "@/src/components/vouch/VouchRequestCard"
import { VouchImpactPreview } from "@/src/components/vouch/VouchImpactPreview"

type RequestsState =
  | { kind: "loading" }
  | { kind: "ready"; data: VouchRequest[] }
  | { kind: "error"; message: string }

type VouchesState =
  | { kind: "loading" }
  | { kind: "ready"; data: ActiveVouch[] }
  | { kind: "error"; message: string }

function computeImpact(request: VouchRequest): VouchImpact {
  return {
    scoreBefore: request.reputationScore,
    scoreAfter: request.reputationScore + 12,
    interestRateBefore: "8%",
    interestRateAfter: "6%",
  }
}

export default function VouchPage() {
  const [requestsState, setRequestsState] = useState<RequestsState>({ kind: "loading" })
  const [vouchesState, setVouchesState] = useState<VouchesState>({ kind: "loading" })
  const [selectedRequest, setSelectedRequest] = useState<VouchRequest | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const requestsAbortRef = useRef<AbortController | null>(null)
  const vouchesAbortRef = useRef<AbortController | null>(null)

  const loadRequests = useCallback((signal?: AbortSignal) => {
    setRequestsState({ kind: "loading" })
    getVouchRequests({ signal })
      .then((data) => {
        setRequestsState({ kind: "ready", data })
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        const message =
          err instanceof VouchingApiError
            ? `API responded ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown error"
        setRequestsState({ kind: "error", message })
      })
  }, [])

  const loadVouches = useCallback((signal?: AbortSignal) => {
    setVouchesState({ kind: "loading" })
    getMyVouches({ signal })
      .then((data) => {
        setVouchesState({ kind: "ready", data })
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        const message =
          err instanceof VouchingApiError
            ? `API responded ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown error"
        setVouchesState({ kind: "error", message })
      })
  }, [])

  useEffect(() => {
    requestsAbortRef.current = new AbortController()
    loadRequests(requestsAbortRef.current.signal)
    return () => {
      requestsAbortRef.current?.abort()
    }
  }, [loadRequests])

  useEffect(() => {
    vouchesAbortRef.current = new AbortController()
    loadVouches(vouchesAbortRef.current.signal)
    return () => {
      vouchesAbortRef.current?.abort()
    }
  }, [loadVouches])

  const handleVouch = useCallback(async (request: VouchRequest) => {
    setPendingAction(request.id)
    try {
      await submitVouch(request.learnerAddress)
      toast.success("Vouch submitted successfully")
      setSelectedRequest(null)
      requestsAbortRef.current = new AbortController()
      vouchesAbortRef.current = new AbortController()
      loadRequests(requestsAbortRef.current.signal)
      loadVouches(vouchesAbortRef.current.signal)
    } catch (err) {
      const message =
        err instanceof VouchingApiError
          ? `API responded ${err.status}`
          : err instanceof Error
            ? err.message
            : "unknown error"
      toast.error(`Failed to submit vouch: ${message}`)
    } finally {
      setPendingAction(null)
    }
  }, [loadRequests, loadVouches])

  const handleRevoke = useCallback(async (id: string) => {
    setPendingAction(id)
    try {
      await revokeVouch(id)
      toast.success("Vouch revoked successfully")
      vouchesAbortRef.current = new AbortController()
      loadVouches(vouchesAbortRef.current.signal)
    } catch (err) {
      const message =
        err instanceof VouchingApiError
          ? `API responded ${err.status}`
          : err instanceof Error
            ? err.message
            : "unknown error"
      toast.error(`Failed to revoke vouch: ${message}`)
    } finally {
      setPendingAction(null)
    }
  }, [loadVouches])

  const handleDecline = useCallback((request: VouchRequest) => {
    toast.info(`Declined vouch request from ${request.learnerAddress.slice(0, 6)}...`)
    setRequestsState((prev) =>
      prev.kind === "ready"
        ? { ...prev, data: prev.data.filter((r) => r.id !== request.id) }
        : prev,
    )
  }, [])

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Vouching</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review learner vouch requests and manage your active vouches.
        </p>
      </header>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">
            <Search className="size-4" />
            Pending Requests
          </TabsTrigger>
          <TabsTrigger value="active">
            <Handshake className="size-4" />
            My Active Vouches
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-6">
          {requestsState.kind === "loading" ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mt-1 h-3 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <Skeleton className="h-9 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : requestsState.kind === "error" ? (
            <Card role="alert" className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-base">Failed to load requests</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{requestsState.message}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    requestsAbortRef.current = new AbortController()
                    loadRequests(requestsAbortRef.current.signal)
                  }}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : requestsState.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserCheck />
                </EmptyMedia>
                <EmptyTitle>No pending requests</EmptyTitle>
                <EmptyDescription>
                  There are no learners requesting a vouch right now. Check back later.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {requestsState.data.map((request) => (
                <VouchRequestCard
                  key={request.id}
                  request={request}
                  onReviewProfile={setSelectedRequest}
                  onVouch={setSelectedRequest}
                  onDecline={handleDecline}
                  disabled={pendingAction === request.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active" className="mt-6">
          {vouchesState.kind === "loading" ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mt-1 h-3 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-9 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : vouchesState.kind === "error" ? (
            <Card role="alert" className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-base">Failed to load active vouches</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{vouchesState.message}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    vouchesAbortRef.current = new AbortController()
                    loadVouches(vouchesAbortRef.current.signal)
                  }}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : vouchesState.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Handshake />
                </EmptyMedia>
                <EmptyTitle>No active vouches</EmptyTitle>
                <EmptyDescription>
                  You haven&apos;t vouched for any learners yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-4">
              {vouchesState.data.map((vouch) => (
                <Card key={vouch.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-mono">
                          {vouch.learnerAddress.slice(0, 6)}...
                          {vouch.learnerAddress.slice(-4)}
                        </CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Expires{" "}
                          {new Date(vouch.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <RepaymentBadge status={vouch.repaymentStatus} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Boost given: </span>
                      <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                        +{vouch.reputationBoost} rep
                      </span>
                    </div>
                    <ConfirmDialog
                      title="Revoke vouch"
                      description={`This will remove your vouch for ${vouch.learnerAddress.slice(0, 6)}...${vouch.learnerAddress.slice(-4)}. The learner's reputation score will decrease and their interest rate may increase.`}
                      confirmLabel="Revoke"
                      variant="destructive"
                      onConfirm={() => handleRevoke(vouch.id)}
                      disabled={pendingAction === vouch.id}
                      trigger={
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={pendingAction === vouch.id}
                        >
                          {pendingAction === vouch.id ? (
                            <>
                              <Spinner className="size-3.5" />
                              Revoking…
                            </>
                          ) : (
                            "Revoke"
                          )}
                        </Button>
                      }
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!selectedRequest}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Learner Profile</DialogTitle>
            <DialogDescription>
              Review the learner&apos;s details before submitting your vouch.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-mono font-medium">
                      {selectedRequest.learnerAddress.slice(0, 6)}...
                      {selectedRequest.learnerAddress.slice(-4)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested{" "}
                      {new Date(selectedRequest.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    Score: {selectedRequest.reputationScore}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Loan Amount</p>
                    <p className="font-medium">{selectedRequest.loanAmount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Purpose</p>
                    <p className="font-medium">{selectedRequest.purpose}</p>
                  </div>
                </div>
              </div>

              <VouchImpactPreview impact={computeImpact(selectedRequest)} />

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleVouch(selectedRequest)}
                  disabled={pendingAction === selectedRequest.id}
                >
                  {pendingAction === selectedRequest.id ? (
                    <>
                      <Spinner className="size-4" />
                      Confirming…
                    </>
                  ) : (
                    <>
                      <ScrollText className="size-4" />
                      Confirm &amp; Sign
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

function RepaymentBadge({ status }: { status: ActiveVouch["repaymentStatus"] }) {
  const config: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    on_track: { label: "On Track", variant: "default" },
    late: { label: "Late", variant: "destructive" },
    completed: { label: "Completed", variant: "outline" },
    defaulted: { label: "Defaulted", variant: "destructive" },
  }
  const { label, variant } = config[status] ?? {
    label: status,
    variant: "secondary" as const,
  }
  return <Badge variant={variant}>{label}</Badge>
}
