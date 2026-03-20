import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Shield, AlertTriangle, IndianRupee, TrendingUp, Thermometer, CloudRain, Wind } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Claim, DisruptionEvent } from "@shared/schema";

interface DashboardStats {
  totalWorkers: number;
  activePolicies: number;
  totalClaims: number;
  totalPayouts: number;
  totalPremiumCollected: number;
  totalClaimsPaid: number;
  lossRatio: number;
  avgFraudScore: number;
  claimsByType: Record<string, number>;
  claimsByStatus: Record<string, number>;
  weeklyTrend: { week: string; premiums: number; claims: number }[];
}

interface LiveWeatherResponse {
  status: string;
  fetchedAt: string;
  cities: Array<{
    city: string;
    temperature: number;
    rainfall: number;
    aqi: number | null;
    description: string;
  }>;
}

const triggerIcons: Record<string, typeof Thermometer> = {
  extreme_heat: Thermometer,
  heavy_rain: CloudRain,
  flood: CloudRain,
  pollution: Wind,
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({ queryKey: ["/api/dashboard"] });
  const { data: claims } = useQuery<Claim[]>({ queryKey: ["/api/admin/claims"] });
  const { data: events } = useQuery<DisruptionEvent[]>({ queryKey: ["/api/admin/events"] });
  const { data: liveWeather, isLoading: weatherLoading } = useQuery<LiveWeatherResponse>({
    queryKey: ["/api/weather/live"],
    refetchInterval: 120000,
  });

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  const recentClaims = claims?.slice(0, 5) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Hybrid Guardrails Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Verified baselines, disruption events, and measurable impact now drive every payout decision.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{events?.length || 0} disruption events</Badge>
          <Link href="/simulate">
            <Button size="sm" variant="outline">Open Scenario Lab</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalWorkers}</p>
              <p className="text-xs text-muted-foreground">Workers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Shield className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.activePolicies}</p>
              <p className="text-xs text-muted-foreground">Active Policies</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.claimsByStatus?.manual_review || 0}</p>
              <p className="text-xs text-muted-foreground">Manual Review</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <IndianRupee className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">₹{stats?.totalClaimsPaid.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Paid Out</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Premiums vs Paid Claims</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats?.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(value: number) => [`₹${value}`, ""]}
                />
                <Bar dataKey="premiums" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="claims" fill="hsl(200, 80%, 48%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Claim Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats?.claimsByStatus || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm capitalize">{status.replace(/_/g, " ")}</span>
                <Badge variant="outline">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Live Weather</CardTitle>
        </CardHeader>
        <CardContent>
          {weatherLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {[...Array(7)].map((_, index) => <Skeleton key={index} className="h-24 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {liveWeather?.cities?.map((city) => (
                <div key={city.city} className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs font-semibold">{city.city}</p>
                  <p className="text-xs">{city.temperature}°C</p>
                  <p className="text-xs">{city.rainfall}mm/hr</p>
                  {city.aqi !== null && <p className="text-xs">AQI {city.aqi}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Disruption Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {events?.slice(0, 5).map((event) => {
              const Icon = triggerIcons[event.triggerType] || Thermometer;
              return (
                <div key={event.id} className="rounded-lg border border-border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{event.city} · {event.triggerValue}</p>
                      <p className="text-xs text-muted-foreground">{new Date(event.startsAt).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{event.severity}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Claims</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentClaims.map((claim) => (
              <div key={claim.id} className="rounded-lg border border-border p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{claim.triggerType.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {(claim.impactLossRatio * 100).toFixed(0)}% loss · {claim.approvedCompensationHours.toFixed(1)}h compensated
                  </p>
                </div>
                <Badge variant="outline">{claim.status.replace(/_/g, " ")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
