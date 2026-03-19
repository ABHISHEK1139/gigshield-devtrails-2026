import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Bike, Zap, Users } from "lucide-react";
import { useState } from "react";
import type { Worker } from "@shared/schema";

const platformColors: Record<string, string> = {
  zomato: "bg-red-500/10 text-red-600",
  swiggy: "bg-orange-500/10 text-orange-600",
  zepto: "bg-purple-500/10 text-purple-600",
};

function RiskBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline" className="text-[10px]">N/A</Badge>;
  if (score < 30) return <Badge className="bg-green-500/10 text-green-600 text-[10px] border-0">Low ({score})</Badge>;
  if (score < 60) return <Badge className="bg-amber-500/10 text-amber-600 text-[10px] border-0">Medium ({score})</Badge>;
  return <Badge className="bg-red-500/10 text-red-600 text-[10px] border-0">High ({score})</Badge>;
}

export default function Workers() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", platform: "zomato", city: "Delhi",
    zone: "", vehicleType: "bike", avgWeeklyEarnings: 4000, avgDailyHours: 10, experienceMonths: 12,
  });

  const { data: workers, isLoading } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/workers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
      toast({ title: "Worker registered", description: "Risk score calculated by AI" });
      setOpen(false);
      setForm({ name: "", phone: "", email: "", platform: "zomato", city: "Delhi", zone: "", vehicleType: "bike", avgWeeklyEarnings: 4000, avgDailyHours: 10, experienceMonths: 12 });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-page-title">Delivery Partners</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Onboarded gig workers with AI risk profiles</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-worker"><UserPlus className="w-4 h-4 mr-1.5" />Register Worker</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-base">Register New Worker</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <Input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-name" />
              <Input placeholder="Phone (10 digits)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-phone" />
              <Input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger data-testid="select-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zomato">Zomato</SelectItem>
                    <SelectItem value="swiggy">Swiggy</SelectItem>
                    <SelectItem value="zepto">Zepto</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })}>
                  <SelectTrigger data-testid="select-city"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Delhi">Delhi</SelectItem>
                    <SelectItem value="Mumbai">Mumbai</SelectItem>
                    <SelectItem value="Bangalore">Bangalore</SelectItem>
                    <SelectItem value="Chennai">Chennai</SelectItem>
                    <SelectItem value="Hyderabad">Hyderabad</SelectItem>
                    <SelectItem value="Kolkata">Kolkata</SelectItem>
                    <SelectItem value="Pune">Pune</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="Zone (e.g. South Delhi)" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} data-testid="input-zone" />
              <Select value={form.vehicleType} onValueChange={(v) => setForm({ ...form, vehicleType: v })}>
                <SelectTrigger data-testid="select-vehicle"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bike">Bike</SelectItem>
                  <SelectItem value="bicycle">Bicycle</SelectItem>
                  <SelectItem value="ev">EV</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Weekly ₹</label>
                  <Input type="number" value={form.avgWeeklyEarnings} onChange={(e) => setForm({ ...form, avgWeeklyEarnings: +e.target.value })} data-testid="input-earnings" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Daily Hrs</label>
                  <Input type="number" value={form.avgDailyHours} onChange={(e) => setForm({ ...form, avgDailyHours: +e.target.value })} data-testid="input-hours" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Exp (months)</label>
                  <Input type="number" value={form.experienceMonths} onChange={(e) => setForm({ ...form, experienceMonths: +e.target.value })} data-testid="input-experience" />
                </div>
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} data-testid="button-submit-worker">
                {createMutation.isPending ? "Registering..." : "Register & Calculate Risk"}
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
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Platform</TableHead>
                <TableHead className="text-xs">City / Zone</TableHead>
                <TableHead className="text-xs">Vehicle</TableHead>
                <TableHead className="text-xs">Weekly Earnings</TableHead>
                <TableHead className="text-xs">Daily Hours</TableHead>
                <TableHead className="text-xs">Experience</TableHead>
                <TableHead className="text-xs">Risk Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading...</TableCell></TableRow>
              )}
              {workers?.map((w) => (
                <TableRow key={w.id} data-testid={`row-worker-${w.id}`}>
                  <TableCell className="text-sm font-medium">{w.name}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] border-0 capitalize ${platformColors[w.platform] || ""}`}>{w.platform}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{w.city} · {w.zone}</TableCell>
                  <TableCell className="text-sm capitalize">{w.vehicleType === "ev" ? "EV" : w.vehicleType}</TableCell>
                  <TableCell className="text-sm">₹{w.avgWeeklyEarnings.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-sm">{w.avgDailyHours}h</TableCell>
                  <TableCell className="text-sm">{w.experienceMonths}m</TableCell>
                  <TableCell><RiskBadge score={w.riskScore} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
