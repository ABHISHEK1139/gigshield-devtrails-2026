import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, AlertTriangle, IndianRupee, TrendingUp, Shield, Thermometer, CloudRain, Wind, Ban, CloudLightning } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import type { WeatherAlert, Claim } from "@shared/schema";

const COLORS = ["hsl(160, 84%, 39%)", "hsl(200, 80%, 48%)", "hsl(43, 74%, 49%)", "hsl(0, 84%, 55%)", "hsl(280, 67%, 55%)", "hsl(30, 87%, 55%)"];

const triggerIcons: Record<string, typeof Thermometer> = {
  extreme_heat: Thermometer,
  heavy_rain: CloudRain,
  flood: CloudRain,
  pollution: Wind,
  curfew: Ban,
  strike: Ban,
};

const triggerLabels: Record<string, string> = {
  extreme_heat: "Extreme Heat",
  heavy_rain: "Heavy Rain",
  flood: "Flood",
  pollution: "Pollution",
  curfew: "Curfew",
  strike: "Strike",
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalWorkers: number;
    activePolicies: number;
    totalClaims: number;
    totalPayouts: number;
    totalPremiumCollected: number;
    totalClaimsPaid: number;
    lossRatio: number;
    avgFraudScore: number;
    claimsByType: Record<string, number>;
    weeklyTrend: { week: string; premiums: number; claims: number }[];
  }>({ queryKey: ["/api/dashboard"] });

  const { data: alerts } = useQuery<WeatherAlert[]>({ queryKey: ["/api/alerts"] });
  const { data: claims } = useQuery<Claim[]>({ queryKey: ["/api/claims"] });

  const recentClaims = claims?.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()).slice(0, 5);

  const pieData = stats?.claimsByType
    ? Object.entries(stats.claimsByType).map(([key, value]) => ({
        name: triggerLabels[key] || key,
        value,
      }))
    : [];

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">GigShield Parametric Insurance Platform</p>
        </div>
        {alerts && alerts.length > 0 && (
          <Badge variant="destructive" className="animate-pulse" data-testid="badge-active-alerts">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {alerts.length} Active Alert{alerts.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-workers">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.totalWorkers}</p>
                <p className="text-xs text-muted-foreground">Registered Workers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-active-policies">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Shield className="w-4 h-4 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.activePolicies}</p>
                <p className="text-xs text-muted-foreground">Active Policies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-claims">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><AlertTriangle className="w-4 h-4 text-amber-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.totalClaims}</p>
                <p className="text-xs text-muted-foreground">Total Claims</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-payouts">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><IndianRupee className="w-4 h-4 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">₹{stats?.totalClaimsPaid?.toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground">Total Paid Out</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Premium Collected</p>
            <p className="text-lg font-bold text-foreground mt-1">₹{stats?.totalPremiumCollected?.toLocaleString("en-IN")}</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary">Weekly billing cycle</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Loss Ratio</p>
            <p className="text-lg font-bold text-foreground mt-1">{((stats?.lossRatio || 0) * 100).toFixed(1)}%</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-muted-foreground">Claims / Premiums</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Fraud Score</p>
            <p className="text-lg font-bold text-foreground mt-1">{stats?.avgFraudScore?.toFixed(1)}/100</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-muted-foreground">AI-powered detection</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Weekly Premiums vs Claims</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats?.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`₹${value}`, ""]}
                />
                <Bar dataKey="premiums" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} name="Premiums" />
                <Bar dataKey="claims" fill="hsl(200, 80%, 48%)" radius={[4, 4, 0, 0]} name="Claims Paid" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Claims by Disruption Type</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts + Recent Claims */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CloudLightning className="w-4 h-4" /> Active Weather Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {alerts?.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No active alerts</p>}
            {alerts?.map((alert) => {
              const Icon = triggerIcons[alert.alertType] || AlertTriangle;
              return (
                <div key={alert.id} className="flex items-center justify-between p-2.5 rounded-lg bg-accent/50 border border-border" data-testid={`alert-${alert.id}`}>
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{triggerLabels[alert.alertType]} — {alert.city}</p>
                      <p className="text-xs text-muted-foreground">{alert.value} (threshold: {alert.threshold})</p>
                    </div>
                  </div>
                  <Badge variant={alert.severity === "extreme" ? "destructive" : "secondary"} className="text-[10px]">
                    {alert.severity}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" /> Recent Claims
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {recentClaims?.map((claim) => (
              <div key={claim.id} className="flex items-center justify-between p-2.5 rounded-lg bg-accent/50 border border-border" data-testid={`claim-${claim.id}`}>
                <div>
                  <p className="text-sm font-medium text-foreground">{triggerLabels[claim.triggerType]} — {claim.triggerValue}</p>
                  <p className="text-xs text-muted-foreground">{claim.incomeLosstHours}h lost · ₹{claim.payoutAmount?.toLocaleString("en-IN")}</p>
                </div>
                <Badge
                  variant={claim.status === "paid" ? "default" : claim.status === "approved" ? "secondary" : claim.status === "rejected" ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  {claim.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
