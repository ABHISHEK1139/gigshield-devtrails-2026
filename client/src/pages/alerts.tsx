import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Thermometer, CloudRain, Wind, RefreshCw, CalendarClock } from "lucide-react";
import type { DisruptionEvent } from "@shared/schema";

const triggerConfig: Record<string, { icon: typeof Thermometer; label: string; color: string }> = {
  extreme_heat: { icon: Thermometer, label: "Extreme Heat", color: "text-red-500" },
  heavy_rain: { icon: CloudRain, label: "Heavy Rain", color: "text-blue-500" },
  flood: { icon: CloudRain, label: "Flood", color: "text-cyan-500" },
  pollution: { icon: Wind, label: "Pollution", color: "text-amber-500" },
  curfew: { icon: CalendarClock, label: "Curfew", color: "text-purple-500" },
  strike: { icon: CalendarClock, label: "Strike", color: "text-rose-500" },
};

export default function Alerts() {
  const { toast } = useToast();
  const { data: events, isLoading } = useQuery<DisruptionEvent[]>({ queryKey: ["/api/admin/events"] });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/events/recompute", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: data.triggersFound > 0 ? "Disruption events recomputed" : "No active triggers found",
        description: `${data.claimsCreated} guarded claims were evaluated.`,
      });
    },
    onError: (error: Error) => toast({ title: "Recompute failed", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Disruption Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Weather triggers now create deduplicated events that feed guarded hybrid claim evaluation.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => recomputeMutation.mutate()} disabled={recomputeMutation.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
          {recomputeMutation.isPending ? "Recomputing..." : "Check Live Weather"}
        </Button>
      </div>

      {!events?.length && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No disruption events have been recorded yet.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {events?.map((event) => {
          const config = triggerConfig[event.triggerType] || triggerConfig.extreme_heat;
          const Icon = config.icon;
          return (
            <Card key={event.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    {config.label}
                  </span>
                  <Badge variant={event.severity === "extreme" ? "destructive" : event.severity === "severe" ? "secondary" : "outline"}>
                    {event.severity}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-foreground">{event.city} · {event.zone}</p>
                <p className="text-muted-foreground">
                  {event.triggerValue} against {event.threshold}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.startsAt).toLocaleString("en-IN")} to {new Date(event.endsAt).toLocaleString("en-IN")}
                </p>
                <p className="text-[11px] text-muted-foreground break-all">
                  Event key: {event.eventKey}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
