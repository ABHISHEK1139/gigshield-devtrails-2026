import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Workers from "@/pages/workers";
import Policies from "@/pages/policies";
import Claims from "@/pages/claims";
import Alerts from "@/pages/alerts";
import Simulate from "@/pages/simulate";
import { Shield, LayoutDashboard, Users, FileText, AlertTriangle, CloudLightning, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/workers", label: "Workers", icon: Users },
  { path: "/policies", label: "Policies", icon: FileText },
  { path: "/claims", label: "Claims", icon: AlertTriangle },
  { path: "/alerts", label: "Alerts", icon: CloudLightning },
  { path: "/simulate", label: "Simulate", icon: Zap },
];

function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-60 min-h-screen bg-card border-r border-border flex flex-col" data-testid="sidebar">
      <div className="p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <span className="font-semibold text-sm text-foreground tracking-tight" data-testid="text-logo">GigShield</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Parametric Insurance</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path || (path !== "/" && location.startsWith(path));
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
          <p className="text-xs font-medium text-foreground">Food Delivery Focus</p>
          <p className="text-[10px] text-muted-foreground mt-1">Zomato, Swiggy, Zepto partners covered against income loss</p>
        </div>
      </div>
    </aside>
  );
}

function AppRouter() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/workers" component={Workers} />
          <Route path="/policies" component={Policies} />
          <Route path="/claims" component={Claims} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/simulate" component={Simulate} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
