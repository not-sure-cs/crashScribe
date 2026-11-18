# CrashScribe — Engineering & Architecture Rules (GEMINI.md)

**Project Name:** CrashScribe  
**Target Domain:** Traffic Police Accident Reporting & Investigation (Assam, India)  
**Standard Compliance:** Electronic Detailed Accident Report (eDAR) Schema  
**Architecture Context:** Offline-First Mobile Application + Domain-Driven Microservices Backend  

---

## 1. Project Overview & Operational Constraints

**CrashScribe** is an offline-first mobile accident reporting and analytics platform designed specifically for Assam Police traffic officers operating in environments with spotty, intermittent, or absent cellular connectivity (remote highways, rural corridors, hilly terrain).

### Core Boundaries & Mandates
1. **Offline-First Resilience:** The full accident creation lifecycle (100+ eDAR fields, dynamic vehicles, casualties, local photos) MUST operate without internet connectivity.
2. **Explicit, User-Controlled Sync Only:**
   - **Zero automatic uploads** on form submit.
   - **Zero automatic uploads** when network connectivity is restored.
   - Sync occurs **strictly and solely** when the officer manually taps "Sync" or "Sync All" in the Settings tab.
3. **Decoupled AI & Speech-to-Text:**
   - The current React + Vite client must never generate fake transcription, translation, download progress, or model-ready state.
   - Native audio capture and inference belong in the planned React Native Android client or a separate native Android client sharing TypeScript contracts.
   - The browser demo keeps manual entry available and may show an explicit native-client-required notice.
4. **Sensor Auto-Capture:** Automate capture for device GPS latitude/longitude and local timestamps, with manual override fallback.
5. **eDAR Conformance:** Strict alignment with official MoRTH eDAR schemas, supporting dynamic ordering modes without altering the underlying data model.

---

## 2. System Architecture & Topology

The platform comprises an **offline-first mobile client**, a **high-performance API Gateway in Go**, and **4 domain microservices** with independent databases, coordinated via an asynchronous message broker:

```
                            OFFICER MOBILE APP
                       (Flutter / React Native)
                                   │
                                   ▼
             ┌───────────────────────────────────────────┐
             │       API GATEWAY in Go (:8080/:8443)     │
             │  - Mobile Keep-Alive & Timeout Tuning     │
             │  - TLS 1.3 & Centralized JWT Verification │
             │  - Sliding Window Rate Limiting (Redis)   │
             │  - Header Injection (X-Officer-ID, Role)  │
             └─────┬──────────────┬─────────────┬────────┘
                   │              │             │
        ┌──────────┘              │             └──────────┐
        ▼                         ▼                        ▼
┌──────────────┐          ┌──────────────┐         ┌──────────────┐
│  Auth & RBAC │          │ Report Ingest│         │   Evidence   │
│   Service    │          │  & Sync Svc  │         │   Service    │
│   (:5001)    │          │   (:5002)    │         │   (:5003)    │
└──────┬───────┘          └──────┬───────┘         └──────┬───────┘
       │                         │                        │
  PostgreSQL                PostgreSQL                 MinIO / S3
  (Users DB)             (eDAR Reports DB)          (Evidence Blobs)
                                 │
                                 │ (Transactional Outbox CDC)
                                 ▼
                        ┌──────────────────┐
                        │   EVENT BROKER   │
                        │ (RabbitMQ/Kafka) │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Assam Analytics  │
                        │ & Blackspot Svc  │
                        │     (:5004)      │
                        └────────┬─────────┘
                                 │
                            PostgreSQL +
                              PostGIS
                        (Read/Spatial DB)
```

### Microservice Bounded Contexts & Ports

| Component | Default Port | Responsibility | Persistence |
|---|---|---|---|
| **API Gateway** | `8080` (HTTP) / `8443` | Reverse proxy, JWT validation, rate-limiting, header injection | In-Memory / Redis (`:6379`) |
| **Auth & Staff Service** | `5001` | Officer registration, login, JWT rotation, station/district directory, RBAC | PostgreSQL (`crashscribe_auth`) |
| **Report Ingestion & Sync Service** | `5002` | Offline batch/single sync, idempotency, eDAR relational CRUD, Transactional Outbox | PostgreSQL (`crashscribe_reports`) |
| **Evidence Service** | `5003` | Cloudflare R2 / S3 presigned PUT URLs, SHA256 integrity check, GPS metadata extraction | Cloudflare R2 / S3 + PostgreSQL (`crashscribe_evidence`) |
| **Assam Analytics & Blackspot Service** | `5004` | Event consumer, PostGIS spatial clustering (`ST_ClusterDBSCAN`), 500m blackspot detection | PostgreSQL 16 + PostGIS (`crashscribe_analytics`) |

