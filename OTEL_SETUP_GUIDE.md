# 🚀 How to Add OpenTelemetry to Your Monorepo

This guide walks you through adding OpenTelemetry (OTEL) instrumentation to a new Next.js app in your pnpm monorepo. Your architecture uses a centralized `@yourorg/otel` package (in `packages/otel/`) that all apps reference and use.

## Monorepo Structure

```
your-monorepo/
├── pnpm-workspace.yaml           # Workspace config
├── package.json                   # Root package.json
├── packages/
│   └── otel/                      # Shared OTEL package
│       ├── package.json
│       ├── src/
│       │   └── index.ts           # OTEL registration logic
│       └── tsconfig.json
└── apps/
    ├── ibe-app/                   # Existing Next.js app
    │   ├── package.json
    │   ├── instrumentation.ts     # ← Key file
    │   └── ...
    ├── top-app/                   # Existing Next.js app
    │   ├── package.json
    │   ├── instrumentation.ts     # ← Key file
    │   └── ...
    └── your-new-app/              # Your new app (to be created)
        ├── package.json
        ├── instrumentation.ts     # ← You'll create this
        └── ...
```

## Prerequisites

- Monorepo set up with **pnpm workspaces** (with `pnpm-workspace.yaml`)
- Shared `packages/otel/` package already exists and configured
- A Next.js 14+ app (either existing or to be created)
- Node.js 18+ installed
- Jaeger running locally (optional but recommended for testing)

---

## Step-by-Step Guide for New Apps

### Step 1: Verify Shared OTEL Package Exists

Check that your `packages/otel/` is set up correctly:

```bash
# From monorepo root
ls packages/otel/src/index.ts
```

It should contain:

```typescript
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "unknown-service",
    traceExporter: "auto",
  });
}
```

### Step 2: Create a New Next.js App (if needed)

Create your app from the monorepo root:

```bash
# From monorepo root, create app in apps/ directory
pnpm create next-app@latest apps/your-app-name --typescript --no-git
```

Or if you already have an app, just proceed to the next step.

### Step 3: Add OTEL Dependency to Your App's package.json

Update `apps/your-app-name/package.json` to include the shared OTEL package:

```json
{
  "name": "your-app-name",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@yourorg/otel": "workspace:*"  // ← CRITICAL: Workspace reference
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0"
  }
}
```

> 💡 **Note:** The `"workspace:*"` syntax tells pnpm to use the local `packages/otel/` package instead of trying to fetch from npm.

### Step 4: Create instrumentation.ts at App Root

Create a new file at `apps/your-app-name/instrumentation.ts`:

```typescript
// Next.js automatically calls the exported `register()` function from this
// file once, when the server instance starts (app router "instrumentation
// hook"). We delegate to the shared OTEL setup so all apps in the monorepo
// stay in sync with the same tracing configuration.
export { register } from "@yourorg/otel";
```

> ⚠️ **Important:** The filename must be exactly `instrumentation.ts` at the **root** of your app directory (same level as `app/`, `pages/`, `package.json`). This is a Next.js convention and required for automatic instrumentation.

### Step 5: Configure Environment Variables

Create `apps/your-app-name/.env.local`:

```env
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=your-app-name
NODE_OPTIONS=--require ./instrumentation.js

# Jaeger endpoint (for local development)
# Points to the shared Jaeger instance (see docker-compose.yml at monorepo root)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

### Step 6: Install Dependencies

From the **monorepo root**, run:

```bash
pnpm install
```

This command:
- Installs all dependencies across all workspaces
- Links the local `@yourorg/otel` package to your new app
- Updates the lockfile (`pnpm-lock.yaml`)

Do NOT run `npm install` or `yarn install` — they won't respect workspace links.

### Step 7: Verify the Setup Works

From the **monorepo root**, run the specific app:

```bash
# Option 1: Run from monorepo root (recommended)
pnpm --filter your-app-name dev

# Option 2: Navigate and run
cd apps/your-app-name && pnpm dev
```

You should see output like:
```
  ▲ Next.js 14.2.0
  - Local:        http://localhost:3000
  ...
