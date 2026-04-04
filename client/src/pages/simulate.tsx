import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock3,
  CloudRain,
  LockKeyhole,
  LocateFixed,
  MapPin,
  Navigation,
  PlayCircle,
  ShieldAlert,
  Thermometer,
} from "lucide-react";
import type { Claim, Worker } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ScenarioKey =
  | "legit_auto_approve"
  | "blocked_no_impact"
  | "blocked_opportunistic_login"
  | "blocked_activity_continuity"
  | "manual_review_payout_lock";
type Severity = "warning" | "severe" | "extreme";

type ScenarioPreset = {
  key: ScenarioKey;
  label: string;
  description: string;
  expectedStatus: string;
  workerName: string;
  city: string;
  zone: string;
  alertType: string;
  severity: Severity;
  value: string;
  threshold: string;
  icon: typeof Thermometer;
};

type ScenarioRunResponse = {
  scenarioKey: ScenarioKey | null;
  affectedWorkers: number;
  workers: Array<{ id: string; name: string; city: string; zone: string }>;
  event: {
    id: string;
    triggerType: string;
    city: string;
    zone: string;
    severity: string;
    triggerValue: string;
    threshold: string;
    startsAt: string;
  };
  claimsCreated: number;
  claims: Claim[];
};

type RunRequest = {
  city: string;
  zone: string;
  alertType: string;
  severity: Severity;
  value: string;
  threshold: string;
  workerId?: string;
  scenarioKey?: ScenarioKey;
  runLabel: string;
  expectedStatus?: string;
  description?: string;
};

type LocationWeatherResponse = {
  requestedLocation: {
    lat: number;
    lon: number;
  };
  nearestCity: {
    city: string;
    zone: string;
    lat: number;
    lon: number;
    distanceKm: number;
  } | null;
  weather: {
    city: string;
    temperature: number;
    humidity: number;
    rainfall: number;
    windSpeed: number;
    description: string;
    aqi: number | null;
    fetchedAt: string;
  };
  suggestedTriggers: Array<{
    type: string;
    label: string;
    severity: Severity;
    value: string;
    threshold: string;
    city: string;
    zone: string;
  }>;
};

const presets: ScenarioPreset[] = [
  {
    key: "legit_auto_approve",
    label: "Legit payout",
    description: "Strong pre-event activity plus heavy impact should auto-approve.",
    expectedStatus: "approved",
    workerName: "Rajesh Kumar",
    city: "Delhi",
    zone: "South Delhi",
    alertType: "extreme_heat",
    severity: "extreme",
    value: "47 C",
    threshold: "42 C",
    icon: CheckCircle2,
  },
  {
    key: "blocked_no_impact",
    label: "No-impact block",
    description: "The event is real, but the earnings drop stays too small to pay.",
    expectedStatus: "blocked_no_impact",
    workerName: "Priya Singh",
    city: "Bangalore",
    zone: "Koramangala",
    alertType: "heavy_rain",
    severity: "severe",
    value: "82mm/hr",
    threshold: "65mm/hr",
    icon: CloudRain,
  },
  {
    key: "blocked_opportunistic_login",
    label: "Late-login fraud block",
    description: "The worker logs in after the event begins, so the claim should hard-block.",
    expectedStatus: "blocked_opportunistic_login",
    workerName: "Amit Sharma",
    city: "Mumbai",
    zone: "Andheri",
    alertType: "heavy_rain",
    severity: "severe",
    value: "95mm/hr",
    threshold: "65mm/hr",
    icon: ShieldAlert,
  },
  {
    key: "blocked_activity_continuity",
    label: "Continuity break",
    description: "Pre-event activity exists, but continuity breaks before the event start window.",
    expectedStatus: "blocked_activity_continuity",
    workerName: "Priya Singh",
    city: "Bangalore",
    zone: "Koramangala",
    alertType: "extreme_heat",
    severity: "severe",
    value: "44 C",
    threshold: "42 C",
    icon: Ban,
  },
  {
    key: "manual_review_payout_lock",
    label: "Payout lock review",
    description: "Impact looks valid, but the payout rail is inside a review cooldown.",
    expectedStatus: "manual_review",
    workerName: "Rajesh Kumar",
    city: "Delhi",
    zone: "South Delhi",
    alertType: "extreme_heat",
    severity: "severe",
    value: "44 C",
    threshold: "42 C",
    icon: LockKeyhole,
  },
];

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