---

## 3. Key Design Patterns & Engineering Principles

### 1. High-Performance Go Gateway at the Edge
- Built in Go using `httputil.ReverseProxy` with tuned mobile timeouts:
  - `ReadTimeout: 10s`, `WriteTimeout: 15s`, `IdleTimeout: 120s`.
- Cryptographically validates JWT Bearer tokens and strips incoming client identity headers.
- Injects trusted upstream headers: `X-Officer-ID`, `X-District-ID`, `X-Station-ID`, `X-User-Role`.

### 2. Distributed Idempotency Guard
- Mobile sends `X-Idempotency-Key: <client_report_uuid>`.
- Ingestion Service guards duplicate writes using a Redis distributed lock and a unique constraint on `client_report_id`.
- Duplicate sync submissions return `200 OK` with existing `server_report_id` without creating duplicate database rows.

### 3. Transactional Outbox Pattern & CQRS
- Report Ingestion Service writes the eDAR report, vehicles, persons, and an outbox event in the **same atomic database transaction**.
- A background worker polls `report_outbox` and publishes `ReportSynchronizedEvent` to RabbitMQ with at-least-once delivery semantics.
- Analytics Service consumes the event and writes to read-optimized spatial tables (`geom GEOMETRY(Point, 4326)`).

### 4. Direct-to-Storage Media Pipeline (Presigned URLs)
- High-resolution photographs never stream through application servers.
- Mobile client requests presigned PUT URL &rarr; uploads binary directly to MinIO/S3 &rarr; verifies upload via `/api/v1/evidence/confirm`.

### 5. Role-Based Access Control (RBAC) & Privacy
- **Roles:** `OFFICER`, `DISTRICT_SP`, `SUPER_ADMIN`.
- Passwords hashed with Argon2id or Bcrypt (cost factor 12).
- **Strict PII Redaction:** Public/statewide dashboard APIs return only aggregated metrics, spatial clusters, and general incident trends; victim names, contact details, and hospital notes are role-masked.

---

## 4. Mobile Client Architecture (Offline-First)

### 4.1. Navigation & State Model
- Persistent 3-tab navigation:
  1. **Home:** Accident Report Creation Form.
  2. **Accident:** Assam-Wide Analytics Dashboard & Interactive Cluster Map.
  3. **Settings:** Officer Profile, Model Download Placeholders, and Report Synchronization Centre.
- Offline/Online connectivity indicator pinned in top app bar.

### 4.2. 7-Section Dynamic eDAR Form
- Organized into expandable/collapsible accordions:
  1. Accident Information (Date, Time, Category, Nature, Severity).
  2. Accident Location (District, Police Station, Highway, Landmark, GPS Lat/Long).
  3. Road & Environmental Conditions (Surface, Weather, Visibility, Geometry).
  4. Vehicle Information (Dynamic 1-to-N vehicle cards).
  5. Persons Involved (Dynamic 1-to-N casualty cards).
  6. Accident Description (Narrative text with native-client-only AI assist and manual fallback).
  7. Evidence & Attachments (Camera/gallery picker, thumbnails, captions).

### 4.3. Field-Order Toggle
- **Mode A (Required / Practical First):** Auto-captured sensor fields (GPS, time) and mandatory casualty fields first.
- **Mode B (Official eDAR Order):** Strictly follows sequential MoRTH eDAR form ordering.
- *Rule:* Switching modes reorders UI layout dynamically without clearing or resetting reactive state.

### 4.4. Validation & Local Save Flow
1. Officer taps **Review Report** &rarr; client validation executes.
2. If invalid: Display non-blocking bottom sheet with missing count; tapping an item scrolls directly to and focuses the field.
3. If valid: Navigate to **Draft Review Screen**.
4. Officer confirms &rarr; taps **Confirm and Save on Device** &rarr; generates UUID, saves to local SQLite (status: `SAVED_LOCAL` / Pending Cloud Sync). **No cloud upload occurs.**

### 4.5. Settings Sync Hub
- Separates reports into:
  - **Pending Cloud Sync** (with individual "Sync" buttons and a master "Sync All Pending Reports" button).
  - **Successfully Synchronized** (with server IDs and sync timestamps).
