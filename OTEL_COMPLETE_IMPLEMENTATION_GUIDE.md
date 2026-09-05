# 🚀 Complete OTEL Implementation Guide

This is the **only guide you need** to set up OpenTelemetry and serializable logging in your monorepo from scratch.

---

## Table of Contents

1. [Overview](#overview)
2. [Step-by-Step Implementation](#step-by-step-implementation)
3. [Testing](#testing)
4. [Troubleshooting](#troubleshooting)

---

## Overview

### What You'll Build

A monorepo with:
- ✅ Shared OTEL package in `packages/otel/`
- ✅ Automatic tracing for all requests
- ✅ Structured logging (terminal + Jaeger)
- ✅ Multiple apps (ibe-app, top-app) using shared setup
- ✅ Color-coded logs in terminal, JSON Lines in production (CloudWatch/Datadog-ready)
- ✅ Logs visible in Jaeger as span events
- ✅ Trace ID returned in every response header (`x-trace-id`) and stamped on every log line
- ✅ Failed requests marked as errored spans in Jaeger (`span.recordException`)
- ✅ An OTEL Collector sitting between apps and Jaeger, so the backend can change without touching app code

### Architecture

```
Monorepo Root
│
├── packages/otel/              ← Shared OTEL setup
│   ├── package.json
│   └── src/
│       ├── index.ts            ← Main export
│       ├── logger.ts           ← LoggerProvider initialization
│       └── log-helper.ts       ← createLogger() + getTraceContext()
│
├── apps/ibe-app/               ← App 1
│   ├── package.json
│   ├── instrumentation.ts      ← Uses shared OTEL
│   ├── .env.local
│   └── app/
│       ├── page.tsx
│       └── api/test-logs/route.ts
│
├── apps/top-app/               ← App 2
│   ├── package.json
│   ├── instrumentation.ts      ← Uses shared OTEL
│   ├── .env.local
│   └── app/
│       ├── page.tsx
│       └── api/test-logs/route.ts
│
├── otel-collector-config.yaml  ← OTLP receiver → batch → Jaeger + debug
└── docker-compose.yml          ← jaeger + otel-collector services
```

### Request Flow

```
Browser/curl
   ↓
Next.js app (ibe-app / top-app)
   ↓ logger.info()/error() → console + span event
   ↓ OTLP export → localhost:4317
otel-collector (batches, can fan out to multiple backends)
   ↓ localhost:4317 is now owned by the collector, not Jaeger
jaeger:4317 (internal docker network)
   ↓
Jaeger UI @ localhost:16686
```

App code and `.env.local` never change when the backend changes — only
`otel-collector-config.yaml` does.

---

## Step-by-Step Implementation

### PHASE 1: Set Up Shared OTEL Package

#### Step 1.1: Update packages/otel/package.json

Open `packages/otel/package.json` and replace entire content:

```json
{
  "name": "@yourorg/otel",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@vercel/otel": "^1.10.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/resource-detector-aws": "^1.5.2",
    "@opentelemetry/sdk-logs": "^0.52.0",
    "@opentelemetry/exporter-logs-otlp-http": "^0.52.0"
  }
}
```

#### Step 1.2: Create packages/otel/src/logger.ts

Create new file at `packages/otel/src/logger.ts`:

```typescript
import { LoggerProvider } from "@opentelemetry/sdk-logs";

let loggerProvider: LoggerProvider | null = null;

export function initializeLoggerProvider() {
  if (loggerProvider) return loggerProvider;
  loggerProvider = new LoggerProvider();
  return loggerProvider;
}

export function getLogger(name: string) {
  const provider = initializeLoggerProvider();
  return provider.getLogger(name);
}
```

#### Step 1.3: Create packages/otel/src/log-helper.ts

Create new file at `packages/otel/src/log-helper.ts`:

```typescript
import { trace, SpanStatusCode } from "@opentelemetry/api";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const colorMap: Record<LogLevel, string> = {
  DEBUG: "\x1b[36m",   // Cyan
  INFO: "\x1b[32m",    // Green
  WARN: "\x1b[33m",    // Yellow
  ERROR: "\x1b[31m",   // Red
};

const resetColor = "\x1b[0m";

export interface LogAttributes {
  [key: string]: string | number | boolean | undefined | any;
}

// Returns the active trace/span IDs, or undefined outside a request context.
export function getTraceContext(): { traceId: string; spanId: string } | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;

  const ctx = span.spanContext();
  if (!ctx || ctx.traceId === "00000000000000000000000000000000") return undefined;

  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

export function createLogger(name: string) {
  return {
    log(level: LogLevel, message: string, attributes?: LogAttributes, err?: unknown) {
      const timestamp = new Date().toISOString();
      const color = colorMap[level];
      const traceContext = getTraceContext();

      const logObject = {
        timestamp,
        level,
        logger: name,
        message,
        ...(traceContext && { trace_id: traceContext.traceId, span_id: traceContext.spanId }),
        ...(attributes && attributes),
      };

      if (process.env.NODE_ENV === "production") {
        // Production: JSON Lines format - one JSON object per line (CloudWatch, Datadog, etc.)
        console.log(JSON.stringify(logObject));
      } else {
        // Development: pretty-printed, color-coded
        const prefix = `${color}[${level}]${resetColor}`;
        const traceSuffix = traceContext ? ` (trace=${traceContext.traceId})` : "";
        console.log(`${prefix} ${timestamp} ${name} - ${message}${traceSuffix}`);
        if (attributes && Object.keys(attributes).length > 0) {
          console.log(JSON.stringify(attributes, null, 2));
        }
      }

      // Attach to the active span (visible in Jaeger) and mark the span as
      // failed when logging an error with a real Error object.
      try {
        const span = trace.getActiveSpan();
        if (span) {
          span.addEvent(`log.${level.toLowerCase()}`, {
            "log.message": message,
            "log.level": level,
            "log.logger": name,
            ...(attributes && flattenAttributes(attributes)),
          });

          if (level === "ERROR") {
            if (err instanceof Error) {
              span.recordException(err);
            }
            span.setStatus({ code: SpanStatusCode.ERROR, message });
          }
        }
      } catch (spanError) {
        // Span context might not be available
      }
    },

    info(message: string, attributes?: LogAttributes) {
      this.log("INFO", message, attributes);
    },

    // Pass the caught error as the 3rd arg to record it on the span
    // (span.recordException) and mark the span status as ERROR.
    error(message: string, attributes?: LogAttributes, err?: unknown) {
      this.log("ERROR", message, attributes, err);
    },

    warn(message: string, attributes?: LogAttributes) {
      this.log("WARN", message, attributes);
    },

    debug(message: string, attributes?: LogAttributes) {
      this.log("DEBUG", message, attributes);
    },
  };
}

function flattenAttributes(obj: LogAttributes, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenAttributes(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

export type Logger = ReturnType<typeof createLogger>;
```

#### Step 1.4: Update packages/otel/src/index.ts

Open `packages/otel/src/index.ts` and replace entire content:

```typescript
import { registerOTel } from "@vercel/otel";
import { initializeLoggerProvider } from "./logger";

export { getLogger } from "./logger";
export { createLogger, getTraceContext } from "./log-helper";
export type { Logger, LogLevel, LogAttributes } from "./log-helper";

export function register() {
  initializeLoggerProvider();

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "unknown-service",
    traceExporter: "auto",
  });
}
```

---

### PHASE 2: Set Up ibe-app

#### Step 2.1: Update apps/ibe-app/package.json

Open `apps/ibe-app/package.json` and add to dependencies:

```json
{
  "name": "ibe-app",
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
    "@yourorg/otel": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0"
  }
}
```

#### Step 2.2: Create apps/ibe-app/instrumentation.ts

Create new file at `apps/ibe-app/instrumentation.ts` (at app root, NOT in /app directory):

```typescript
// Next.js automatically calls the exported `register()` function from this
// file once, when the server instance starts (app router "instrumentation
// hook"). We just delegate to the shared OTEL setup so both apps stay in
// sync.
export { register } from "@yourorg/otel";
```

#### Step 2.3: Create apps/ibe-app/.env.local

Create new file at `apps/ibe-app/.env.local`:

```env
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=ibe-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

#### Step 2.4: Create apps/ibe-app/app/api/test-logs/route.ts

Create new file at `apps/ibe-app/app/api/test-logs/route.ts`:

```typescript
import { createLogger, getTraceContext } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("api/test-logs");

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  logger.info("GET /api/test-logs called", {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get("user-agent"),
    requestId,
  });

  try {
    const data = {
      message: "Logs are working!",
      timestamp: new Date().toISOString(),
      status: "success",
    };

    const duration = Date.now() - startTime;
    const traceId = getTraceContext()?.traceId;

    logger.info("Request successful", {
      requestId,
      status: 200,
      dataSize: JSON.stringify(data).length,
      duration: `${duration}ms`,
    });

    // Returning the trace ID lets you jump from a user-reported error
    // straight to the matching trace in Jaeger.
    return NextResponse.json(data, {
      headers: traceId ? { "x-trace-id": traceId } : undefined,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const traceId = getTraceContext()?.traceId;

    // Pass the caught `error` as the 3rd argument: it calls
    // span.recordException(error) + span.setStatus(ERROR), so the span
    // shows up as failed in Jaeger instead of a normal "OK" span.
    logger.error(
      "Request failed",
      {
        requestId,
        status: 500,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
      },
      error
    );

    return NextResponse.json(
      { error: "Internal Server Error", requestId, traceId },
      { status: 500, headers: traceId ? { "x-trace-id": traceId } : undefined }
    );
  }
}
```

#### Step 2.5: Update apps/ibe-app/app/page.tsx

Open `apps/ibe-app/app/page.tsx` and replace entire content:

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("pages/home");

export default function Home() {
  logger.info("Home page rendered");

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>ibe-app</h1>
      <p>OpenTelemetry with Logging is working!</p>

      <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#f0f0f0" }}>
        <h3>Test the logging:</h3>
        <ul>
          <li>
            <a href="/api/test-logs" target="_blank" rel="noopener noreferrer">
              GET /api/test-logs
            </a>
            {" "}- Check logs in Jaeger
          </li>
          <li>
            Open <a href="http://localhost:16686" target="_blank" rel="noopener noreferrer">
              Jaeger UI (localhost:16686)
            </a>
          </li>
          <li>Select "ibe-app" in the Service dropdown</li>
          <li>Click "Find Traces" to see traces with logs</li>
        </ul>
      </div>
    </div>
  );
}
```

---

### PHASE 3: Set Up top-app (Same as ibe-app)

Repeat the exact same steps for `top-app`, but with these changes:

#### Step 3.1: apps/top-app/package.json

Same as Step 2.1, just change:
- Port from `3000` to `3001`

```json
{
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint"
  },
  "dependencies": {
    "@yourorg/otel": "workspace:*"
  }
}
```

#### Step 3.2: apps/top-app/instrumentation.ts

Same as Step 2.2 (identical code)

```typescript
export { register } from "@yourorg/otel";
```

#### Step 3.3: apps/top-app/.env.local

Same as Step 2.3, just change service name:

```env
OTEL_SERVICE_NAME=top-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

#### Step 3.4: apps/top-app/app/api/test-logs/route.ts

Same as Step 2.4 (identical code)

#### Step 3.5: apps/top-app/app/page.tsx

Same as Step 2.5 (identical code)

---

### PHASE 4: Add the OTEL Collector

Create `otel-collector-config.yaml` at the monorepo root:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  debug:
    verbosity: normal

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/jaeger, debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
```

Update `docker-compose.yml` — stop publishing Jaeger's OTLP ports directly,
and add the collector in front of it:

```yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    ports:
      - "16686:16686"   # Jaeger UI
      - "9411:9411"     # Zipkin compatible endpoint
    # 4317/4318 are NOT published to the host anymore — the collector
    # below owns those ports and forwards to jaeger:4317 internally.
    environment:
      - COLLECTOR_OTLP_ENABLED=true
      - COLLECTOR_ZIPKIN_HTTP_PORT=9411
      - STORAGE=badger
      - BADGER_EPHEMERAL=false
      - BADGER_DIRECTORY_VALUE=/badger/data
      - BADGER_DIRECTORY_KEY=/badger/key
    volumes:
      - jaeger-storage:/badger
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:16686"]
      interval: 10s
      timeout: 5s
      retries: 5

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    container_name: otel-collector
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml:ro
    ports:
      - "4317:4317"     # OTLP gRPC receiver - apps point here now
      - "4318:4318"     # OTLP HTTP receiver
    depends_on:
      jaeger:
        condition: service_healthy

volumes:
  jaeger-storage:
```

Apps keep sending to `http://localhost:4317` — nothing changes in
`.env.local`, since the collector now sits on that port instead of Jaeger.

### PHASE 5: Install Dependencies

From monorepo root, run:

```bash
pnpm install
```

This will:
- Install all dependencies in packages/otel/
- Link @yourorg/otel to both apps
- Install everything needed

---

## Testing

### Step 1: Start Jaeger + OTEL Collector

```bash
docker-compose up -d
```

This starts **two** containers: `jaeger` and `otel-collector`. Apps send
traces to the collector (`localhost:4317`), which batches them and forwards
to Jaeger internally — no `.env.local` change needed.

Verify both are running:
```bash
docker ps | grep -E "jaeger|otel-collector"
```

### Step 2: Start Apps

Terminal 1 - ibe-app:
```bash
pnpm --filter ibe-app dev
```

Terminal 2 - top-app:
```bash
pnpm --filter top-app dev
```

### Step 3: Generate Logs

Make requests in Terminal 3:

```bash
# Test ibe-app
curl http://localhost:3000/api/test-logs

# Test top-app
curl http://localhost:3001/api/test-logs
```

### Step 4: View Logs

**In Terminal:**
You should see color-coded logs, each tagged with the active trace ID:
```
[INFO] 2026-09-05T14:27:25.123Z api/test-logs - GET /api/test-logs called (trace=220be882e6353f0d7fafc17730fa5152)
[INFO] 2026-09-05T14:27:25.245Z api/test-logs - Request successful (trace=220be882e6353f0d7fafc17730fa5152)
```

**In the response headers:**
```bash
curl -i http://localhost:3000/api/test-logs | grep x-trace-id
# x-trace-id: 220be882e6353f0d7fafc17730fa5152
```

Copy that value straight into Jaeger's search box to jump to the exact trace.

**In Jaeger:**
1. Open [http://localhost:16686](http://localhost:16686)
2. Select **ibe-app** or **top-app** in Service dropdown
3. Click **Find Traces**
4. Click on `/api/test-logs` trace
5. **Scroll down** to see "Logs" section with events like:
   - `log.info: "GET /api/test-logs called"`
   - `log.info: "Request successful"`
6. If the request threw an error, the span itself shows as **failed** (red) —
   not just a log event — because `logger.error(msg, attrs, error)` calls
   `span.recordException()` and `span.setStatus(ERROR)` under the hood.

---

## Using Logging in Your Code

### Basic Usage

Anywhere in your app (API routes, components, middleware):

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("feature-name");

// Log with message and attributes
logger.info("User logged in", {
  userId: "123",
  method: "email",
  duration: "245ms"
});

// Pass the caught error as the 3rd argument to record it on the active
// span (span.recordException + span.setStatus(ERROR)) — not just as a
// log event. Without it, a failed request still shows "OK" in Jaeger.
logger.error("Database error", {
  query: "SELECT * FROM users"
}, error);

logger.warn("Cache expiring", {
  current: 95,
  limit: 100
});

logger.debug("Processing item", {
  itemId: "456"
});
```

### Getting the Trace ID

Use `getTraceContext()` anywhere inside a request to read the active
trace/span ID — useful for returning it in a response header or a support
ticket so it can be pasted straight into Jaeger's search box.

```typescript
import { getTraceContext } from "@yourorg/otel";

const traceId = getTraceContext()?.traceId; // undefined outside a request
```

### In API Routes

```typescript
import { createLogger, getTraceContext } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("api/users");

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  logger.info("User creation started");

  try {
    const body = await request.json();
    const user = await createUserInDB(body);

    logger.info("User created", {
      userId: user.id,
      duration: `${Date.now() - startTime}ms`
    });

    return NextResponse.json(user);
  } catch (error) {
    const traceId = getTraceContext()?.traceId;

    // 3rd argument = the caught error, recorded on the span so Jaeger
    // marks this span as failed instead of a normal "OK" span.
    logger.error(
      "User creation failed",
      { duration: `${Date.now() - startTime}ms` },
      error
    );

    return NextResponse.json(
      { error: "Failed", traceId },
      { status: 400, headers: traceId ? { "x-trace-id": traceId } : undefined }
    );
  }
}
```

### In Server Components

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("components/dashboard");

export async function DashboardPage() {
  logger.info("Dashboard rendering");

  const data = await fetchDashboardData();

  logger.info("Dashboard data loaded", {
    itemCount: data.length
  });

  return <div>{/* ... */}</div>;
}
```

---

## File Structure Summary

After implementation, you'll have:

```
packages/otel/
├── package.json                    ✅ Updated
├── src/
│   ├── index.ts                    ✅ Updated (exports getTraceContext too)
│   ├── logger.ts                   ✅ Created
│   └── log-helper.ts               ✅ Created (trace correlation + exceptions)

apps/ibe-app/
├── package.json                    ✅ Updated
├── instrumentation.ts              ✅ Created
├── .env.local                      ✅ Created
└── app/
    ├── page.tsx                    ✅ Updated
    └── api/
        └── test-logs/
            └── route.ts            ✅ Created (returns x-trace-id header)

apps/top-app/
├── package.json                    ✅ Updated
├── instrumentation.ts              ✅ Created
├── .env.local                      ✅ Created
└── app/
    ├── page.tsx                    ✅ Updated
    └── api/
        └── test-logs/
            └── route.ts            ✅ Created (returns x-trace-id header)

otel-collector-config.yaml          ✅ Created (OTLP → batch → Jaeger + debug)
docker-compose.yml                  ✅ Updated (adds otel-collector service)
```

---

## Troubleshooting

### Problem: "Cannot find module '@yourorg/otel'"

**Solution:**
```bash
pnpm install
```

### Problem: Logs appear in terminal but not in Jaeger

**Solution:**
1. Restart your app (changes require restart)
2. Make a fresh request
3. In Jaeger, scroll down to "Logs" section in trace details

### Problem: No logs in terminal at all

**Solution:**
1. Check app is running: `pnpm dev`
2. Make a request: `curl http://localhost:3000/api/test-logs`
3. Logs should appear in terminal immediately with color codes

### Problem: Jaeger / collector not running

**Solution:**
```bash
docker-compose up -d
docker ps | grep -E "jaeger|otel-collector"
```

### Problem: No traces reaching Jaeger after adding the collector

**Solution:**
1. Check the collector actually started and is healthy:
   ```bash
   docker logs otel-collector
   ```
   You should see `Starting GRPC server` on `[::]:4317` and, after a
   request, a `Traces` log line with `resource spans: 1`.
2. Confirm `jaeger` is healthy before the collector starts — the compose
   file makes `otel-collector` wait on `jaeger`'s healthcheck.
3. Apps still point at `localhost:4317` in `.env.local` — that's correct,
   the collector now owns that port instead of Jaeger.

### Problem: A failed request shows "OK" in Jaeger instead of red/error

**Solution:** You're calling `logger.error(message, attributes)` without
the 3rd argument. Pass the caught error so the span gets
`recordException` + `setStatus(ERROR)`:
```typescript
logger.error("message", { attrs }, error); // ✅ marks the span failed
logger.error("message", { attrs });         // ❌ only adds a log event
```

### Problem: Port already in use

**Solution:**
- ibe-app: Change port 3000 in package.json and .env
- top-app: Change port 3001 in package.json and .env
- Jaeger UI / collector: Change ports in docker-compose.yml

---

## What You Now Have

✅ **OTEL Tracing** - Automatic request tracing  
✅ **Structured Logging** - Serializable JSON format (JSON Lines in production)  
✅ **Dual Output** - Terminal (color) + Jaeger (spans)  
✅ **Trace Correlation** - `x-trace-id` response header + trace ID on every log line  
✅ **Accurate Failure Status** - Failed requests show as errored spans in Jaeger  
✅ **Swappable Backend** - OTEL Collector decouples apps from Jaeger  
✅ **Monorepo Ready** - Shared setup for multiple apps  
✅ **Production Ready** - Can scale to any backend  

---

## Next Steps

1. ✅ Follow implementation steps 1-4
2. ✅ Run testing steps to verify
3. Add logging to your API routes
4. Add logging to key business operations
5. Monitor performance using Jaeger
6. Deploy to production

---

## Key Concepts

### What is OTEL?

OpenTelemetry (OTEL) is a standard way to collect:
- **Traces** - Request flow and timing
- **Logs** - Structured messages and events
- **Metrics** - Performance counters

All collected in one place for observability.

### How Does Logging Work Here?

1. You call `logger.info("message", { data })`
2. It creates a colored console log (for development)
3. It adds a span event to the active trace (for Jaeger)
4. Both appear with full context and timing

### Why Jaeger?

Jaeger shows you:
- Request flow (how services communicate)
- Timing (where requests spend time)
- Logs (what happened at each step)
- All in one visual trace

---

**You're ready to implement!** Start from Step 1 and follow through. 🚀