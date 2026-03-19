import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Thermometer, CloudRain, Wind, Ban, CheckCircle, AlertTriangle } from "lucide-react";
import type { WeatherAlert } from "@shared/schema";

const alertConfig: Record<string, { icon: typeof Thermometer; color: string; label: string }> = {
  extreme_heat: { icon: Thermometer, color: "text-red-500", label: "Extreme Heat" },
  heavy_rain: { icon: CloudRain, color: "text-blue-500", label: "Heavy Rain" },
  flood: { icon: CloudRain, color: "text-cyan-500", label: "Flood" },
  pollution: { icon: Wind, color: "text-amber-600", label: "Air Pollution" },
  curfew: { icon: Ban, color: "text-purple-500", label: "Curfew" },
  strike: { icon: Ban, color: "text-rose-500", label: "Strike" },
};

const severityColors: Record<string, string> = {
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  severe: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  extreme: "bg-red-500/10 text-red-600 border-red-500/20",
};

export default function Alerts() {
  const { toast } = useToast();
  const { data: alerts, isLoading } = useQuery<WeatherAlert[]>({ queryKey: ["/api/alerts"] });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/alerts/${id}/resolve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert resolved" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Weather & Disruption Alerts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time parametric trigger monitoring from weather APIs</p>
      </div>

      {!alerts?.length && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-10 h-10 text-primary mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No active weather alerts. All clear.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {alerts?.map((alert) => {
          const config = alertConfig[alert.alertType] || alertConfig.extreme_heat;
          const Icon = config.icon;
          return (
            <Card key={alert.id} className={`border ${alert.isActive ? severityColors[alert.severity]?.split(" ")[2] || "border-border" : "border-border opacity-60"}`} data-testid={`card-alert-${alert.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${severityColors[alert.severity]?.split(" ")[0] || "bg-muted"}`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
                        <Badge className={`text-[10px] border ${severityColors[alert.severity] || ""}`}>{alert.severity}</Badge>
                        {!alert.isActive && <Badge variant="secondary" className="text-[10px]">Resolved</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{alert.city} — {alert.zone}</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">Current:</span>
                          <span className="font-semibold text-foreground">{alert.value}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-muted-foreground">Threshold:</span>
                          <span className="font-medium">{alert.threshold}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Triggered: {new Date(alert.triggeredAt).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                  {alert.isActive && (
                    <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(alert.id)} disabled={resolveMutation.isPending} data-testid={`button-resolve-${alert.id}`}>
                      Resolve
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Threshold Reference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Parametric Trigger Thresholds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { type: "Extreme Heat", threshold: "> 42°C", severity: "Working conditions unsafe" },
              { type: "Heavy Rain", threshold: "> 65mm/hr", severity: "Deliveries halted" },
              { type: "Flood", threshold: "Water > 1.5m", severity: "Roads impassable" },
              { type: "Air Pollution", threshold: "AQI > 300", severity: "Health hazard" },
              { type: "Curfew", threshold: "Section 144", severity: "Movement restricted" },
              { type: "Strike", threshold: "Zone closure", severity: "No pickup/drop access" },
            ].map((t) => (
              <div key={t.type} className="p-3 rounded-lg border border-border">
                <p className="text-xs font-semibold text-foreground">{t.type}</p>
                <p className="text-sm font-bold text-primary mt-0.5">{t.threshold}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t.severity}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