- If sync fails due to bad network, local records are preserved intact with retry options.

---

## 5. Development Roadmap: Phase-by-Phase Plan

```
PHASE 1: BACKEND (First Priority)
├── Step 1.1: Repo Monorepo Structure & Native DB Setup (No Docker, No Redis, No S3)
├── Step 1.2: Go High-Performance API Gateway (:8080)
├── Step 1.3: Auth & Staff Service (:5001) & crashscribe_auth
├── Step 1.4: Report Ingestion & Sync Service (:5002), Redis Setup & crashscribe_reports
├── Step 1.5: Evidence Service (:5003), Cloudflare R2 & crashscribe_evidence
├── Step 1.6: RabbitMQ Event Broker & Outbox Poller CDC
├── Step 1.7: Assam Analytics & PostGIS Spatial Service (:5004) & crashscribe_analytics
└── Step 1.8: Backend QA, OpenAPI Specs & Integration Test Suite

PHASE 2: FRONTEND (Mobile Client)
├── Step 2.1: Mobile Foundation, Navigation & Police Design System
├── Step 2.2: Encrypted Local SQLite DB (SQLCipher) & Repositories
├── Step 2.3: 7-Section Dynamic eDAR Form & Sensor Auto-Capture
├── Step 2.4: Form Validation, Missing Fields Bottom Sheet & Draft Review
├── Step 2.5: Evidence Capture & Local Media Management
├── Step 2.6: Settings Tab — Report Synchronization Centre
├── Step 2.7: Assam Analytics Dashboard & Interactive Cluster Map
├── Step 2.8: Native Offline AI Integration (separate Android client)
└── Step 2.9: End-to-End Acceptance Testing (All 16 Criteria)

PHASE 3: DOCKERISATION & DEPLOYMENT
├── Step 3.1: Multi-Stage Dockerfiles (Gateway & Services)
├── Step 3.2: Production docker-compose.yml Mesh Orchestration
└── Step 3.3: Container Smoke Test & Health Check Verification
```

---

## 6. Coding & Implementation Guidelines for Antigravity

