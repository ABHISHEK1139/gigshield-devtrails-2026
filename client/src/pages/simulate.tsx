import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Zap, CloudRain, Thermometer, Wind, Ban, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { useState } from "react";

const disruptionPresets = [
  { label: "Heatwave in Delhi", city: "Delhi", zone: "South Delhi", alertType: "extreme_heat", severity: "extreme", value: "47°C", threshold: "42°C" },
  { label: "Heavy Rain in Mumbai", city: "Mumbai", zone: "Andheri", alertType: "heavy_rain", severity: "severe", value: "95mm/hr", threshold: "65mm/hr" },
  { label: "Flood in Chennai", city: "Chennai", zone: "T Nagar", alertType: "flood", severity: "extreme", value: "Water level 2.5m", threshold: "1.5m" },
  { label: "Pollution in Delhi", city: "Delhi", zone: "North Delhi", alertType: "pollution", severity: "warning", value: "AQI 450", threshold: "AQI 300" },
  { label: "Curfew in Hyderabad", city: "Hyderabad", zone: "Madhapur", alertType: "curfew", severity: "severe", value: "Section 144", threshold: "Section 144" },
];

const typeIcons: Record<string, typeof Thermometer> = {
  extreme_heat: Thermometer, heavy_rain: CloudRain, flood: CloudRain, pollution: Wind, curfew: Ban, strike: Ban,
};

interface SimResult {
  alert: { id: string; alertType: string; city: string; severity: string; value: string };
  affectedWorkers: number;
  claimsCreated: number;
  claims: { id: string; triggerType: string; incomeLosstHours: number; payoutAmount: number; status: string; fraudScore: number | null; autoApproved: boolean }[];
}

export default function Simulate() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    city: "Delhi", zone: "South Delhi", alertType: "extreme_heat", severity: "extreme", value: "47°C", threshold: "42°C",
  });
  const [result, setResult] = useState<SimResult | null>(null);

  const simMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/simulate-trigger", data);
      return res.json() as Promise<SimResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Disruption simulated", description: `${data.claimsCreated} claims auto-generated` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const applyPreset = (preset: typeof disruptionPresets[0]) => {
    setForm({
      city: preset.city, zone: preset.zone, alertType: preset.alertType,
      severity: preset.severity, value: preset.value, threshold: preset.threshold,
    });
    setResult(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Disruption Simulator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Simulate parametric triggers to demo the automated claim pipeline</p>
      </div>

      {/* Quick Presets */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quick Scenarios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {disruptionPresets.map((p) => {
              const Icon = typeIcons[p.alertType];
              return (
                <Button key={p.label} variant="outline" size="sm" onClick={() => applyPreset(p)} className="text-xs" data-testid={`button-preset-${p.alertType}`}>
                  <Icon className="w-3.5 h-3.5 mr-1.5" />{p.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Trigger Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Configure Trigger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
              <SelectTrigger data-testid="select-sim-city"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Kolkata", "Pune"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Zone" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} data-testid="input-sim-zone" />
            <Select value={form.alertType} onValueChange={(v) => setForm({ ...form, alertType: v })}>
              <SelectTrigger data-testid="select-sim-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="extreme_heat">Extreme Heat</SelectItem>
                <SelectItem value="heavy_rain">Heavy Rain</SelectItem>
                <SelectItem value="flood">Flood</SelectItem>
                <SelectItem value="pollution">Air Pollution</SelectItem>
                <SelectItem value="curfew">Curfew</SelectItem>
                <SelectItem value="strike">Strike</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger data-testid="select-sim-severity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
                <SelectItem value="extreme">Extreme</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Value (e.g. 47°C)" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} data-testid="input-sim-value" />
            <Input placeholder="Threshold (e.g. 42°C)" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} data-testid="input-sim-threshold" />
          </div>
          <Button className="mt-4" onClick={() => simMutation.mutate(form)} disabled={simMutation.isPending} data-testid="button-simulate">
            <Zap className="w-4 h-4 mr-1.5" />
            {simMutation.isPending ? "Simulating..." : "Trigger Disruption"}
          </Button>
        </CardContent>
      </Card>

      {/* Simulation Result */}
      {result && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              Simulation Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pipeline Steps */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <Badge variant="outline" className="py-1">1. Alert Created</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="py-1">2. {result.affectedWorkers} Workers Found</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="py-1">3. {result.claimsCreated} Claims Generated</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge variant="outline" className="py-1">4. Fraud Scored</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <Badge className="py-1">5. Auto-Approved</Badge>
            </div>

            {/* Claims Detail */}
            <div className="space-y-2">
              {result.claims.map((claim, i) => (
                <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50 border border-border" data-testid={`sim-claim-${i}`}>
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{claim.incomeLosstHours}h income lost</p>
                    <p className="text-xs text-muted-foreground">Fraud Score: {claim.fraudScore}/100</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">₹{claim.payoutAmount.toLocaleString("en-IN")}</span>
                    <Badge variant={claim.status === "approved" ? "default" : "outline"} className="text-[10px]">
                      {claim.autoApproved ? "Auto-Approved" : claim.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {result.claimsCreated === 0 && (
              <div className="text-center py-4">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No workers in {result.alert.city} with matching coverage</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
