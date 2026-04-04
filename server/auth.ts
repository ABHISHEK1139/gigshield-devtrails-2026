import type { NextFunction, Request, Response } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { log } from "./logger";

declare global {
  namespace Express {
    interface Request {
      authActor?: SessionActor;
      admin?: SessionActor;
      worker?: SessionActor;
    }
  }
}

type AuthRole = "admin" | "superadmin" | "worker";

interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: "admin" | "superadmin";
  displayName: string;
}

interface WorkerUser {
  id: string;
  workerId: string;
  phone: string;
  passwordHash: string | null;
  salt: string | null;
  role: "worker";
  displayName: string;
  active: boolean;
  inviteToken: string | null;
  inviteExpiresAt: number | null;
}

interface SessionRecord {
  sessionId: string;
  userId: string;
  role: AuthRole;
  expiresAt: number;
}

export interface SessionActor {
  id: string;
  role: AuthRole;
  displayName: string;
  username?: string;
  workerId?: string;
  phone?: string;
}

export interface AuditEntry {
  timestamp: string;
  ip: string;
  admin: string;
  action: string;
  target: string;
  result: "success" | "denied" | "error";
  details?: string;
}

const SESSION_COOKIE_NAME = "gigshield_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const admins = new Map<string, AdminUser>();
const workersByWorkerId = new Map<string, WorkerUser>();
const workersByPhone = new Map<string, string>();
const sessions = new Map<string, SessionRecord>();
const auditLog: AuditEntry[] = [];
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function createPasswordRecord(password: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  return { salt, passwordHash };
}

function verifyPassword(password: string, passwordHash: string, salt: string) {
  const hashedAttempt = hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(hashedAttempt, "hex"), Buffer.from(passwordHash, "hex"));
}

function parseCookies(req: Request) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((entry) => {
      const [key, ...rest] = entry.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    }),
  );
}

function getSessionToken(req: Request) {
  const cookies = parseCookies(req);
  return cookies[SESSION_COOKIE_NAME] || req.headers.authorization?.replace("Bearer ", "") || "";
}

function setSessionCookie(res: Response, sessionId: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
  );
}

function clearSessionCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

function asActor(user: AdminUser | WorkerUser): SessionActor {
  if (user.role === "worker") {
    return {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      workerId: user.workerId,
      phone: user.phone,
    };
  }

  return {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    username: user.username,
  };
}

function getActorFromSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  if (session.role === "worker") {
    const worker = Array.from(workersByWorkerId.values()).find((candidate) => candidate.id === session.userId);
    return worker ? asActor(worker) : null;
  }

  const admin = Array.from(admins.values()).find((candidate) => candidate.id === session.userId);
  return admin ? asActor(admin) : null;
}

function createSession(actor: SessionActor) {
  const sessionId = randomBytes(32).toString("hex");
  sessions.set(sessionId, {
    sessionId,
    userId: actor.id,
    role: actor.role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return sessionId;
}

function destroySession(sessionId: string) {
  if (sessionId) {
    sessions.delete(sessionId);
  }
}

function initDefaultAdmin() {
  const adminPassword = process.env.ADMIN_PASSWORD || "gigshield2026";
  const credentials = createPasswordRecord(adminPassword);
  const admin: AdminUser = {
    id: "admin-001",
    username: "admin",
    passwordHash: credentials.passwordHash,
    salt: credentials.salt,
    role: "superadmin",
    displayName: "Platform Admin",
  };
  admins.set(admin.username, admin);
  log("Default admin initialized (username: admin)", "auth");
}

initDefaultAdmin();

export function provisionWorkerIdentity(input: {
  workerId: string;
  phone: string;
  displayName: string;
}) {
  const existing = workersByWorkerId.get(input.workerId);
  if (existing) {
    workersByPhone.delete(existing.phone);
    existing.phone = input.phone;
    existing.displayName = input.displayName;
    workersByPhone.set(input.phone, existing.workerId);
    return existing;
  }

  const worker: WorkerUser = {
    id: `worker-user-${input.workerId}`,
    workerId: input.workerId,
    phone: input.phone,
    passwordHash: null,
    salt: null,
    role: "worker",
    displayName: input.displayName,
    active: false,
    inviteToken: null,
    inviteExpiresAt: null,
  };
  workersByWorkerId.set(input.workerId, worker);
  workersByPhone.set(input.phone, worker.workerId);
  return worker;
}

export function createWorkerInvite(workerId: string) {
  const worker = workersByWorkerId.get(workerId);
  if (!worker) {
    throw new Error("Worker identity not provisioned");
  }

  worker.inviteToken = randomBytes(20).toString("hex");
  worker.inviteExpiresAt = Date.now() + INVITE_TTL_MS;
  return {
    token: worker.inviteToken,
    expiresAt: new Date(worker.inviteExpiresAt).toISOString(),
    workerId: worker.workerId,
    phone: worker.phone,
  };
}

function getWorkerByInvite(token: string) {
  return Array.from(workersByWorkerId.values()).find(
    (worker) => worker.inviteToken === token && (worker.inviteExpiresAt || 0) > Date.now(),
  );
}

function authenticateAdmin(username: string, password: string) {
  const admin = admins.get(username);
  if (!admin) return null;
  if (!verifyPassword(password, admin.passwordHash, admin.salt)) return null;
  return admin;
}

function authenticateWorker(phone: string, password: string) {
  const workerId = workersByPhone.get(phone);
  if (!workerId) return null;
  const worker = workersByWorkerId.get(workerId);
  if (!worker || !worker.active || !worker.passwordHash || !worker.salt) return null;
  if (!verifyPassword(password, worker.passwordHash, worker.salt)) return null;
  return worker;
}

function activateWorkerByInvite(token: string, password: string) {
  const worker = getWorkerByInvite(token);
  if (!worker) return null;

  const credentials = createPasswordRecord(password);
  worker.passwordHash = credentials.passwordHash;
  worker.salt = credentials.salt;
  worker.active = true;
  worker.inviteToken = null;
  worker.inviteExpiresAt = null;
  return worker;
}

function resetAuthState() {
  workersByWorkerId.clear();
  workersByPhone.clear();
  sessions.clear();
  auditLog.length = 0;
  requestCounts.clear();
  admins.clear();
  initDefaultAdmin();
}

export function rateLimiter(maxRequests = 30, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let entry = requestCounts.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      requestCounts.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      log(`Rate limit exceeded for IP ${ip}`, "security");
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }

    next();
  };
}

