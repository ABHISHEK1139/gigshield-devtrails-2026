import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, LogIn, Shield, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryClient } from "@/lib/queryClient";

type AuthMode = "admin" | "worker" | "activate";

function resetLocation(path = "/") {
  window.history.replaceState({}, "", path);
}

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<AuthMode>("admin");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("token");
    if (window.location.pathname === "/activate" && inviteToken) {
      setMode("activate");
      setToken(inviteToken);
      setError("");
    }
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload =
        mode === "admin"
          ? { path: "/api/auth/login", body: { username, password } }
          : mode === "worker"
            ? { path: "/api/auth/worker/login", body: { phone, password } }
            : { path: "/api/auth/worker/activate", body: { token, password } };

      const res = await fetch(payload.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload.body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Authentication failed");
      }

      return res.json();
    },
    onSuccess: () => {
      resetLocation("/");
      onLogin();
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message),
  });

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    if (nextMode !== "activate") {
      resetLocation("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">GigShield Access</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Session cookies, worker invite activation, and role-based access are enabled.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Badge variant={mode === "admin" ? "default" : "outline"} className="cursor-pointer" onClick={() => switchMode("admin")}>
              Admin
            </Badge>
            <Badge variant={mode === "worker" ? "default" : "outline"} className="cursor-pointer" onClick={() => switchMode("worker")}>
              Worker
            </Badge>
            <Badge variant={mode === "activate" ? "default" : "outline"} className="cursor-pointer" onClick={() => switchMode("activate")}>
              Activate
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : null}

          {mode === "admin" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setError("");
                  }}
                  placeholder="admin"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </div>
            </>
          ) : null}

          {mode === "worker" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setError("");
                  }}
                  placeholder="Worker phone"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-password">Password</Label>
                <Input
                  id="worker-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </div>
            </>
          ) : null}

          {mode === "activate" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="invite-token">Invite Token</Label>
                <Input
                  id="invite-token"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    setError("");
                  }}
                  placeholder="Paste invite token"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activate-password">Create Password</Label>
                <Input
                  id="activate-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : null}

          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              (mode === "admin" && (!username || !password)) ||
              (mode === "worker" && (!phone || !password)) ||
              (mode === "activate" && (!token || !password))
            }
          >
            {mutation.isPending ? (
              "Working..."
            ) : mode === "activate" ? (
              <>
                <KeyRound className="mr-2 h-4 w-4" />
                Activate Account
              </>
            ) : mode === "worker" ? (
              <>
                <UserRound className="mr-2 h-4 w-4" />
                Worker Sign In
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Admin Sign In
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Admin default: <span className="font-medium">admin / gigshield2026</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
