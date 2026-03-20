import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Shield, CheckCircle } from "lucide-react";
import { useState } from "react";
import type { Policy, Worker } from "@shared/schema";

const tierConfig: Record<string, { label: string; color: string; features: string[] }> = {
  basic: {
    label: "Basic",
    color: "bg-slate-500/10 text-slate-600",
    features: ["Extreme Heat", "Heavy Rain"],
  },
  standard: {
    label: "Standard",
    color: "bg-blue-500/10 text-blue-600",
    features: ["Extreme Heat", "Heavy Rain", "Flood", "Pollution"],
  },
  premium: {
    label: "Premium",
    color: "bg-amber-500/10 text-amber-600",
    features: ["Extreme Heat", "Heavy Rain", "Flood", "Pollution", "Curfew", "Strike"],
  },
};

interface PolicyPreview {
  eligible: boolean;
  status: "eligible" | "manual_review" | "blocked";
  reasons: string[];
  weeklyPremium: number;
  maxWeeklyCoverage: number;
  baselineWeeklyEarnings: number;
  baselineActiveHours: number;
  baselineHourlyEarnings: number;
  waitingPeriodEndsAt: string;
}

export default function Policies() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [selectedTier, setSelectedTier] = useState<"basic" | "standard" | "premium">("standard");
  const [preview, setPreview] = useState<PolicyPreview | null>(null);

  const { data: policies, isLoading } = useQuery<Policy[]>({ queryKey: ["/api/admin/policies"] });
  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/admin/workers"] });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/policies/preview", {
        workerId: selectedWorker,
        planTier: selectedTier,
      });
      return res.json() as Promise<PolicyPreview>;
    },
    onSuccess: (data) => setPreview(data),
    onError: (error: Error) => toast({ title: "Preview failed", description: error.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/policies", {
        workerId: selectedWorker,
        planTier: selectedTier,
        autoRenew: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      toast({ title: "Policy created", description: "Frozen baseline and waiting period have been locked." });
      setOpen(false);
      setPreview(null);
      setSelectedWorker("");
      setSelectedTier("standard");
    },
    onError: (error: Error) => toast({ title: "Create failed", description: error.message, variant: "destructive" }),
  });

  const workerMap = new Map(workers?.map((worker) => [worker.id, worker]) || []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Policies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Policies now price from verified earnings baselines and freeze the payout terms at issue time.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Issue Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Issue Policy From Verified Baseline</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <Select value={selectedWorker} onValueChange={(value) => { setSelectedWorker(value); setPreview(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose worker" />
                </SelectTrigger>
                <SelectContent>
                  {workers?.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name} - {worker.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-3 gap-3">
                {Object.entries(tierConfig).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => { setSelectedTier(key as "basic" | "standard" | "premium"); setPreview(null); }}
                    className={`p-3 rounded-lg border text-left transition-colors ${selectedTier === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                  >
                    <p className="text-sm font-medium">{config.label}</p>
                    <div className="mt-1.5 space-y-0.5">
                      {config.features.map((feature) => (
                        <p key={feature} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5 text-primary" />
                          {feature}
                        </p>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              <Button variant="outline" className="w-full" onClick={() => previewMutation.mutate()} disabled={!selectedWorker || previewMutation.isPending}>
                {previewMutation.isPending ? "Previewing..." : "Preview Underwriting"}
              </Button>

              {preview && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Underwriting Status</p>
                    <Badge variant={preview.status === "eligible" ? "default" : preview.status === "manual_review" ? "secondary" : "destructive"}>
                      {preview.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Baseline Weekly Earnings</p>
                      <p className="font-semibold">₹{preview.baselineWeeklyEarnings.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Baseline Hourly Earnings</p>
                      <p className="font-semibold">₹{preview.baselineHourlyEarnings.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Weekly Premium</p>
                      <p className="font-semibold">₹{preview.weeklyPremium.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Max Weekly Coverage</p>
                      <p className="font-semibold">₹{preview.maxWeeklyCoverage.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Waiting period ends: {new Date(preview.waitingPeriodEndsAt).toLocaleString("en-IN")}
                  </div>
                  {preview.reasons.length > 0 && (
                    <div className="space-y-1">
                      {preview.reasons.map((reason) => (
                        <p key={reason} className="text-xs text-amber-600">{reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!preview || preview.status === "blocked" || createMutation.isPending}>
                {createMutation.isPending ? "Issuing..." : "Issue Policy"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Worker</TableHead>
                <TableHead className="text-xs">Plan</TableHead>
                <TableHead className="text-xs">Weekly Premium</TableHead>
                <TableHead className="text-xs">Frozen Baseline</TableHead>
                <TableHead className="text-xs">Waiting Period</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Loading policies...
                  </TableCell>
                </TableRow>
              )}
              {policies?.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="text-sm font-medium">{workerMap.get(policy.workerId)?.name || "Unknown"}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] border-0 ${tierConfig[policy.planTier]?.color || ""}`}>
                      {tierConfig[policy.planTier]?.label || policy.planTier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-primary">₹{policy.weeklyPremium.toLocaleString("en-IN")}/wk</TableCell>
                  <TableCell className="text-sm">
                    ₹{policy.baselineWeeklyEarnings.toLocaleString("en-IN")} / {policy.baselineActiveHours.toFixed(1)}h
                  </TableCell>
                  <TableCell className="text-sm">{new Date(policy.waitingPeriodEndsAt).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={policy.status === "active" ? "default" : "secondary"} className="text-[10px] w-fit">
                        {policy.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{policy.underwritingStatus}</span>
                    </div>
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
