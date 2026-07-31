# VeriLot

VeriLot is a product traceability and verification platform for managing serialized products from batch creation through custody history, anomaly response, and recalls. It combines a security-oriented Express API, a responsive React operations interface, PostgreSQL persistence, and shared TypeScript contracts.

Built by DevRumiTech, the project presents a production-style full-stack portfolio case: role-aware workflows, organization-scoped data, append-only evidence, public and partner verification channels, API documentation, and deterministic automated coverage from repositories through the browser.

## Monorepo layout

- `apps/api` — Express 5 API, Prisma schema and migrations, PostgreSQL repositories, OpenAPI document, seed data, and Vitest suites.
- `apps/web` — React 19 and Vite interface with authenticated operations routes, responsive layouts, and Vitest plus Playwright coverage.
- `packages/contracts` — shared API paths, permissions, request and response types, validation constants, and formatting-safe domain contracts.

Generated `dist`, Prisma client, coverage, and browser-result directories are intentionally ignored.

## Requirements

- Node.js 24.18.1 or newer within the Node 24 line
- npm 11.16.0 or newer within the npm 11 line
- PostgreSQL running locally, with permission to create databases and apply migrations

Install workspace dependencies from the repository root:

```sh
npm install
```

## Environment configuration

Copy the tracked template, then replace its development placeholders with local values:

```sh
cp apps/api/.env.example apps/api/.env
```

The API reads these variables:

| Name                                     | Purpose                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| `NODE_ENV`                               | Runtime mode                                               |
| `APP_ORIGIN`                             | Browser origin allowed for authenticated mutation requests |
| `HOST`                                   | API bind host                                              |
| `PORT`                                   | API port                                                   |
| `LOG_LEVEL`                              | Structured logging threshold                               |
| `DATA_HASH_SECRET`                       | Key material for deterministic sensitive-data hashing      |
| `JWT_SECRET`                             | Session-token signing key                                  |
| `SESSION_TTL_HOURS`                      | Authenticated session lifetime                             |
| `RATE_LIMIT_LOGIN_MAX`                   | Login attempts allowed per window                          |
| `RATE_LIMIT_LOGIN_WINDOW_SECONDS`        | Login limiter window                                       |
| `RATE_LIMIT_PARTNER_MAX`                 | Partner verification requests allowed per window           |
| `RATE_LIMIT_PARTNER_WINDOW_SECONDS`      | Partner limiter window                                     |
| `RATE_LIMIT_VERIFICATION_MAX`            | Public verification requests allowed per window            |
| `RATE_LIMIT_VERIFICATION_WINDOW_SECONDS` | Public verification limiter window                         |
| `DATABASE_URL`                           | Pooled application PostgreSQL URL                          |
| `DIRECT_URL`                             | Direct PostgreSQL URL used by Prisma commands              |

The web workspace also accepts optional `VITE_API_PROXY_TARGET` for its development-server proxy and `VITE_API_BASE_URL` when the browser bundle must call an explicit API origin. Leave the base URL unset for the normal same-origin `/api` flow.

Keep `.env` local. Do not commit signing keys, database credentials, partner keys, or seeded account credentials.

## Database setup

Create separate local development and test databases:

```sh
createdb verilot
createdb verilot_test
npm run db:generate
npm run db:migrate
npm run db:seed
```

`npm run db:migrate` creates a development migration when the Prisma schema changes and applies pending migrations. Use `npm run db:migrate:deploy` to apply existing migrations without creating one. `npm run db:generate` regenerates the ignored Prisma client, and `npm run db:seed` loads the local development fixtures.

> **Destructive test database warning:** test and browser suites reset and reseed the local database named `verilot_test`. Every row in that database is deleted. The test guards accept only loopback PostgreSQL hosts and that exact test database name; never point the test URLs at shared, staging, or production data.

The API Vitest configuration derives its test URLs from `apps/api/.env` by replacing the database pathname with `verilot_test`. Run the database-backed suite with explicit consent:

```sh
env PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='YES, reset and reseed the local verilot_test database.' npm run test
```

