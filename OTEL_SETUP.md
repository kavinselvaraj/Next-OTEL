# OpenTelemetry Setup — Testing Guide

## Prerequisites
- Node.js 18+, pnpm, Docker Desktop running

## 1. Install dependencies
```bash
pnpm install
```

## 2. Start Jaeger
```bash
docker-compose up -d
```
(or without compose: `docker run -d --name jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 jaegertracing/all-in-one:1.58`)

## 3. Run both apps
```bash
pnpm dev
```
- ibe-app → http://localhost:3000
- top-app → http://localhost:3001

## 4. Generate traces
```bash
curl http://localhost:3000/
curl http://localhost:3001/
```

## 5. View traces
Open http://localhost:16686, select service `ibe-app` or `top-app` in the dropdown, click **Find Traces**.

## Checklist
- [ ] `pnpm install` completes with no errors
- [ ] `docker-compose up -d` → `docker ps` shows `jaeger` as healthy
- [ ] `pnpm dev` starts both apps without instrumentation errors in the console
- [ ] Each app logs `@opentelemetry` initialization (no "OTLP exporter" connection errors)
- [ ] curl requests return 200
- [ ] Jaeger UI service dropdown lists both `ibe-app` and `top-app`
- [ ] A trace for `GET /` appears with an HTTP server span

## What to expect in Jaeger UI
- Two services in the dropdown: `ibe-app`, `top-app` (matches `OTEL_SERVICE_NAME`)
- Each trace has a root span like `GET /` with `http.method`, `http.route`, `http.status_code` attributes
- No downstream spans yet — this is auto-instrumentation only, no manual/custom spans

## Troubleshooting
- **No services show up in Jaeger**: confirm `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` is in `.env.local` and restart `pnpm dev` (env vars are read at process start).
- **`instrumentation.ts` not running**: it must sit at the app root (same level as `app/`), and `next.config.js` needs `experimental.instrumentationHook: true`. Restart the dev server after adding it — it's not hot-reloaded.
- **`Module not found: @yourorg/otel`**: run `pnpm install` again from the repo root so the workspace symlink is created.
- **Connection refused to 4318**: Jaeger isn't up yet, or Docker Desktop isn't running — check `docker ps`.
- **Traces exist but are missing AWS resource attributes**: expected locally — `awsEcsDetector` only resolves metadata when running inside an actual ECS task; it no-ops safely elsewhere.
- **Port already in use (3000/3001/4317/4318/16686)**: stop whatever else is bound to it, or change the port in the app's `dev` script / compose file.
