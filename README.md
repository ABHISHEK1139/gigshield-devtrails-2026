# GigShield

GigShield is a hybrid anti-exploitation income protection platform for gig workers. It is built around one core rule:

```text
verified coverage + verified event + verified measurable impact + verified pre-event work
```

The current codebase is no longer a simple parametric demo. It now includes:

- frozen policy baselines from verified earnings history
- session-based admin and worker auth
- worker invite activation
- deterministic fraud guardrails
- behavioral memory via persisted activity sessions in the app data layer
- worker-scoped portal access
- split web and scheduler entrypoints
- Docker deployment scaffolding

## Current Status

This repository is a working prototype with production-style application logic, but it is not fully production complete yet.

Implemented now:

- hybrid underwriting from verified earnings snapshots
- disruption event ingestion and recompute flow
- deterministic claim evaluation and payout idempotency
- opportunistic fraud blocking for late logins and weak activity proof
- admin review workflow with fraud signals and audit logging
- worker portal with policy, claim, alert, and payout views
- health endpoints and scheduler separation

Not implemented yet:

- real Postgres persistence for the full app state
- true ML model training and offline feature pipelines
- external platform integrations for real order, GPS, and payout telemetry
- email/SMS delivery for invites

## Product Model

GigShield is not pure parametric insurance anymore.

A disruption event alone does not create a payout.

The system only pays when all of these align:

1. The worker has valid coverage.
2. A verified disruption event exists.
3. Measurable impact is visible in verified earnings/activity evidence.
4. The worker was already active before the event and remained active through the event start window.

## Anti-Exploitation Guardrails

The fraud engine blocks or escalates claims using deterministic rules first.

Current hard checks include:

- duplicate worker plus event claims
- waiting-period violations
- payout method risk locks
- short disruptions under the payable threshold
- no material impact in earnings or activity
- late login after the event start
- insufficient pre-event activity
- broken continuity across event start
- weak work-proof signals

Current review signals include:

- shared payout destination
- repeated opportunistic behavior
- isolated zone activity
- low zone pre-commitment
- high claim frequency
- borderline impact
- pre-policy earnings spikes

## Behavioral Memory Layer

GigShield now has a persistent behavioral memory layer inside the application model.

It stores:

- `worker_earnings_snapshots`
- `worker_activity_sessions`
- `disruption_events`
- `claims`
- `fraud_signals`
- `fraud_reviews`
- `worker_payout_methods`
- `payouts`

This is memory, not autonomous model learning.

The system uses stored behavior to make better decisions, but actual learning would require a separate ML training loop. The current approval path remains deterministic and explainable.

## Decision Model

GigShield uses deterministic claim rules, live weather data, and verified activity evidence.

Current decision path:

```text
Data -> Hard Rules -> Hybrid deterministic scoring -> Admin review when needed
```

Admins remain the final decision-makers for manual-review cases. Workers do not decide fraud outcomes.

## Architecture

```text
Worker/Admin UI
      |
      v
Express API
      |
      +-- Session auth + audit log + rate limiting
      +-- Hybrid underwriting engine
      +-- Event/claim recompute workflow
      +-- Fraud signal generation
      |
      +-- In-memory storage layer (current prototype)
      |
      +-- Scheduler process for weather polling
```

Deployment shape:

- `web`: serves API + client
- `scheduler`: runs weather polling and claim recompute

## Key Flows

### Admin

- create worker
- import verified earnings
- import verified activity sessions
- generate worker invite
- preview policy
- create policy
- review claims
- execute payout

### Worker

- activate account from invite
- sign in with phone + password
- view active policy
- view nearby alerts
- view claims and payouts

## Security

Current security features:

- cookie-based sessions
- role-based access control
- audit logging
- per-IP rate limiting
- admin-only operational routes
- worker self-scope enforcement
- production simulation block
- payout idempotency

## Quick Start

Install dependencies:

```bash
npm install
```

Run the web app in development:

```bash
npm run dev
```

Run the dedicated scheduler in development:

```bash
npm run dev:scheduler
```

Default app URL:

```text
http://localhost:5000
```

Scenario lab URL after login:

```text
http://localhost:5000/simulate
```

Default admin login:

```text
username: admin
password: gigshield2026
```

## Run Commands

Main commands:

- `npm run dev` -> run the web app in development
- `npm run dev:scheduler` -> run the scheduler in development
- `npm run check` -> typecheck app, scripts, and tests
- `npm run build` -> build client plus both server entrypoints
- `npm run test` -> run core regression tests
- `npm run test:scenario-lab` -> verify the end-to-end scenario engine
- `npm run verify` -> typecheck + build + core regression tests

Production entrypoints:

- `npm run start:web`
- `npm run start:scheduler`

## Project Structure

Important folders:

- `client/` -> React frontend
- `server/` -> Express API, auth, scheduler, fraud logic
- `shared/` -> shared schema/types
- `script/` -> build tooling
- `tests/` -> regression tests

## Production Build

Build the web bundle and both server entrypoints:

```bash
npm run build
```

Run the web process:

```bash
npm run start:web
```

Run the dedicated scheduler:

```bash
npm run start:scheduler
```

## Docker

Docker files are included for a two-process deployment shape:

- `Dockerfile`
- `docker-compose.yml`

Expected services:

- `web`
- `scheduler`

Note: the current app state is still in-memory, so Docker restarts will reset data until the Postgres storage layer is added.

## Health Endpoints

```text
GET /health/live
GET /health/ready
```

## Main API Areas

Auth:

- `POST /api/auth/login`
- `POST /api/auth/worker/login`
- `POST /api/auth/worker/activate`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Admin:

- `GET /api/admin/workers`
- `POST /api/admin/workers`
- `POST /api/admin/workers/:id/invite`
- `GET /api/admin/workers/:id/earnings-summary`
- `POST /api/admin/workers/:id/earnings-import`
- `GET /api/admin/workers/:id/activity-summary`
- `POST /api/admin/workers/:id/activity-import`
- `POST /api/admin/policies/preview`
- `POST /api/admin/policies`
- `GET /api/admin/events`
- `POST /api/admin/events/recompute`
- `GET /api/admin/claims`
- `POST /api/admin/claims/:id/review`
- `POST /api/admin/payouts`
- `GET /api/admin/audit-log`

Worker:

- `GET /api/worker/me`
- `GET /api/worker/policies`
- `GET /api/worker/claims`
- `GET /api/worker/payouts`
- `GET /api/worker/alerts`

## Tests

Core project verification:

```bash
npm run verify
```

Run only the core regression tests:

```bash
npm run test
```

Run specific core tests:

```bash
npm run test:guardrails
npm run test:auth
npm run test:scenario-lab
```

Notes:

- Core tests live in the `tests/` folder.

## Recommended Next Steps

The highest-value next implementation steps are:

1. Replace the in-memory storage layer with Postgres-backed repositories.
2. Add a `user_behavior_profiles` aggregate model for long-term fraud memory.
3. Build a feature extraction job for ML-ready fraud features.
4. Add an ML fraud model with admin-feedback retraining inputs when real historical data exists.
5. Preserve admin-in-the-loop final decisions for high-risk claims.

## License

MIT
