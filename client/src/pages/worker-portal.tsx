import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, IndianRupee, LogOut, Shield, Wallet, CloudLightning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Claim, Payout, Policy, WeatherAlert, Worker } from "@shared/schema";

export default function WorkerPortal({ onLogout }: { onLogout: () => void }) {
  const { data: worker } = useQuery<Worker>({ queryKey: ["/api/worker/me"] });
  const { data: policies } = useQuery<Policy[]>({ queryKey: ["/api/worker/policies"] });
  const { data: claims } = useQuery<Claim[]>({ queryKey: ["/api/worker/claims"] });
  const { data: payouts } = useQuery<Payout[]>({ queryKey: ["/api/worker/payouts"] });
  const { data: alerts } = useQuery<WeatherAlert[]>({ queryKey: ["/api/worker/alerts"] });

  const activePolicy = policies?.find((policy) => policy.status === "active");
  const totalPaid = (payouts || []).reduce((sum, payout) => sum + payout.amount, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">GigShield Worker Portal</p>
              <p className="text-xs text-muted-foreground">
                {worker?.name || "Worker"} · {worker?.city || "-"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Frozen Baseline</p>
              <p className="mt-1 text-2xl font-bold">
                Rs {activePolicy?.baselineWeeklyEarnings?.toLocaleString("en-IN") || "-"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activePolicy ? `${activePolicy.baselineActiveHours.toFixed(1)}h verified active hours` : "No active policy"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Current Policy</p>
              <p className="mt-1 text-2xl font-bold capitalize">{activePolicy?.planTier || "-"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Waiting period ends{" "}
                {activePolicy ? new Date(activePolicy.waitingPeriodEndsAt).toLocaleDateString("en-IN") : "-"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="mt-1 text-2xl font-bold">Rs {totalPaid.toLocaleString("en-IN")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{payouts?.length || 0} payout records</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Claim History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {claims?.length ? (
                claims.map((claim) => (
                  <div key={claim.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium capitalize">{claim.triggerType.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {(claim.impactLossRatio * 100).toFixed(0)}% verified impact ·{" "}
                        {claim.approvedCompensationHours.toFixed(1)}h approved
                      </p>
                      {claim.blockReason ? (
                        <p className="text-xs text-amber-600">Blocked: {claim.blockReason.replace(/_/g, " ")}</p>
                      ) : null}
                    </div>
                    <Badge variant={claim.status === "paid" ? "default" : claim.status === "approved" ? "secondary" : "outline"}>
                      {claim.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No claims yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CloudLightning className="h-4 w-4" />
                Nearby Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts?.length ? (
                alerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium capitalize">{alert.alertType.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.city} · {alert.zone}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {alert.value} vs threshold {alert.threshold}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No active alerts for your zone.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-4 w-4" />
                Payouts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {payouts?.length ? (
                payouts.map((payout) => (
                  <div key={payout.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Rs {payout.amount.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground">
                        {payout.method.toUpperCase()} · {payout.transactionId || "Processing"}
                      </p>
                    </div>
                    <Badge variant={payout.status === "completed" ? "default" : "outline"}>{payout.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No payouts yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <IndianRupee className="h-4 w-4" />
                Active Coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activePolicy ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Weekly Premium</p>
                    <p className="text-lg font-semibold">Rs {activePolicy.weeklyPremium.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Max Weekly Coverage</p>
                    <p className="text-lg font-semibold">Rs {activePolicy.maxWeeklyCoverage.toLocaleString("en-IN")}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Covered Triggers</p>
                    <p className="text-sm font-medium capitalize">{activePolicy.coverageTypes.join(", ").replace(/_/g, " ")}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active policy is assigned to this worker account.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