const triggerLabels: Record<string, string> = {
  extreme_heat: "Extreme heat",
  heavy_rain: "Heavy rain",
  flood: "Flood",
  pollution: "Air pollution",
  curfew: "Curfew",
  strike: "Strike",
};

const scenarioLabels: Record<ScenarioKey, string> = {
  legit_auto_approve: "Legit payout",
  blocked_no_impact: "No-impact block",
  blocked_opportunistic_login: "Late-login fraud block",
  blocked_activity_continuity: "Continuity break",
  manual_review_payout_lock: "Payout lock review",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function defaultForm() {
  return {
    workerId: "",
    scenarioKey: "legit_auto_approve" as ScenarioKey,
    city: "Delhi",
    zone: "South Delhi",
    alertType: "extreme_heat",
    severity: "extreme" as Severity,
    value: "47 C",
    threshold: "42 C",
  };
}

export default function Simulate() {
  const { toast } = useToast();
  const [form, setForm] = useState(defaultForm());
  const [gpsWeather, setGpsWeather] = useState<LocationWeatherResponse | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{
    response: ScenarioRunResponse;
    runLabel: string;
    expectedStatus?: string;
    description?: string;
  } | null>(null);

  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/admin/workers"] });
  const { data: claims } = useQuery<Claim[]>({ queryKey: ["/api/admin/claims"] });

  const gpsMutation = useMutation({
    mutationFn: async (coords: { lat: number; lon: number }) => {
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lon: String(coords.lon),
      });
      const res = await apiRequest("GET", `/api/weather/location?${params.toString()}`);
      return (await res.json()) as LocationWeatherResponse;
    },
    onSuccess: (data) => {
      setGpsWeather(data);
      setGpsError(null);
      toast({
        title: "Live GPS weather loaded",
        description: `${data.weather.description} for ${data.weather.city} at ${new Date(data.weather.fetchedAt).toLocaleTimeString("en-IN")}.`,
      });
    },
    onError: (error: Error) => {
      setGpsError(error.message);
      toast({ title: "GPS weather lookup failed", description: error.message, variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async ({ runLabel, expectedStatus, description, ...payload }: RunRequest) => {
      const res = await apiRequest("POST", "/api/simulate-trigger", payload);
      return { response: (await res.json()) as ScenarioRunResponse, runLabel, expectedStatus, description };
    },
    onSuccess: (data) => {
      setLastRun(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Scenario executed", description: `${data.response.claimsCreated} claim decision(s) created.` });
    },
    onError: (error: Error) => {
      toast({ title: "Scenario failed", description: error.message, variant: "destructive" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (payload: { claimId: string; action: "approve" | "reject" | "manual_review" }) => {
      const res = await apiRequest("POST", `/api/admin/claims/${payload.claimId}/review`, { action: payload.action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
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
      toast({ title: "Payout completed", description: "The claim moved through the full payout flow." });
    },
    onError: (error: Error) => {
      toast({ title: "Payout failed", description: error.message, variant: "destructive" });
    },
  });

  const liveClaims =
    lastRun?.response.claims.map((claim) => claims?.find((item) => item.id === claim.id) ?? claim) ?? [];
  const primaryClaim = liveClaims[0] ?? null;
  const expectationMatched =
    lastRun?.expectedStatus && primaryClaim ? primaryClaim.status === lastRun.expectedStatus : undefined;

  const requestGpsWeather = () => {
    if (!navigator.geolocation) {
      const message = "Browser geolocation is not available in this session.";
      setGpsError(message);
      toast({ title: "GPS unavailable", description: message, variant: "destructive" });
      return;
    }

    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        gpsMutation.mutate({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        setGpsError(error.message);
        toast({ title: "GPS permission failed", description: error.message, variant: "destructive" });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  };

  const applyLiveTrigger = (trigger: LocationWeatherResponse["suggestedTriggers"][number]) => {
    const matchingWorker = workers?.find((worker) => worker.city === trigger.city);
    setForm((current) => ({
      ...current,
      workerId: matchingWorker?.id ?? "",
      city: trigger.city,
      zone: matchingWorker?.zone ?? trigger.zone,
      alertType: trigger.type,
      severity: trigger.severity,
      value: trigger.value,
      threshold: trigger.threshold,
    }));
    toast({
      title: "Builder updated",
      description: `Loaded ${trigger.label.toLowerCase()} from live GPS weather.`,
    });
  };

  const runLiveTrigger = (trigger: LocationWeatherResponse["suggestedTriggers"][number]) => {
    const matchingWorker = workers?.find((worker) => worker.city === trigger.city);
    if (!matchingWorker) {
      toast({
        title: "No seeded worker in this city",
        description: `Create or import a worker in ${trigger.city}, or load this trigger into the custom builder first.`,
        variant: "destructive",
      });
      return;
    }

    runMutation.mutate({
      workerId: matchingWorker.id,
      scenarioKey: form.scenarioKey,
      city: matchingWorker.city,
      zone: matchingWorker.zone,
      alertType: trigger.type,
      severity: trigger.severity,
      value: trigger.value,
      threshold: trigger.threshold,
      runLabel: `Live GPS weather / ${trigger.label} / ${matchingWorker.name}`,
      description:
        `Live weather came from browser GPS and Open-Meteo. Claim evidence uses the ${scenarioLabels[form.scenarioKey].toLowerCase()} profile.`,
    });
  };

  const runPreset = (preset: ScenarioPreset) => {
    const worker = workers?.find((item) => item.name === preset.workerName);
    if (!worker) {
      toast({ title: "Worker missing", description: `Could not find ${preset.workerName}.`, variant: "destructive" });
      return;
    }

    setForm({
      workerId: worker.id,
      scenarioKey: preset.key,
      city: worker.city,
      zone: worker.zone,
      alertType: preset.alertType,
      severity: preset.severity,
      value: preset.value,
      threshold: preset.threshold,
    });

    runMutation.mutate({
      workerId: worker.id,
      scenarioKey: preset.key,
      city: worker.city,
      zone: worker.zone,
      alertType: preset.alertType,
      severity: preset.severity,
      value: preset.value,
      threshold: preset.threshold,
      runLabel: `${preset.label} / ${worker.name}`,
      expectedStatus: preset.expectedStatus,
      description: preset.description,
    });
  };

  const runCustom = () => {
    const selectedWorker = workers?.find((item) => item.id === form.workerId);
    runMutation.mutate({
      workerId: form.workerId || undefined,
      scenarioKey: form.scenarioKey,
      city: selectedWorker?.city ?? form.city,
      zone: selectedWorker?.zone ?? form.zone,
      alertType: form.alertType,
      severity: form.severity,
      value: form.value,
      threshold: form.threshold,
      runLabel: form.workerId
        ? `${scenarioLabels[form.scenarioKey]} / ${selectedWorker?.name || "Selected worker"}`
        : `${scenarioLabels[form.scenarioKey]} / city-wide`,
      expectedStatus: presets.find((preset) => preset.key === form.scenarioKey)?.expectedStatus,
      description: `Custom run using the ${scenarioLabels[form.scenarioKey].toLowerCase()} behavior profile.`,
    });
  };

  const approveAndPay = async (claimId: string) => {
    try {
      await reviewMutation.mutateAsync({ claimId, action: "approve" });
      await payoutMutation.mutateAsync(claimId);
    } catch {}
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">
            End-to-End Scenario Lab
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Run full claim journeys from event trigger to review and payout using deterministic fraud scenarios.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline">{presets.length} templates</Badge>
          <Badge variant="outline">{lastRun?.response.claimsCreated ?? 0} latest decisions</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Latest run</p><p className="mt-2 text-base font-semibold">{lastRun?.runLabel || "Not started"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Expected check</p><p className="mt-2 text-base font-semibold">{expectationMatched === undefined ? "Pending" : expectationMatched ? "Matched" : "Mismatch"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p><p className="mt-2 text-base font-semibold">{primaryClaim ? formatLabel(primaryClaim.status) : "No claim"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Next action</p><p className="mt-2 text-base font-semibold">{primaryClaim?.status === "manual_review" ? "Approve or reject" : primaryClaim?.status === "approved" ? "Pay claim" : primaryClaim?.status === "paid" ? "Flow complete" : "Run scenario"}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Scenario templates</TabsTrigger>
          <TabsTrigger value="custom">Custom builder</TabsTrigger>
          <TabsTrigger value="gps">Live API + GPS</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {presets.map((preset) => {
              const worker = workers?.find((item) => item.name === preset.workerName);
              const Icon = preset.icon;
              return (
                <Card key={`${preset.key}-${preset.workerName}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{preset.label}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">{preset.workerName} / {preset.city}</p>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{preset.description}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{triggerLabels[preset.alertType] || preset.alertType}</Badge>
                      <Badge variant="outline">{preset.severity}</Badge>
                      <Badge variant="outline">Expect {formatLabel(preset.expectedStatus)}</Badge>
                    </div>
                    <div className="rounded-lg border border-border bg-accent/30 p-3 text-xs text-muted-foreground">
                      {worker ? `Worker ready: ${worker.name} in ${worker.zone}` : "Worker missing from current data."}
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => runPreset(preset)} disabled={!worker || runMutation.isPending}>
                        <PlayCircle className="mr-1.5 h-4 w-4" />
                        {runMutation.isPending ? "Running..." : "Run end to end"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!worker) return;
                          setForm({
                            workerId: worker.id,
                            scenarioKey: preset.key,
                            city: worker.city,
                            zone: worker.zone,
                            alertType: preset.alertType,
                            severity: preset.severity,
                            value: preset.value,
                            threshold: preset.threshold,
                          });
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Custom Scenario Builder</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Select
                  value={form.workerId || "all"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setForm({ ...form, workerId: "" });
                      return;
                    }
                    const worker = workers?.find((item) => item.id === value);
                    setForm({ ...form, workerId: value, city: worker?.city ?? form.city, zone: worker?.zone ?? form.zone });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Target worker" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All workers in city</SelectItem>
                    {workers?.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.name} / {worker.city}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={form.scenarioKey} onValueChange={(value) => setForm({ ...form, scenarioKey: value as ScenarioKey })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(scenarioLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={form.alertType} onValueChange={(value) => setForm({ ...form, alertType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extreme_heat">Extreme heat</SelectItem>
                    <SelectItem value="heavy_rain">Heavy rain</SelectItem>
                    <SelectItem value="flood">Flood</SelectItem>
                    <SelectItem value="pollution">Air pollution</SelectItem>
                    <SelectItem value="curfew">Curfew</SelectItem>
                    <SelectItem value="strike">Strike</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={form.severity} onValueChange={(value) => setForm({ ...form, severity: value as Severity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="severe">Severe</SelectItem>
                    <SelectItem value="extreme">Extreme</SelectItem>
                  </SelectContent>
                </Select>

                <Input placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} disabled={Boolean(form.workerId)} />
                <Input placeholder="Zone" value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} disabled={Boolean(form.workerId)} />
                <Input placeholder="Observed value" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
                <Input placeholder="Threshold" value={form.threshold} onChange={(event) => setForm({ ...form, threshold: event.target.value })} />
              </div>

              <div className="rounded-lg border border-border bg-accent/30 p-3 text-xs text-muted-foreground">
                Behavior profile: {scenarioLabels[form.scenarioKey]}. The lab keeps the real claim engine and swaps only the synthetic evidence pattern.
              </div>

              <Button onClick={runCustom} disabled={runMutation.isPending}>
                {runMutation.isPending ? "Running..." : "Run custom scenario"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gps" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live Weather Probe</CardTitle>
              <p className="text-sm text-muted-foreground">
                Use browser GPS plus the live Open-Meteo API to pull real weather, then push the detected trigger into the end-to-end claim flow. No LLM is used in this lookup.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={requestGpsWeather} disabled={gpsMutation.isPending}>
                  <LocateFixed className="mr-1.5 h-4 w-4" />
                  {gpsMutation.isPending ? "Checking live weather..." : "Use my current GPS"}
                </Button>
                {gpsWeather?.suggestedTriggers[0] ? (
                  <Button
                    variant="outline"
                    onClick={() => applyLiveTrigger(gpsWeather.suggestedTriggers[0])}
                  >
                    Load strongest trigger into builder
                  </Button>
                ) : null}
              </div>

              <div className="rounded-lg border border-border bg-accent/30 p-3 text-xs text-muted-foreground">
                Live weather is fetched from your exact latitude and longitude. For scenario execution, GigShield maps that location to the nearest monitored city so the existing worker and policy records can be used for end-to-end testing.
              </div>

              {gpsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {gpsError}
                </div>
              ) : null}

              {gpsWeather ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">GPS</p>
                        <p className="mt-2 text-sm font-semibold">
                          {gpsWeather.requestedLocation.lat.toFixed(4)}, {gpsWeather.requestedLocation.lon.toFixed(4)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Nearest monitored city</p>
                        <p className="mt-2 text-sm font-semibold">
                          {gpsWeather.nearestCity ? gpsWeather.nearestCity.city : "Not matched"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {gpsWeather.nearestCity
                            ? `${gpsWeather.nearestCity.zone} / ${gpsWeather.nearestCity.distanceKm.toFixed(1)} km away`
                            : "Scenario mapping unavailable"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Live conditions</p>
                        <p className="mt-2 text-sm font-semibold">
                          {gpsWeather.weather.temperature} C / {gpsWeather.weather.rainfall} mm/hr
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{gpsWeather.weather.description}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Air + wind</p>
                        <p className="mt-2 text-sm font-semibold">
                          AQI {gpsWeather.weather.aqi ?? "n/a"} / {gpsWeather.weather.windSpeed} km/h
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Humidity {gpsWeather.weather.humidity}% / fetched {new Date(gpsWeather.weather.fetchedAt).toLocaleTimeString("en-IN")}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">Suggested live triggers</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        These are derived directly from API weather thresholds. Use one to seed an end-to-end scenario with the selected fraud profile.
                      </p>
                    </div>

                    {gpsWeather.suggestedTriggers.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                        No payout trigger is active for the current GPS weather right now.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {gpsWeather.suggestedTriggers.map((trigger) => (
                          <div
                            key={`${trigger.type}-${trigger.severity}-${trigger.value}`}
                            className="rounded-xl border border-border bg-background p-4 shadow-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{trigger.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {trigger.city} / {trigger.zone}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline">{trigger.severity}</Badge>
                                <Badge variant="outline">{trigger.value}</Badge>
                                <Badge variant="outline">Threshold {trigger.threshold}</Badge>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => applyLiveTrigger(trigger)}>
                                <MapPin className="mr-1.5 h-3.5 w-3.5" />
                                Load into builder
                              </Button>
                              <Button size="sm" onClick={() => runLiveTrigger(trigger)} disabled={runMutation.isPending}>
                                <Navigation className="mr-1.5 h-3.5 w-3.5" />
                                Run end to end
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Latest Run Result</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{lastRun?.runLabel || "Run a scenario to inspect the full flow."}</p>
            </div>
            {lastRun?.expectedStatus ? <Badge variant={expectationMatched ? "secondary" : "outline"}>{expectationMatched ? "Outcome matched expectation" : `Expected ${formatLabel(lastRun.expectedStatus)}`}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!lastRun ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <PlayCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm font-medium">No scenario run yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Start with a template to test the entire claim journey in one click.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">1. Event created</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline">2. Evidence seeded</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline">3. Claim evaluated</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline">4. Review or payout</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge>5. End to end</Badge>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-accent/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Event</p>
                    <p className="mt-2 text-sm font-semibold">{triggerLabels[lastRun.response.event.triggerType] || lastRun.response.event.triggerType}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{lastRun.response.event.city} / {lastRun.response.event.zone}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{lastRun.response.event.triggerValue} vs {lastRun.response.event.threshold}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(lastRun.response.event.startsAt).toLocaleString("en-IN")}</p>
                  </div>

                  <div className="rounded-lg border border-border bg-accent/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Target workers</p>
                    <div className="mt-2 space-y-2">
                      {lastRun.response.workers.map((worker) => (
                        <div key={worker.id} className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs">
                          <p className="font-medium text-foreground">{worker.name}</p>
                          <p className="text-muted-foreground">{worker.city} / {worker.zone}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-accent/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Expectation</p>
                    <p className="mt-2 text-sm font-semibold">{lastRun.expectedStatus ? formatLabel(lastRun.expectedStatus) : "None"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{lastRun.description}</p>
                  </div>
                </div>

                <div className="space-y-3 lg:col-span-2">
                  {liveClaims.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                      <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                      <p className="text-sm font-medium">No claim was created</p>
                      <p className="mt-1 text-xs text-muted-foreground">Check coverage, city matching, or scenario inputs.</p>
                    </div>
                  ) : null}

                  {liveClaims.map((claim) => (
                    <div key={claim.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{lastRun.response.workers.find((worker) => worker.id === claim.workerId)?.name || "Worker"} / {triggerLabels[claim.triggerType] || claim.triggerType}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{claim.eventImpactHours.toFixed(1)}h event / {claim.approvedCompensationHours.toFixed(1)}h approved / {(claim.impactLossRatio * 100).toFixed(0)}% impact</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-primary">Rs {claim.payoutAmount.toLocaleString("en-IN")}</span>
                          <Badge variant={statusStyles[claim.status] || "outline"}>{formatLabel(claim.status)}</Badge>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border border-border/80 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pre-event</p><p className="mt-1 text-sm font-semibold">{claim.preEventActiveMinutes.toFixed(0)} min</p></div>
                        <div className="rounded-lg border border-border/80 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">During event</p><p className="mt-1 text-sm font-semibold">{claim.duringEventActiveMinutes.toFixed(0)} min</p></div>
                        <div className="rounded-lg border border-border/80 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Continuity</p><p className="mt-1 text-sm font-semibold">{claim.continuityScore.toFixed(0)} / 100</p></div>
                        <div className="rounded-lg border border-border/80 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Work proof</p><p className="mt-1 text-sm font-semibold">{claim.workProofScore.toFixed(0)} / 100</p></div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">Earnings drop {(claim.measuredEarningsDrop * 100).toFixed(0)}%</Badge>
                        <Badge variant="outline">Activity drop {(claim.measuredActiveHoursDrop * 100).toFixed(0)}%</Badge>
                        <Badge variant="outline">Fraud score {claim.fraudScore ?? 0}</Badge>
                        {claim.blockReason ? <Badge variant="destructive">Block {formatLabel(claim.blockReason)}</Badge> : null}
                      </div>

                      {claim.decisionExplanation ? <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{claim.decisionExplanation}</div> : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {claim.status === "manual_review" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate({ claimId: claim.id, action: "reject" })} disabled={reviewMutation.isPending || payoutMutation.isPending}>Reject</Button>
                            <Button size="sm" onClick={() => reviewMutation.mutate({ claimId: claim.id, action: "approve" })} disabled={reviewMutation.isPending || payoutMutation.isPending || !!claim.blockReason}>Approve</Button>
                            <Button size="sm" variant="secondary" onClick={() => void approveAndPay(claim.id)} disabled={reviewMutation.isPending || payoutMutation.isPending || !!claim.blockReason}>Approve and pay</Button>
                          </>
                        ) : null}
                        {claim.status === "approved" ? <Button size="sm" variant="secondary" onClick={() => payoutMutation.mutate(claim.id)} disabled={payoutMutation.isPending}>Pay claim</Button> : null}
                        {claim.status === "paid" ? <div className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Payout completed</div> : null}
                        {claim.status.startsWith("blocked_") ? <div className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700"><Clock3 className="h-3.5 w-3.5" />Hard block confirmed</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
