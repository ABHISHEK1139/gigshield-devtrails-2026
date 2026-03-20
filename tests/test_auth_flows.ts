import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import {
  __authTestUtils,
  loginHandler,
  meHandler,
  requireWorker,
  workerActivateHandler,
  workerLoginHandler,
} from "../server/auth";

type MockRequest = Omit<Partial<Request>, "body" | "headers" | "ip" | "socket"> & {
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  ip: string;
  socket: { remoteAddress: string };
};

type MockResponse = Partial<Response> & {
  statusCode: number;
  payload: unknown;
  headers: Record<string, string>;
};

function createRequest(input?: Partial<MockRequest>): MockRequest {
  return {
    body: {},
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...input,
  };
}

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(body: unknown) {
      this.payload = body;
      return this as Response;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this as Response;
    },
  };
}

function getCookieHeader(res: MockResponse) {
  const setCookie = res.headers["Set-Cookie"];
  assert.ok(setCookie, "expected session cookie");
  return String(setCookie).split(";")[0];
}

async function runRequireWorker(req: Request, res: Response) {
  await new Promise<void>((resolve, reject) => {
    const next: NextFunction = (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    requireWorker(req, res, next);
  });
}

async function main() {
  __authTestUtils.resetAuthState();

  const badAdminReq = createRequest({
    body: { username: "admin", password: "wrong-password" },
  });
  const badAdminRes = createResponse();
  loginHandler(badAdminReq as Request, badAdminRes as Response);
  assert.equal(badAdminRes.statusCode, 401, "bad admin credentials should be rejected");

  const adminReq = createRequest({
    body: { username: "admin", password: "gigshield2026" },
  });
  const adminRes = createResponse();
  loginHandler(adminReq as Request, adminRes as Response);
  assert.equal(adminRes.statusCode, 200, "default admin should log in");
  assert.equal((adminRes.payload as { actor: { role: string } }).actor.role, "superadmin");

  const adminSessionReq = createRequest({
    headers: { cookie: getCookieHeader(adminRes) },
  });
  const adminSessionRes = createResponse();
  meHandler(adminSessionReq as Request, adminSessionRes as Response);
  assert.equal((adminSessionRes.payload as { actor: { username: string } }).actor.username, "admin");

  __authTestUtils.provisionWorkerIdentity({
    workerId: "worker-test-001",
    phone: "9000000001",
    displayName: "Test Worker",
  });

  const invite = __authTestUtils.createWorkerInvite("worker-test-001");
  assert.ok(invite.token.length > 10, "invite token should be generated");
  assert.equal(__authTestUtils.authenticateWorker("9000000001", "password123"), null, "worker cannot log in before activation");

  const activateReq = createRequest({
    body: { token: invite.token, password: "password123" },
  });
  const activateRes = createResponse();
  workerActivateHandler(activateReq as Request, activateRes as Response);
  assert.equal(activateRes.statusCode, 200, "worker activation should succeed");
  assert.equal((activateRes.payload as { actor: { role: string } }).actor.role, "worker");

  const activateAgainReq = createRequest({
    body: { token: invite.token, password: "password123" },
  });
  const activateAgainRes = createResponse();
  workerActivateHandler(activateAgainReq as Request, activateAgainRes as Response);
  assert.equal(activateAgainRes.statusCode, 400, "invite token should not be reusable");

  const workerLoginReq = createRequest({
    body: { phone: "9000000001", password: "password123" },
  });
  const workerLoginRes = createResponse();
  workerLoginHandler(workerLoginReq as Request, workerLoginRes as Response);
  assert.equal(workerLoginRes.statusCode, 200, "activated worker should log in");

  const workerSessionReq = createRequest({
    headers: { cookie: getCookieHeader(workerLoginRes) },
  }) as Request;
  const workerSessionRes = createResponse() as Response;
  await runRequireWorker(workerSessionReq, workerSessionRes);
  assert.equal(workerSessionReq.worker?.workerId, "worker-test-001", "worker middleware should attach session actor");

  console.log("Auth flow checks passed.");
}

void main();