export function logAudit(
  req: Request,
  action: string,
  target: string,
  result: "success" | "denied" | "error",
  details?: string,
) {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip || req.socket.remoteAddress || "unknown",
    admin: req.authActor?.displayName || "anonymous",
    action,
    target,
    result,
    details,
  };
  auditLog.push(entry);
  if (auditLog.length > 1000) auditLog.shift();
  log(`AUDIT: ${entry.admin} ${action} ${target} -> ${result}${details ? ` (${details})` : ""}`, "security");
}

export function getAuditLog() {
  return [...auditLog].reverse().slice(0, 100);
}

function requireRole(roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const sessionId = getSessionToken(req);
    if (!sessionId) {
      return res.status(401).json({ error: "Authentication required", code: "NO_SESSION" });
    }

    const actor = getActorFromSession(sessionId);
    if (!actor) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Invalid or expired session", code: "INVALID_SESSION" });
    }

    if (!roles.includes(actor.role)) {
      return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    }

    req.authActor = actor;
    if (actor.role === "worker") req.worker = actor;
    if (actor.role === "admin" || actor.role === "superadmin") req.admin = actor;
    next();
  };
}

export const requireAdmin = requireRole(["admin", "superadmin"]);
export const requireWorker = requireRole(["worker"]);

export function loginHandler(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const admin = authenticateAdmin(username, password);
  if (!admin) {
    logAudit(req, "ADMIN_LOGIN_FAILED", String(username), "denied", "invalid credentials");
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const actor = asActor(admin);
  const sessionId = createSession(actor);
  setSessionCookie(res, sessionId);
  logAudit(req, "ADMIN_LOGIN", actor.username || actor.displayName, "success");
  return res.json({ actor });
}

export function workerLoginHandler(req: Request, res: Response) {
  const { phone, password } = req.body ?? {};
  if (!phone || !password) {
    return res.status(400).json({ error: "Phone and password required" });
  }

  const worker = authenticateWorker(phone, password);
  if (!worker) {
    logAudit(req, "WORKER_LOGIN_FAILED", String(phone), "denied", "invalid credentials");
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const actor = asActor(worker);
  const sessionId = createSession(actor);
  setSessionCookie(res, sessionId);
  logAudit(req, "WORKER_LOGIN", worker.workerId, "success");
  return res.json({ actor });
}

export function workerActivateHandler(req: Request, res: Response) {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    return res.status(400).json({ error: "Invite token and password required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long" });
  }

  const worker = activateWorkerByInvite(String(token), String(password));
  if (!worker) {
    return res.status(400).json({ error: "Invite token is invalid or expired" });
  }

  const actor = asActor(worker);
  const sessionId = createSession(actor);
  setSessionCookie(res, sessionId);
  logAudit(req, "WORKER_ACTIVATE", worker.workerId, "success");
  return res.json({ actor });
}

export function logoutHandler(req: Request, res: Response) {
  const sessionId = getSessionToken(req);
  destroySession(sessionId);
  clearSessionCookie(res);
  logAudit(req, "LOGOUT", req.authActor?.displayName || "unknown", "success");
  return res.json({ message: "Logged out" });
}

export function meHandler(req: Request, res: Response) {
  const sessionId = getSessionToken(req);
  if (!sessionId) {
    return res.status(401).json({ error: "No active session" });
  }

  const actor = getActorFromSession(sessionId);
  if (!actor) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  return res.json({ actor });
}

export const sessionHandler = meHandler;

export const __authTestUtils = {
  provisionWorkerIdentity,
  createWorkerInvite,
  authenticateAdmin,
  authenticateWorker,
  activateWorkerByInvite,
  resetAuthState,
};