When generating code or proposing implementations for CrashScribe:
1. **Always check existing architecture:** Cross-reference [architecture.md](file:///Users/knibirdgautam/Documents/CS_Coding_Projects/crashScribe/readContext/architecture.md), [backend.md](file:///Users/knibirdgautam/Documents/CS_Coding_Projects/crashScribe/readContext/backend.md), and [workflow.md](file:///Users/knibirdgautam/Documents/CS_Coding_Projects/crashScribe/readContext/workflow.md).
2. **Preserve offline-first guarantees:** Never write mobile code that assumes an active network connection for draft creation, review, or local persistence.
3. **Respect AI boundaries:** Never fake transcription, translation, model downloads, or model readiness. Keep native ONNX/Whisper/TFLite dependencies out of the browser client; implement them only in the native Android client after artifact and device validation.
4. **Enforce idempotency:** Ensure all ingestion endpoints and client sync requests use `X-Idempotency-Key` or `client_report_id` checks.
5. **Database isolation:** Do not introduce cross-database foreign key joins between the microservices.

---

## 7. Repeatable & Viable Testing Strategy

To ensure zero data loss under rural Indian field conditions and strict eDAR conformance, all code must pass a 4-tier automated testing pyramid:

```
                  ┌────────────────────────┐
                  │    Field & E2E Tests   │  (Simulated Airplane Mode, App Kill,
                  │  (Scenario Validations)│   Re-sync, Device Reboots)
                  ├────────────────────────┤
                  │   Integration Tests    │  (Gateway -> Service -> DB -> Event Bus ->
                  │    (API / Cross-Svc)   │   PostGIS Spatial Analytics Verification)
                  ├────────────────────────┤
                  │   Component / Service  │  (Idempotency Guards, Outbox Poller,
                  │     Contract Tests     │   Presigned S3/R2 URL, RBAC Headers)
                  ├────────────────────────┤
                  │       Unit Tests       │  (eDAR Schema Validations, Token Sign/Verify,
                  │  (Pure Business Logic) │   Geo-calc, Local SQLite Migrations)
                  └────────────────────────┘
```

### 7.1. Tier 1: Unit & Domain Contract Tests (Fast, Isolated, In-Memory)
- **Scope:** Pure functions, eDAR entity validation, JWT claim validation, SQLite queries, state machine transitions.
- **Tools:** Go `testing` / `testify`, Jest / Vitest, Dart `flutter_test`.
- **Requirements:**
  - Mock all external I/O (no network, no live DBs required).
  - Test eDAR validation rules: missing mandatory fields (District, PS, Date, Time, 1+ Vehicle, 1+ Person) must reliably reject invalid reports.
  - Test JWT token generator and validator with expired and tampered signatures.
  - Test offline form field-order toggle logic: verify state persistence when toggling Mode A &harr; Mode B.
- **Repeatable Execution:**
  ```bash
  # Go API Gateway unit tests
  cd backend/api-gateway && go test -v -race ./...
  # Microservices unit tests
  npm run test:unit
  ```

### 7.2. Tier 2: Service & Idempotency Integration Tests
- **Scope:** Individual microservice endpoints communicating with native test databases.
- **Test Matrix:**
  1. **Auth Service (`:5001`):**
     - Duplicate officer badge registration returns `409 Conflict`.
     - Valid login returns JWT with claims (`officer_id`, `district`, `role`).
     - Token refresh rotates token and rejects revoked tokens.
  2. **Report Ingestion Service (`:5002`):**
     - **Atomic Transaction Test:** Simulating DB failure during vehicle insert rolls back report and outbox entry.
     - **Idempotency Replay Test:** Sending the exact same payload with `X-Idempotency-Key: <UUID>` 5 times concurrently must result in exactly 1 database row and 5 `200 OK` responses with identical `server_report_id`.
  3. **Evidence Service (`:5003`):**
     - Presigned URL endpoint returns valid Cloudflare R2 / S3 PUT URL for valid image MIME types; rejects non-image files.
     - Confirmation endpoint marks record `COMPLETED`.
  4. **Analytics Service (`:5004`):**
     - PostGIS spatial cluster query returns valid GeoJSON grouping points within 500m.
     - Verify PII redaction: victim name and phone are strictly omitted from response.
- **Repeatable Execution:**
  ```bash
  npm run test:integration
  ```

### 7.3. Tier 3: End-to-End Gateway & Event Pipeline Tests
- **Scope:** Full flow from API Gateway through microservices and event queues.
- **Scenario:**
  1. Register Officer &rarr; Login &rarr; Obtain JWT Bearer Token.
  2. Gateway checks Bearer token, injects `X-Officer-ID` and routes to Ingestion Service.
  3. Submit accident report with 2 vehicles and 1 casualty.
  4. Outbox poller detects new record in `report_outbox` and publishes event to RabbitMQ.
  5. Analytics consumer ingests event and writes spatial record to PostGIS.
  6. Query `GET /api/v1/analytics/summary` &rarr; assert total count incremented by 1.
- **Repeatable Execution:**
  ```bash
  # Automated curl / Newman script
  bash backend/scripts/run_e2e_tests.sh
  ```

### 7.4. Tier 4: Mobile Offline-Resilience & Chaos Testing (Critical)
To validate the 16 project acceptance criteria, the client must undergo simulated real-world failure tests:
1. **Zero Auto-Sync Test:**
   - Create accident report &rarr; Click "Confirm and Save on Device".
   - Assert network activity: **0 bytes transmitted**.
   - Assert local DB: status is `SAVED_LOCAL` / `PENDING_SYNC`.
2. **Airplane Mode & Reboot Test:**
   - Put mobile in Airplane Mode &rarr; Create report &rarr; Force kill app &rarr; Reboot phone.
   - Reopen app &rarr; Report remains intact in Settings &rarr; Pending Cloud Sync.
3. **Mid-Flight Drop & Retry Test:**
   - Initiate "Sync All" &rarr; Sever network mid-transfer.
   - Assert: Local records remain preserved in Pending queue; UI displays clear non-destructive error.
   - Reconnect network &rarr; Tap "Sync All" &rarr; Reports upload successfully, status transitions to `SYNCED`, and zero duplicate rows exist on server.
4. **Mock AI Decoupling Test:**
   - Tap microphone icons on narrative fields &rarr; Verify placeholder text injected without crash.
   - Click Model Download cards &rarr; Verify mock progress bar animates without downloading multi-GB binaries.

### 7.5. Continuous Quality Gates
- **Zero-Failure Gate:** All unit and integration tests must pass before advancing from Phase 1 to Phase 2.
- **Linter & Security Scan:** Static analysis with `golangci-lint` (Gateway), `eslint` (Services), and `npm audit`.
- **Database Rollback Validation:** Every migration script must have an idempotent down/rollback migration tested.
