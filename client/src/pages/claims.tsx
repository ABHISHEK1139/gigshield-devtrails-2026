import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle, IndianRupee, ShieldAlert, XCircle } from "lucide-react";
import type { Claim, FraudSignal, Worker } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type ClaimWithSignals = Claim & { signals?: FraudSignal[] };

const triggerLabels: Record<string, string> = {
  extreme_heat: "Extreme Heat",
  heavy_rain: "Heavy Rain",
  flood: "Flood",
  pollution: "Pollution",
  curfew: "Curfew",
  strike: "Strike",
};

const statusStyles: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "secondary",
  paid: "default",
  rejected: "destructive",
  manual_review: "outline",
  blocked_no_impact: "destructive",
  blocked_waiting_period: "destructive",
  blocked_duplicate_event: "destructive",
  blocked_unverified_baseline: "destructive",
  blocked_pre_event_inactivity: "destructive",
  blocked_activity_continuity: "destructive",
  blocked_opportunistic_login: "destructive",
  blocked_no_work_proof: "destructive",
};

export default function Claims() {
  const { toast } = useToast();
  const { data: claims, isLoading } = useQuery<ClaimWithSignals[]>({ queryKey: ["/api/admin/claims"] });
  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/admin/workers"] });

  const workerMap = new Map(workers?.map((worker) => [worker.id, worker]) || []);

  const reviewMutation = useMutation({
    mutationFn: async ({
      claimId,
      action,
    }: {
      claimId: string;
      action: "approve" | "reject" | "manual_review";
    }) => {
      const res = await apiRequest("POST", `/api/admin/claims/${claimId}/review`, { action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/claims"] });
      toast({ title: "Claim updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Review failed", description: error.message, variant: "destructive" });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: async (claimId: string) => {
      const res = await apiRequest("POST", "/api/admin/payouts", { claimId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Payout completed", description: "Idempotent payout record created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Payout failed", description: error.message, variant: "destructive" });
    },
  });

  const actionableClaims =
    claims?.filter((claim) => claim.status === "manual_review" || claim.status === "approved") || [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">
          Claims
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Claims are evaluated from pre-event activity, continuity across the disruption, measured impact, and deterministic anti-abuse rules.
        </p>
      </div>

      {actionableClaims.length > 0 ? (
        <Card className="border-amber-500/30">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold">Needs Attention ({actionableClaims.length})</h2>
            </div>

            {actionableClaims.map((claim) => (
              <div key={claim.id} className="space-y-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {workerMap.get(claim.workerId)?.name || "Unknown"} / {triggerLabels[claim.triggerType] || claim.triggerType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Event {claim.eventImpactHours.toFixed(1)}h / Approved {claim.approvedCompensationHours.toFixed(1)}h / Loss ratio{" "}
                      {(claim.impactLossRatio * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pre-event {claim.preEventActiveMinutes.toFixed(0)}m / During-event {claim.duringEventActiveMinutes.toFixed(0)}m / Continuity {claim.continuityScore.toFixed(0)} / Work proof {claim.workProofScore.toFixed(0)}
                    </p>
                  </div>
                  <Badge variant={statusStyles[claim.status] || "outline"}>{claim.status.replace(/_/g, " ")}</Badge>
                </div>

                {claim.blockReason ? (
                  <p className="text-xs text-destructive">Block reason: {claim.blockReason.replace(/_/g, " ")}</p>
                ) : null}

                {claim.signals && claim.signals.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {claim.signals.map((signal) => (
                      <Badge key={signal.id} variant="destructive" className="text-[10px]">
                        {signal.signalType.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {claim.decisionExplanation ? (
                  <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    {claim.decisionExplanation}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  {claim.status === "manual_review" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate({ claimId: claim.id, action: "reject" })}>
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => reviewMutation.mutate({ claimId: claim.id, action: "approve" })}
                        disabled={!!claim.blockReason}
                      >
                        <CheckCircle className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                    </>
                  ) : null}

                  {claim.status === "approved" ? (
                    <Button size="sm" variant="outline" onClick={() => payoutMutation.mutate(claim.id)}>
                      <IndianRupee className="mr-1 h-3 w-3" />
                      Pay
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Worker</TableHead>
                <TableHead className="text-xs">Trigger</TableHead>
                <TableHead className="text-xs">Activity Guardrails</TableHead>
                <TableHead className="text-xs">Measured Drop</TableHead>
                <TableHead className="text-xs">Payout</TableHead>
                <TableHead className="text-xs">Fraud Score</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Loading claims...
                  </TableCell>
                </TableRow>
              ) : null}

              {claims?.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="text-sm font-medium">{workerMap.get(claim.workerId)?.name || "Unknown"}</TableCell>
                  <TableCell className="text-sm">{triggerLabels[claim.triggerType] || claim.triggerType}</TableCell>
                  <TableCell className="text-sm">
                    {claim.preEventActiveMinutes.toFixed(0)}m before / {claim.duringEventActiveMinutes.toFixed(0)}m during
                  </TableCell>
                  <TableCell className="text-sm">
                    {(claim.measuredEarningsDrop * 100).toFixed(0)}% earnings / {(claim.measuredActiveHoursDrop * 100).toFixed(0)}% activity
                  </TableCell>
                  <TableCell className="text-sm font-semibold">Rs {claim.payoutAmount.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-sm">{claim.fraudScore ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={statusStyles[claim.status] || "outline"} className="text-[10px]">
                      {claim.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
