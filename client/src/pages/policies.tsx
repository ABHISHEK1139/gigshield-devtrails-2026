import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function Policies() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [selectedTier, setSelectedTier] = useState("standard");
  const [premiumPreview, setPremiumPreview] = useState<{ riskScore: number; weeklyPremium: number; maxWeeklyCoverage: number } | null>(null);

  const { data: policies, isLoading } = useQuery<Policy[]>({ queryKey: ["/api/policies"] });
  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });

  const previewMutation = useMutation({
    mutationFn: async ({ workerId, planTier }: { workerId: string; planTier: string }) => {
      const worker = workers?.find((w) => w.id === workerId);
      if (!worker) throw new Error("Select a worker");
      const res = await apiRequest("POST", "/api/calculate-premium", {
        city: worker.city, zone: worker.zone, vehicleType: worker.vehicleType,
        avgDailyHours: worker.avgDailyHours, experienceMonths: worker.experienceMonths,
        avgWeeklyEarnings: worker.avgWeeklyEarnings, planTier,
      });
      return res.json();
    },
    onSuccess: (data) => setPremiumPreview(data),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const coverageMap: Record<string, string[]> = {
        basic: ["extreme_heat", "heavy_rain"],
        standard: ["extreme_heat", "heavy_rain", "flood", "pollution"],
        premium: ["extreme_heat", "heavy_rain", "flood", "pollution", "curfew", "strike"],
      };
      const res = await apiRequest("POST", "/api/policies", {
        workerId: selectedWorker,
        planTier: selectedTier,
        coverageTypes: coverageMap[selectedTier],
        autoRenew: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      toast({ title: "Policy created", description: "Weekly premium calculated via AI risk model" });
      setOpen(false);
      setPremiumPreview(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const workerMap = new Map(workers?.map((w) => [w.id, w]) || []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Insurance Policies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Weekly parametric coverage plans with dynamic AI pricing</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-create-policy"><Plus className="w-4 h-4 mr-1.5" />Create Policy</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="text-base">Create Insurance Policy</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select Worker</label>
                <Select value={selectedWorker} onValueChange={(v) => { setSelectedWorker(v); setPremiumPreview(null); }}>
                  <SelectTrigger data-testid="select-worker"><SelectValue placeholder="Choose a worker" /></SelectTrigger>
                  <SelectContent>
                    {workers?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name} — {w.platform} ({w.city})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Plan Tier</label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(tierConfig).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => { setSelectedTier(key); setPremiumPreview(null); }}
                      className={`p-3 rounded-lg border text-left transition-colors ${selectedTier === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                      data-testid={`button-tier-${key}`}
                    >
                      <p className="text-sm font-medium">{config.label}</p>
                      <div className="mt-1.5 space-y-0.5">
                        {config.features.map((f) => (
                          <p key={f} className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5 text-primary" />{f}
                          </p>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedWorker && (
                <Button variant="outline" size="sm" className="w-full"
                  onClick={() => previewMutation.mutate({ workerId: selectedWorker, planTier: selectedTier })}
                  disabled={previewMutation.isPending}
                  data-testid="button-calculate"
                >
                  {previewMutation.isPending ? "Calculating..." : "Calculate Premium"}
                </Button>
              )}

              {premiumPreview && (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Risk Score</span>
                    <span className="font-medium">{premiumPreview.riskScore}/100</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Weekly Premium</span>
                    <span className="font-bold text-primary">₹{premiumPreview.weeklyPremium}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max Coverage/Week</span>
                    <span className="font-medium">₹{premiumPreview.maxWeeklyCoverage.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!selectedWorker || !premiumPreview || createMutation.isPending} data-testid="button-submit-policy">
                {createMutation.isPending ? "Creating..." : "Create Policy"}
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
                <TableHead className="text-xs">Max Coverage</TableHead>
                <TableHead className="text-xs">Coverage Types</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Auto-Renew</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading...</TableCell></TableRow>
              )}
              {policies?.map((p) => {
                const worker = workerMap.get(p.workerId);
                const tier = tierConfig[p.planTier];
                return (
                  <TableRow key={p.id} data-testid={`row-policy-${p.id}`}>
                    <TableCell className="text-sm font-medium">{worker?.name || "Unknown"}</TableCell>
                    <TableCell><Badge className={`text-[10px] border-0 ${tier?.color || ""}`}>{tier?.label || p.planTier}</Badge></TableCell>
                    <TableCell className="text-sm font-semibold text-primary">₹{p.weeklyPremium}/wk</TableCell>
                    <TableCell className="text-sm">₹{p.maxWeeklyCoverage.toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.coverageTypes?.map((t) => (
                          <Badge key={t} variant="outline" className="text-[9px] py-0">{t.replace("_", " ")}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">{p.status}</Badge></TableCell>
                    <TableCell className="text-sm">{p.autoRenew ? "Yes" : "No"}</TableCell>
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
