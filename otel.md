# VS Code Claude Prompt - OpenTelemetry Implementation for Next.js Monorepo

Copy this entire text into Claude in VS Code (or claude.ai) and run it.

---

I have a Next.js monorepo with the following structure:
- `apps/ibe-app` (Internet Booking Engine app)
- `apps/top-app` (Marketing/content site)
- `packages/cms` (Prismic CMS client)
- `packages/sdk` (shared utilities)
- `packages/global-styles` (Tailwind CSS v4)
- Using Turborepo + pnpm
- Both apps use Next.js 13+ with app router
- Deployed on ECS (AWS)

## Task: Implement OpenTelemetry (OTEL) for distributed tracing

I want to:
1. ✅ Auto-instrument both `ibe-app` and `top-app` to capture request traces
2. ✅ Create a shared `packages/otel` that both apps import
3. ✅ Test locally with Jaeger before deploying to ECS
4. ✅ Later, integrate with our ECS collector sidecar for production

## What I need from you:

**Step 1:** Create `packages/otel/package.json` with:
- Dependencies: `@vercel/otel`, `@opentelemetry/api`, `@opentelemetry/resource-detector-aws`
- Export the `register()` function from `src/index.ts`

**Step 2:** Create `packages/otel/src/index.ts` that:
- Exports a `register()` function
- Calls `registerOTel()` with:
  - `serviceName` from `OTEL_SERVICE_NAME` env var
  - `traceExporter: 'auto'` (reads `OTEL_EXPORTER_OTLP_ENDPOINT`)
  - Includes `awsEcsDetector` for ECS metadata

**Step 3:** Create `apps/ibe-app/instrumentation.ts` that:
- Simply re-exports `register` from `@yourorg/otel`
- Has a comment explaining it runs automatically via Next.js hook

**Step 4:** Create `apps/top-app/instrumentation.ts` (same as ibe-app)

**Step 5:** Create/update both apps' `next.config.js` to include:
```
experimental: { instrumentationHook: true }
```

**Step 6:** Create `.env.local` files:
- `apps/ibe-app/.env.local` with `OTEL_SERVICE_NAME=ibe-app` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
- `apps/top-app/.env.local` with `OTEL_SERVICE_NAME=top-app` and same endpoint

**Step 7:** Create a `docker-compose.yml` in the monorepo root that:
- Runs Jaeger all-in-one on ports 16686 (UI), 4317 (gRPC), 4318 (HTTP)
- Includes health check for Jaeger

**Step 8:** Provide a step-by-step testing guide:
1. Run `pnpm install`
2. Run `docker-compose up` (or `docker run` command for Jaeger)
3. Run both apps with `pnpm dev`
4. Make test curl requests to each app
5. Visit `http://localhost:16686` and view traces

## Important Notes:
- Both apps need `"@yourorg/otel": "workspace:*"` in their package.json dependencies
- Use consistent naming: `@yourorg/otel` as the package name
- The instrumentation.ts file must be at the app root (same level as `app/` folder)
- For app router (not pages router)
- No custom spans needed yet — just auto-instrumentation

## Output Format:
Provide:
1. Each file content separately with file path
2. The exact commands to run (copy-paste ready)
3. A checklist to verify each step
4. What to expect when viewing Jaeger UI
5. Troubleshooting tips for common issues

Start implementation now.