The Playwright preparation script applies the same local-only reset guard and consent before its servers start.

## Local development

Run the API and web interface in separate terminals:

```sh
npm run dev:server
```

```sh
npm run dev:web
```

`npm run dev` is an alias for the API command. There is no single combined process script; keeping the two watchers separate makes shutdown and log inspection explicit. The Vite development server proxies `/api` to the API, preserving the same-site browser security model.

## Quality commands

| Command                    | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run format`           | Format tracked source and documentation                                      |
| `npm run format:check`     | Verify formatting without changing files                                     |
| `npm run typecheck`        | Type-check all workspaces and API tests                                      |
| `npm run test:unit`        | Run workspace unit suites                                                    |
| `npm run test:integration` | Run API integration suites                                                   |
| `npm run test`             | Run all Vitest suites                                                        |
| `npm run test:e2e`         | Reset `verilot_test`, start isolated API and web servers, and run Playwright |
| `npm run build`            | Build contracts, API, and the production web bundle                          |

Playwright uses one worker, reusable role-specific session states, dedicated loopback ports, and failure-only screenshots, traces, and video. It stops both managed servers when the suite completes.

## Interfaces and API routes

The web interface provides `/sign-in`, `/dashboard`, product and batch lists and details, alert and recall lists and details, locations, administrator-only audit-record lists and details, and a not-found page. Authenticated detail screens expose permitted alert assignment/resolution/dismissal, recall creation/completion, batch creation/activation/closure, and custody-event recording workflows.

API discovery and verification:

- `GET /api/health` — service health.
- `GET /api/docs` — interactive OpenAPI documentation.
- `GET /api/openapi.json` — OpenAPI document.
- `GET /api/v1/verification/:serialNumber` — rate-limited public product verification.
- `GET /api/partner/v1/verification/:serialNumber` — API-key-authenticated, independently rate-limited partner verification.

Authenticated organization routes begin with `/api/v1` and cover the session, dashboard summary, products, batches, alerts, recalls, locations, users, and audit records. Mutations are available at product `/:productId/events`, batch creation and `/:batchId/activate|close`, alert `/:alertId/assign|resolve|dismiss`, and recall creation and `/:recallId/complete`.

## Permissions and security

- **Administrator:** all current read and mutation permissions, including users and audit records.
- **Operator:** dashboard, product, batch, alert, recall, and location reads; batch lifecycle and custody-event writes.
- **Inspector:** dashboard, product, batch, alert, recall, and location reads; alert management.

The API enforces permissions again at every protected route. Repository queries derive organization scope from the authenticated session rather than accepting an organization choice from the browser, and cross-organization identifiers return no accessible record.

Authenticated browser mutations require an allowed origin, an HTTP-only signed session, and the matching CSRF header. Mutation forms generate idempotency keys and the API records outcomes so retries cannot duplicate domain changes. Session and CSRF state remain runtime-only: the application does not put credentials, CSRF values, or idempotency values in `localStorage`, `sessionStorage`, or IndexedDB.

Security-relevant mutations create organization-scoped audit records with request IDs. Custody history and audit evidence are append-only at the database layer. Login, public verification, and partner verification use PostgreSQL-backed rate-limit state so limits survive process restarts and multiple API instances. Structured logging redacts authorization material, cookies, CSRF values, API keys, credentials, and request bodies.

## Responsive and accessible interface

The interface provides a skip link, one page heading and main landmark per route, semantic controls, visible labels, connected instructions and errors, live loading and mutation results, described dialogs, keyboard dismissal and return behavior, table captions and scoped headers, textual statuses, reduced-motion handling, and safe wrapping for identifiers, redacted values, timelines, and JSON.

Lists use readable record layouts at narrow widths, navigation collapses behind an accessible mobile menu, dialogs scroll within the viewport, controls retain mobile-friendly sizing, and layouts avoid page-level horizontal movement. Browser regression coverage includes 320 × 568, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, and 1440 × 900 viewports.

## Deployment status

This repository documents and validates local development and production builds. No hosted deployment or hosting-provider configuration is claimed.
