import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as LinkIcon, UploadCloud, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import type { Worker } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const platformColors: Record<string, string> = {
  zomato: "bg-red-500/10 text-red-600",
  swiggy: "bg-orange-500/10 text-orange-600",
  zepto: "bg-blue-500/10 text-blue-600",
};

function isoWeekRange(weeksAgo: number) {
  const now = new Date();
  const date = new Date(now);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 - weeksAgo * 7);
  date.setHours(0, 0, 0, 0);

  const weekStart = new Date(date);
  const weekEnd = new Date(date);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

export default function Workers() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    platform: "zomato",
    city: "Delhi",
    zone: "",
    vehicleType: "bike",
    avgWeeklyEarnings: 4000,
    avgDailyHours: 10,
    experienceMonths: 12,
    payoutAccountRef: "",
  });
  const [earningsRows, setEarningsRows] = useState([
    { grossEarnings: 4200, activeHours: 54 },
    { grossEarnings: 4100, activeHours: 52 },
    { grossEarnings: 4350, activeHours: 55 },
    { grossEarnings: 4050, activeHours: 51 },
  ]);

  const { data: workers, isLoading } = useQuery<Worker[]>({ queryKey: ["/api/admin/workers"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/workers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workers"] });
      toast({ title: "Worker created", description: "Verified history can be imported next." });
      setOpen(false);
      setForm({
        name: "",
        phone: "",
        email: "",
        platform: "zomato",
        city: "Delhi",
        zone: "",
        vehicleType: "bike",
        avgWeeklyEarnings: 4000,
        avgDailyHours: 10,
        experienceMonths: 12,
        payoutAccountRef: "",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const rows = earningsRows.map((row, index) => ({
        ...isoWeekRange(3 - index),
        grossEarnings: Number(row.grossEarnings),
        activeHours: Number(row.activeHours),
        completedOrders: Math.max(20, Math.round(Number(row.grossEarnings) / 70)),
        source: "admin_import",
        verificationStatus: "verified",
        notes: "Imported from admin panel",
      }));
      const res = await apiRequest("POST", `/api/admin/workers/${selectedWorker}/earnings-import`, {
        snapshots: rows,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Verified earnings imported",
        description: "Policy preview now uses the imported baseline.",
      });
      setImportOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const res = await apiRequest("POST", `/api/admin/workers/${workerId}/invite`);
      return res.json() as Promise<{
        token: string;
        expiresAt: string;
        activationUrl: string;
        phone: string;
      }>;
    },
    onSuccess: async (invite) => {
      try {
        await navigator.clipboard.writeText(invite.activationUrl);
        toast({
          title: "Invite created",
          description: `Activation link copied for ${invite.phone}. Expires ${new Date(invite.expiresAt).toLocaleString("en-IN")}.`,
        });
      } catch {
        toast({
          title: "Invite created",
          description: `Share this token with the worker: ${invite.token}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Invite failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">
            Workers
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create workers, assign payout rails, import verified earnings history, and issue worker invites.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-import-earnings">
                <UploadCloud className="mr-1.5 h-4 w-4" />
                Import Earnings
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Import Verified Earnings</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <Select value={selectedWorker} onValueChange={setSelectedWorker}>
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

                <div className="grid grid-cols-2 gap-3">
                  {earningsRows.map((row, index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-xs font-medium text-muted-foreground">Week {index + 1}</p>
                      <Input
                        type="number"
                        value={row.grossEarnings}
                        onChange={(event) => {
                          const next = [...earningsRows];
                          next[index] = { ...next[index], grossEarnings: Number(event.target.value) };
                          setEarningsRows(next);
                        }}
                        placeholder="Gross earnings"
                      />
                      <Input
                        type="number"
                        value={row.activeHours}
                        onChange={(event) => {
                          const next = [...earningsRows];
                          next[index] = { ...next[index], activeHours: Number(event.target.value) };
                          setEarningsRows(next);
                        }}
                        placeholder="Active hours"
                      />
                    </div>
                  ))}
                </div>

                <Button className="w-full" onClick={() => importMutation.mutate()} disabled={!selectedWorker || importMutation.isPending}>
                  {importMutation.isPending ? "Importing..." : "Import Verified History"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-worker">
                <UserPlus className="mr-1.5 h-4 w-4" />
                Add Worker
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Worker</DialogTitle>
              </DialogHeader>

              <div className="mt-2 space-y-3">
                <Input placeholder="Full name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                <Input placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                <Input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                <Input
                  placeholder="Payout account ref (UPI or bank alias)"
                  value={form.payoutAccountRef}
                  onChange={(event) => setForm({ ...form, payoutAccountRef: event.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Select value={form.platform} onValueChange={(value) => setForm({ ...form, platform: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zomato">Zomato</SelectItem>
                      <SelectItem value="swiggy">Swiggy</SelectItem>
                      <SelectItem value="zepto">Zepto</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={form.city} onValueChange={(value) => setForm({ ...form, city: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Delhi", "Mumbai", "Bangalore", "Chennai", "Hyderabad", "Kolkata", "Pune"].map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Input placeholder="Zone" value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} />

                <Select value={form.vehicleType} onValueChange={(value) => setForm({ ...form, vehicleType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bike">Bike</SelectItem>
                    <SelectItem value="bicycle">Bicycle</SelectItem>
                    <SelectItem value="ev">EV</SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-3 gap-3">
                  <Input
                    type="number"
                    value={form.avgWeeklyEarnings}
                    onChange={(event) => setForm({ ...form, avgWeeklyEarnings: Number(event.target.value) })}
                  />
                  <Input
                    type="number"
                    value={form.avgDailyHours}
                    onChange={(event) => setForm({ ...form, avgDailyHours: Number(event.target.value) })}
                  />
                  <Input
                    type="number"
                    value={form.experienceMonths}
                    onChange={(event) => setForm({ ...form, experienceMonths: Number(event.target.value) })}
                  />
                </div>

                <Button className="w-full" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Worker"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Worker</TableHead>
                <TableHead className="text-xs">Platform</TableHead>
                <TableHead className="text-xs">City / Zone</TableHead>
                <TableHead className="text-xs">Vehicle</TableHead>
                <TableHead className="text-xs">Reference Weekly</TableHead>
                <TableHead className="text-xs">Daily Hours</TableHead>
                <TableHead className="text-xs">Risk</TableHead>
                <TableHead className="text-xs text-right">Invite</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Loading workers...
                  </TableCell>
                </TableRow>
              ) : null}

              {workers?.map((worker) => (
                <TableRow key={worker.id}>
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{worker.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`border-0 text-[10px] capitalize ${platformColors[worker.platform] || ""}`}>
                      {worker.platform}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {worker.city} · {worker.zone}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{worker.vehicleType}</TableCell>
                  <TableCell className="text-sm">Rs {worker.avgWeeklyEarnings.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-sm">{worker.avgDailyHours}h</TableCell>
                  <TableCell className="text-sm">{worker.riskScore ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => inviteMutation.mutate(worker.id)}
                      disabled={inviteMutation.isPending}
                    >
                      <LinkIcon className="mr-1.5 h-4 w-4" />
                      Invite
                    </Button>
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
