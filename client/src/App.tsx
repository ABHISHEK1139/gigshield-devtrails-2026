import { Suspense, lazy, useEffect } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CloudLightning,
  FileText,
  LayoutDashboard,
  LogOut,
  Shield,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiRequest, getQueryFn, queryClient } from "./lib/queryClient";
import { cn } from "@/lib/utils";

const Alerts = lazy(() => import("@/pages/alerts"));
const Claims = lazy(() => import("@/pages/claims"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Login = lazy(() => import("@/pages/login"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Policies = lazy(() => import("@/pages/policies"));
const Simulate = lazy(() => import("@/pages/simulate"));
const WorkerPortal = lazy(() => import("@/pages/worker-portal"));
const Workers = lazy(() => import("@/pages/workers"));

interface SessionActor {
  id: string;
  role: "admin" | "superadmin" | "worker";
  displayName: string;
  username?: string;
  workerId?: string;
  phone?: string;
}

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/workers", label: "Workers", icon: Users },
  { path: "/policies", label: "Policies", icon: FileText },
  { path: "/claims", label: "Claims", icon: AlertTriangle },
  { path: "/alerts", label: "Alerts", icon: CloudLightning },
  { path: "/simulate", label: "Scenario Lab", icon: Zap },
];

function Sidebar({ actor, onLogout }: { actor: SessionActor; onLogout: () => void }) {
  const [location] = useLocation();

  return (
    <aside className="flex min-h-screen w-60 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-foreground">GigShield</span>
            <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">Hybrid Anti-Exploitation</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path || (path !== "/" && location.startsWith(path));
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{actor.displayName}</p>
            <p className="text-[10px] text-muted-foreground">{actor.role}</p>
          </div>
          <button
            onClick={onLogout}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function AdminRouter({ actor, onLogout }: { actor: SessionActor; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar actor={actor} onLogout={onLogout} />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading page...</div>}>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/workers" component={Workers} />
              <Route path="/policies" component={Policies} />
              <Route path="/claims" component={Claims} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/simulate" component={Simulate} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function AuthenticatedShell() {
  const { data: session, isLoading, refetch } = useQuery<{ actor: SessionActor } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    const handler = () => {
      void refetch();
      queryClient.clear();
    };

    window.addEventListener("auth-expired", handler);
    return () => window.removeEventListener("auth-expired", handler);
  }, [refetch]);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}

    window.history.replaceState({}, "", "/");
    queryClient.clear();
    void refetch();
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading session...</div>;
  }

  if (!session?.actor) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading access...</div>}>
        <Login onLogin={() => void refetch()} />
      </Suspense>
    );
  }

  if (session.actor.role === "worker") {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading workspace...</div>}>
        <WorkerPortal onLogout={handleLogout} />
      </Suspense>
    );
  }

  return <AdminRouter actor={session.actor} onLogout={handleLogout} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedShell />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
