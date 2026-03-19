import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, IndianRupee, AlertTriangle, ShieldAlert } from "lucide-react";
import type { Claim, Worker } from "@shared/schema";

const triggerLabels: Record<string, string> = {
  extreme_heat: "Extreme Heat", heavy_rain: "Heavy Rain", flood: "Flood",
  pollution: "Pollution", curfew: "Curfew", strike: "Strike",
};

const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Pending Review" },
  approved: { variant: "secondary", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  paid: { variant: "default", label: "Paid" },
};

function FraudBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  if (score < 20) return <Badge className="bg-green-500/10 text-green-600 text-[10px] border-0">Low Risk ({score})</Badge>;
  if (score < 50) return <Badge className="bg-amber-500/10 text-amber-600 text-[10px] border-0">Medium ({score})</Badge>;
  return <Badge className="bg-red-500/10 text-red-600 text-[10px] border-0">High Risk ({score})</Badge>;
}

export default function Claims() {
  const { toast } = useToast();
  const { data: claims, isLoading } = useQuery<Claim[]>({ queryKey: ["/api/claims"] });
  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });

  const workerMap = new Map(workers?.map((w) => [w.id, w]) || []);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/claims/${id}/status`, { status: "approved" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Claim approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/claims/${id}/status`, { status: "rejected" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      toast({ title: "Claim rejected" });
    },
  });

  const payMutation = useMutation({
    mutationFn: async ({ claimId, method }: { claimId: string; method: string }) => {
      const res = await apiRequest("POST", "/api/payouts", { claimId, method });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Payout processed", description: "Funds sent via UPI instantly" });
    },
  });

  const pendingClaims = claims?.filter((c) => c.status === "pending") || [];
  const otherClaims = claims?.filter((c) => c.status !== "pending") || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Claims Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">AI-powered fraud detection with automatic parametric claim processing</p>
      </div>

      {/* Pending Claims (need attention) */}
      {pendingClaims.length > 0 && (
        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold">Pending Review ({pendingClaims.length})</h2>
            </div>
            <div className="space-y-3">
              {pendingClaims.map((claim) => {
                const worker = workerMap.get(claim.workerId);
                return (
                  <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20" data-testid={`pending-claim-${claim.id}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{worker?.name || "Unknown"}</p>
                        <Badge variant="outline" className="text-[10px]">{triggerLabels[claim.triggerType]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {claim.triggerValue} · {claim.incomeLosstHours}h lost · ₹{claim.payoutAmount.toLocaleString("en-IN")}
                      </p>
                      <div className="flex items-center gap-2">
                        <FraudBadge score={claim.fraudScore} />
                        {claim.fraudFlags?.map((f) => (
                          <Badge key={f} variant="destructive" className="text-[9px]">{f.replace("_", " ")}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(claim.id)} disabled={rejectMutation.isPending} data-testid={`button-reject-${claim.id}`}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                      </Button>
                      <Button size="sm" onClick={() => approveMutation.mutate(claim.id)} disabled={approveMutation.isPending} data-testid={`button-approve-${claim.id}`}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Claims Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Worker</TableHead>
                <TableHead className="text-xs">Trigger</TableHead>
                <TableHead className="text-xs">Value</TableHead>
                <TableHead className="text-xs">Hours Lost</TableHead>
                <TableHead className="text-xs">Payout</TableHead>
                <TableHead className="text-xs">Fraud Score</TableHead>
                <TableHead className="text-xs">Auto-Approved</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Loading...</TableCell></TableRow>
              )}
              {[...pendingClaims, ...otherClaims].map((claim) => {
                const worker = workerMap.get(claim.workerId);
                const cfg = statusConfig[claim.status] || statusConfig.pending;
                return (
                  <TableRow key={claim.id} data-testid={`row-claim-${claim.id}`}>
                    <TableCell className="text-sm font-medium">{worker?.name || "Unknown"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{triggerLabels[claim.triggerType]}</Badge></TableCell>
                    <TableCell className="text-sm">{claim.triggerValue}</TableCell>
                    <TableCell className="text-sm">{claim.incomeLosstHours}h</TableCell>
                    <TableCell className="text-sm font-semibold">₹{claim.payoutAmount.toLocaleString("en-IN")}</TableCell>
                    <TableCell><FraudBadge score={claim.fraudScore} /></TableCell>
                    <TableCell className="text-sm">{claim.autoApproved ? "Yes" : "No"}</TableCell>
                    <TableCell><Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge></TableCell>
                    <TableCell>
                      {claim.status === "approved" && (
                        <Button size="sm" variant="outline" onClick={() => payMutation.mutate({ claimId: claim.id, method: "upi" })} disabled={payMutation.isPending} data-testid={`button-pay-${claim.id}`}>
                          <IndianRupee className="w-3 h-3 mr-1" />Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
