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
- ✅ Color-coded logs in terminal
- ✅ Logs visible in Jaeger as span events

### Architecture

```
Monorepo Root
│
├── packages/otel/              ← Shared OTEL setup
│   ├── package.json
│   └── src/
│       ├── index.ts            ← Main export
│       ├── logger.ts           ← Logger initialization
│       └── log-helper.ts       ← Easy logger API
│
├── apps/ibe-app/               ← App 1
│   ├── package.json
│   ├── instrumentation.ts      ← Uses shared OTEL
│   ├── .env.local
│   └── app/
│       ├── page.tsx
│       └── api/test-logs/route.ts
│
└── apps/top-app/               ← App 2
    ├── package.json
    ├── instrumentation.ts      ← Uses shared OTEL
    ├── .env.local
    └── app/
        ├── page.tsx
        └── api/test-logs/route.ts
```

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
import { trace } from "@opentelemetry/api";

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

export function createLogger(name: string) {
  return {
    log(level: LogLevel, message: string, attributes?: LogAttributes) {
      const timestamp = new Date().toISOString();
      const color = colorMap[level];

      // Console output with color
      const prefix = `${color}[${level}]${resetColor}`;
      console.log(`${prefix} ${timestamp} ${name} - ${message}`, attributes || "");

      // Add to current span as event (visible in Jaeger)
      try {
        const span = trace.getActiveSpan();
        if (span) {
          span.addEvent(`log.${level.toLowerCase()}`, {
            "log.message": message,
            "log.level": level,
            "log.logger": name,
            ...(attributes && flattenAttributes(attributes)),
          });
        }
      } catch (error) {
        // Span context might not be available
      }
    },

    info(message: string, attributes?: LogAttributes) {
      this.log("INFO", message, attributes);
    },

    error(message: string, attributes?: LogAttributes) {
      this.log("ERROR", message, attributes);
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
export { createLogger } from "./log-helper";
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
import { createLogger } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("api/test-logs");

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  logger.info("GET /api/test-logs called", {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get("user-agent"),
  });

  try {
    const data = {
      message: "Logs are working!",
      timestamp: new Date().toISOString(),
      status: "success",
    };

    const duration = Date.now() - startTime;

    logger.info("Request successful", {
      status: 200,
      dataSize: JSON.stringify(data).length,
      duration: `${duration}ms`,
    });

    return NextResponse.json(data);
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error("Request failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
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

### PHASE 4: Install Dependencies

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

### Step 1: Start Jaeger

```bash
docker-compose up -d
```

Verify running:
```bash
docker ps | grep jaeger
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
You should see color-coded logs:
```
[INFO] 2026-09-05T14:27:25.123Z api/test-logs - GET /api/test-logs called
[INFO] 2026-09-05T14:27:25.245Z api/test-logs - Request successful
```

**In Jaeger:**
1. Open [http://localhost:16686](http://localhost:16686)
2. Select **ibe-app** or **top-app** in Service dropdown
3. Click **Find Traces**
4. Click on `/api/test-logs` trace
5. **Scroll down** to see "Logs" section with events like:
   - `log.info: "GET /api/test-logs called"`
   - `log.info: "Request successful"`

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

logger.error("Database error", {
  error: error.message,
  query: "SELECT * FROM users"
});

logger.warn("Cache expiring", {
  current: 95,
  limit: 100
});

logger.debug("Processing item", {
  itemId: "456"
});
```

### In API Routes

```typescript
import { createLogger } from "@yourorg/otel";
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
    logger.error("User creation failed", {
      error: error instanceof Error ? error.message : String(error),
      duration: `${Date.now() - startTime}ms`
    });

    return NextResponse.json({ error: "Failed" }, { status: 400 });
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
│   ├── index.ts                    ✅ Updated
│   ├── logger.ts                   ✅ Created
│   └── log-helper.ts               ✅ Created

apps/ibe-app/
├── package.json                    ✅ Updated
├── instrumentation.ts              ✅ Created
├── .env.local                      ✅ Created
└── app/
    ├── page.tsx                    ✅ Updated
    └── api/
        └── test-logs/
            └── route.ts            ✅ Created

apps/top-app/
├── package.json                    ✅ Updated
├── instrumentation.ts              ✅ Created
├── .env.local                      ✅ Created
└── app/
    ├── page.tsx                    ✅ Updated
    └── api/
        └── test-logs/
            └── route.ts            ✅ Created
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

### Problem: Jaeger not running

**Solution:**
```bash
docker-compose up -d
docker ps | grep jaeger
```

### Problem: Port already in use

**Solution:**
- ibe-app: Change port 3000 in package.json and .env
- top-app: Change port 3001 in package.json and .env
- Jaeger: Change ports in docker-compose.yml

---

## What You Now Have

✅ **OTEL Tracing** - Automatic request tracing  
✅ **Structured Logging** - Serializable JSON format  
✅ **Dual Output** - Terminal (color) + Jaeger (spans)  
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