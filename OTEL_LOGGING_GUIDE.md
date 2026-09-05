# 📝 Serializable Logs Guide

This guide explains how structured, serializable logs work in your OTEL setup and how to use them effectively.

## What are Serializable Logs?

Serializable logs are structured JSON logs that:
- Can be converted to strings and sent over the network
- Contain metadata (timestamp, level, context)
- Are automatically correlated with request traces via span events
- Are searchable and queryable in Jaeger
- Appear in both terminal and Jaeger UI

Example log in **terminal**:
```
[INFO] 2026-09-05T13:48:43.020Z api/users - User login successful { 
  userId: 'user123',
  method: 'email',
  duration: '245ms'
}
```

Same log appears in **Jaeger** as:
```
Event: log.info
Attributes:
  log.message: "User login successful"
  log.level: "INFO"
  log.logger: "api/users"
  userId: "user123"
  method: "email"
  duration: "245ms"
```

---

## Setup: Already Implemented ✅

The logging setup is already in your monorepo:

### What's Been Set Up

**`packages/otel/src/logger.ts`**
- Initializes LoggerProvider
- Ready for future log exporter configuration

**`packages/otel/src/log-helper.ts`**
- Dual-output logger (console + span events)
- Methods: `info()`, `error()`, `warn()`, `debug()`
- Automatically correlates with active span
- Flattens nested attributes for Jaeger

**`packages/otel/src/index.ts`**
- Exports `createLogger` function
- Initializes logger on app startup

**Example endpoints:**
- `apps/ibe-app/app/api/test-logs/route.ts`
- `apps/top-app/app/api/test-logs/route.ts`

All dependencies are already installed!

---

## Viewing Logs

### In Terminal

When you run your app with `pnpm dev`, logs appear immediately with color coding:

```bash
pnpm --filter ibe-app dev

# Output shows:
[INFO] 2026-09-05T14:18:20.123Z api/test-logs - GET /api/test-logs called { 
  method: 'GET',
  url: 'http://localhost:3000/api/test-logs'
}
[INFO] 2026-09-05T14:18:20.245Z api/test-logs - Request successful { 
  status: 200,
  dataSize: 87,
  duration: '122ms'
}
```

### In Jaeger

Logs appear as **span events** in traces:

1. Open [http://localhost:16686](http://localhost:16686)
2. Select your service
3. Click "Find Traces"
4. Click on a trace to expand it
5. Scroll down to see "Logs" section with events:
   - `log.info` - Message with attributes
   - `log.error` - Error messages
   - `log.warn` - Warnings
   - `log.debug` - Debug info

---

## Usage: How to Log in Your Apps

The logger is easy to use once set up:

### In API Routes

```typescript
import { createLogger } from "@yourorg/otel";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("api/users");

export async function POST(request: NextRequest) {
  logger.info("User registration attempt", {
    ip: request.ip,
    userAgent: request.headers.get("user-agent"),
  });

  try {
    const body = await request.json();
    // ... process user registration

    logger.info("User registered successfully", {
      userId: "user123",
      email: body.email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("User registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ error: "Registration failed" }, { status: 400 });
  }
}
```

### In Server Components

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("components/dashboard");

export async function DashboardPage() {
  logger.info("Dashboard page loaded");

  const data = await fetchDashboardData();

  logger.info("Dashboard data fetched", {
    itemCount: data.length,
    fetchTime: "123ms",
  });

  return <div>{/* Dashboard content */}</div>;
}
```

### In Middleware

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@yourorg/otel";

const logger = createLogger("middleware/auth");

export function middleware(request: NextRequest) {
  const token = request.headers.get("authorization");

  if (!token) {
    logger.warn("Request without authorization", {
      path: request.nextUrl.pathname,
      method: request.method,
    });
  } else {
    logger.debug("Request authenticated", {
      path: request.nextUrl.pathname,
    });
  }

  return NextResponse.next();
}
```

---

## Viewing Logs in Jaeger

### Step 1: Ensure Logs are Being Sent

Update your app's `.env.local`:

```env
OTEL_SERVICE_NAME=your-app-name
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

> Note: Logs use HTTP endpoint (4318), traces use gRPC (4317). The OTEL SDK handles this automatically.

### Step 2: Make Requests to Your App

```bash
curl http://localhost:3000/api/hello
```

### Step 3: View in Jaeger

1. Open [http://localhost:16686](http://localhost:16686)
2. Select your service name
3. Click **Find Traces**
4. Click on a trace to see details
5. In the trace details, logs should appear alongside spans

---

## Log Levels & Severity

OTEL uses numeric severity levels:

| Level | Number | Usage |
|-------|--------|-------|
| DEBUG | 1 | Detailed debugging info |
| INFO | 2 | General informational messages |
| WARN | 3 | Warning conditions |
| ERROR | 4 | Error conditions |

---

## Best Practices for Serializable Logs

✅ **Always include context attributes** — User ID, request ID, resource names
✅ **Use structured data** — Don't log large objects directly, extract fields
✅ **Include error stack traces** — For exceptions, include the full stack
✅ **Add timing information** — Log duration of operations
✅ **Correlate with traces** — Use the same context across spans and logs
✅ **Avoid sensitive data** — Never log passwords, tokens, or PII

### Example: Good Log Structure

```typescript
logger.info("User login", {
  userId: "user123",        // User identifier
  action: "login",          // What happened
  method: "email",          // How it happened
  duration: 245,            // How long
  ipAddress: "192.168.1.1", // Source
  success: true,            // Result
});
```

### Example: Avoid This

```typescript
// ❌ Bad - too much data
logger.info("User logged in", {
  user: userObject,  // Too large
});

// ❌ Bad - sensitive data
logger.info("Login with credentials", {
  password: "secret123",  // Never log passwords
  apiKey: "sk_live_...",  // Never log secrets
});
```

---

## Sampling Logs (Production)

To avoid overwhelming your logging backend in production:

```typescript
// In packages/otel/src/logger.ts
function shouldLogInProduction(level: LogLevel): boolean {
  // Only log WARN and ERROR in production
  if (process.env.NODE_ENV === "production") {
    return level === "WARN" || level === "ERROR";
  }
  return true;
}
```

Or use environment variables:

```env
# .env.local for development
OTEL_LOGS_EXPORTER_ENABLED=true
OTEL_LOGS_SAMPLE_RATE=1.0  # 100% sampling

# In production
OTEL_LOGS_SAMPLE_RATE=0.1  # 10% sampling
```

---

## Troubleshooting

### ❌ Logs not showing in Jaeger?

**Check:**
1. Restart your app (changes require restart)
2. Make a fresh request to trigger logs
3. Verify Jaeger is running: `docker ps | grep jaeger`
4. In Jaeger, scroll down to find "Logs" section in trace

### ❌ Logs not showing in terminal?

1. Check you're watching the correct terminal window
2. Restart the app: `pnpm --filter your-app-name dev`
3. Make a request to generate logs
4. Logs should appear with `[INFO]`, `[ERROR]`, etc.

### ❌ "Cannot find module '@yourorg/otel'"?

```bash
# From monorepo root
pnpm install
```

---

## How Logs Correlate with Traces

Each log is automatically tied to the active trace:

```
GET /api/users (Main Span - 245ms)
├─ Span Event: log.info
│  └─ Message: "Request started"
│     Timestamp: 0ms
│
├─ Span Event: log.info
│  └─ Message: "Database query executed"
│     Duration: "145ms"
│
└─ Span Event: log.info
   └─ Message: "Response sent"
      Timestamp: 245ms
```

This gives you **complete request flow** in a single trace!

---

## Summary

✅ **Dual output** — Terminal (colored) + Jaeger (span events)  
✅ **Serializable** — Structured JSON format  
✅ **Easy to use** — Simple `logger.info()` API  
✅ **Trace correlation** — Logs tied to request spans  
✅ **Production-ready** — Works with all OTEL backends  

**View your logs in Jaeger at localhost:16686!** 🎯📝