```

No errors related to "Can't resolve 'fs'" or "Module not found: @yourorg/otel" should appear.

---

## Step 8: Verify Traces in Jaeger

### Start Jaeger (One-time setup for monorepo)

From the **monorepo root**, start the shared Jaeger instance:

```bash
docker-compose up -d
```

This starts a single Jaeger instance that collects traces from **all apps** in your monorepo.

### View Traces

1. Open [http://localhost:16686](http://localhost:16686) in your browser

2. In the **Service** dropdown, you'll see:
   - `ibe-app`
   - `top-app`
   - `your-app-name` ← Your new app
   - Other apps you've added

3. Select your app name and click **Find Traces**

4. Make a request to your app (e.g., visit `http://localhost:3000`)

5. Traces should appear in Jaeger showing:
   - `resolve page components`
   - `render route (app)`
   - `build component tree`
   - Timing information

### Running Multiple Apps

To test multiple apps together:

```bash
# Terminal 1: Run app 1
pnpm --filter ibe-app dev

# Terminal 2: Run app 2
pnpm --filter your-app-name dev

# All traces go to the same Jaeger instance
```

---

## How Monorepo OTEL Works

### Architecture Overview

```
Monorepo Root (pnpm-workspace.yaml)
│
├── packages/
│   └── otel/                    ← Shared OTEL config
│       ├── package.json         {"name": "@yourorg/otel"}
│       └── src/index.ts         ← Single source of truth
│
└── apps/
    ├── ibe-app/
    │   ├── package.json         Depends on @yourorg/otel:workspace:*
    │   └── instrumentation.ts   Exports register from @yourorg/otel
    │
    ├── top-app/
    │   ├── package.json         Depends on @yourorg/otel:workspace:*
    │   └── instrumentation.ts   Exports register from @yourorg/otel
    │
    └── your-new-app/
        ├── package.json         Depends on @yourorg/otel:workspace:*
        └── instrumentation.ts   Exports register from @yourorg/otel
```

### The Shared OTEL Package

Located at `packages/otel/src/index.ts`, the shared package contains:

```typescript
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "unknown-service",
    traceExporter: "auto",
  });
}
```

**Why a shared package?**
- ✅ Single source of truth for OTEL config
- ✅ Update once, all apps use new config
- ✅ Keeps individual apps lightweight
- ✅ Consistent tracing across monorepo
- ✅ Easy to add production exporters later

### Execution Flow (Behind the Scenes)

```
1. App starts (pnpm dev)
   ↓
2. Next.js detects instrumentation.ts
   ↓
3. Next.js calls the register() function
   ↓
4. instrumentation.ts: export { register } from "@yourorg/otel"
   ↓
5. packages/otel/src/index.ts register() is called
   ↓
6. registerOTel() initializes tracing
   ↓
7. Environment variables read:
   - OTEL_SERVICE_NAME (identifies app)
   - OTEL_EXPORTER_OTLP_ENDPOINT (Jaeger address)
   ↓
8. All HTTP requests traced automatically
   ↓
9. Traces sent to Jaeger (or configured exporter)
```

### Environment Variables (Per-App)

Each app's `.env.local` has:

| Variable | Purpose | Example |
|----------|---------|---------|
| `OTEL_SERVICE_NAME` | App identifier in traces | `ibe-app`, `your-app-name` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Trace exporter address | `http://localhost:4317` |
| `OTEL_TRACES_SAMPLER` | Sample all or some traces | `always_on`, `always_off` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling rate | `0.1` = 10% |

**Note:** 
- Each app has its own `OTEL_SERVICE_NAME` (unique identifier)
- All apps point to the same `OTEL_EXPORTER_OTLP_ENDPOINT` (shared Jaeger)

---

## Troubleshooting Monorepo-Specific Issues

### ❌ Error: "Can't resolve 'fs'"

**Cause:** Node.js-only modules imported in browser context

**Solution:** 
- Ensure `instrumentation.ts` **only exports** from `@yourorg/otel`
- Don't import Node.js modules directly in instrumentation.ts
- The shared package handles all Node-specific code

### ❌ Error: "Module not found: @yourorg/otel"

**Cause:** Workspace link broken or dependencies not installed

**Solution:**
```bash
# From monorepo root
pnpm install
# Or clean and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

Verify your `package.json` has:
```json
"@yourorg/otel": "workspace:*"
```

### ❌ Error: "workspace:* not recognized"

**Cause:** Not using pnpm or wrong version

**Solution:**
```bash
pnpm --version  # Should be 8.0+
npm install -g pnpm@latest
```

### ❌ Traces not appearing in Jaeger

**Cause:** Jaeger not running or wrong endpoint

**Solution:**
```bash
# From monorepo root, check Jaeger is running
docker ps | grep jaeger

# If not running:
docker-compose up -d

# Check your .env.local
cat apps/your-app-name/.env.local
# Should have: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Check app logs for OTEL errors
pnpm --filter your-app-name dev
```

### ❌ Running one app breaks others

**Cause:** Port conflicts (all apps trying to use port 3000)

**Solution:** Use different ports:
```json
{
  "scripts": {
    "dev": "next dev -p 3000"  // ibe-app
  }
}
```

```json
{
  "scripts": {
    "dev": "next dev -p 3001"  // your-app-name
  }
}
```

Or use pnpm filters from root (automatic port management):
```bash
pnpm --filter your-app-name dev  # Picks available port
```

### ❌ "Cannot find module '@yourorg/otel'" at build time

**Cause:** Missing build step for shared package

**Solution:**
```bash
# From monorepo root
pnpm build  # Builds all packages including @yourorg/otel
```

---

## Monorepo Workflow Commands

Essential commands for working with multiple apps:

```bash
# Install all dependencies across workspace
pnpm install

# Run dev for one app
pnpm --filter your-app-name dev

# Run dev for all apps
pnpm -r dev

# Build all apps
pnpm -r build

# Build just one app
pnpm --filter your-app-name build

# Run lint/type-check on all
pnpm -r lint
pnpm -r typecheck

# View workspace structure
pnpm list -r --depth=0
```

---

## Adding OTEL to Existing Apps

If you have existing apps without OTEL, just add 2 files:

1. Add to `package.json`:
   ```json
   "@yourorg/otel": "workspace:*"
   ```

2. Create `instrumentation.ts`:
   ```typescript
   export { register } from "@yourorg/otel";
   ```

3. Run `pnpm install` from monorepo root

That's it! No other changes needed.

---

## Production Setup for Monorepo

For production deployments:

1. **Use env vars instead of .env files:**
   ```bash
   # Set in your CI/CD pipeline
   OTEL_SERVICE_NAME=your-app-name
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com:4317
   ```

2. **Update shared OTEL package for prod:**
   Edit `packages/otel/src/index.ts` to support custom exporters based on env

3. **Deploy with Jaeger or managed backend:**
   - Jaeger: Self-hosted or cloud
   - Datadog, Honeycomb, New Relic, etc.

4. **Use sampling to reduce trace volume:**
   ```env
   OTEL_TRACES_SAMPLER=parentbased_traceidratio
   OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling
   ```

---

## Summary: Your Monorepo OTEL Setup

✅ **Centralized config** — All OTEL settings in `packages/otel/`  
✅ **One Jaeger instance** — Collects traces from all apps  
✅ **Easy to scale** — Add new apps with just 2 files  
✅ **Shared across team** — Consistent tracing everywhere  
✅ **Ready for production** — Use managed exporters as needed

---

## Next Steps

1. **View existing traces** — Open Jaeger at localhost:16686
2. **Add custom spans** — Instrument your API routes
3. **Analyze performance** — Use traces to find bottlenecks
4. **Set up alerts** — Configure Jaeger alerts for slow traces
5. **Move to production** — Deploy Jaeger or managed service

**Happy tracing!** 🎯