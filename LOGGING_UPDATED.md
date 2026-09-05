# 📝 Logging Implementation: Serializable Logs in Jaeger

## How It Works

Our logging solution provides **dual output**:
1. **Terminal/Console** - Structured, color-coded logs for development
2. **Jaeger UI** - Logs appear as span events in traces

This gives you:
- ✅ Real-time development feedback in terminal
- ✅ Trace correlation in Jaeger UI
- ✅ Serializable JSON format
- ✅ Full span context and timing
- ✅ Production-ready logging

## Viewing Logs in Jaeger

### Step 1: Start Everything

```bash
# Terminal 1: Jaeger
docker-compose up -d

# Terminal 2: ibe-app
pnpm --filter ibe-app dev

# Terminal 3: top-app
pnpm --filter top-app dev
```

### Step 2: Generate Logs

Make requests to trigger logs:
```bash
curl http://localhost:3000/api/test-logs
curl http://localhost:3001/api/test-logs
```

### Step 3: View in Jaeger UI

1. Open [http://localhost:16686](http://localhost:16686)
2. Select **ibe-app** or **top-app** in the Service dropdown
3. Click **Find Traces**
4. Click on a `/api/test-logs` trace to expand it
5. **Scroll down to see "Logs" section** with events like:
   - `log.info: "GET /api/test-logs called"`
   - `log.info: "Request successful"`
6. Each log event shows:
   - **Time** - When it occurred
   - **Message** - What was logged
   - **Attributes** - Context data (method, status, duration, etc.)

### Terminal Output

At the same time, in your terminal you'll see:

```
[INFO] 2026-09-05T14:18:20.123Z api/test-logs - GET /api/test-logs called { 
  method: 'GET',
  url: 'http://localhost:3000/api/test-logs',
  userAgent: 'Mozilla/5.0...'
}

[INFO] 2026-09-05T14:18:20.245Z api/test-logs - Request successful { 
  status: 200,
  dataSize: 87,
  duration: '122ms'
}
```

---

## Dual Output Format

### Terminal Output

Each log line:
```
[LEVEL] TIMESTAMP LOGGER_NAME - MESSAGE { attributes }
```

| Part | Example | Description |
|------|---------|-------------|
| **LEVEL** | INFO, ERROR, WARN, DEBUG | Color-coded severity |
| **TIMESTAMP** | 2026-09-05T14:18:20.123Z | ISO 8601 format |
| **LOGGER_NAME** | api/test-logs | Module identifier |
| **MESSAGE** | "Request successful" | What happened |
| **ATTRIBUTES** | {status: 200, duration: "122ms"} | Structured context |

### Jaeger Output

In Jaeger, logs appear as **span events** with:
- **Event name**: `log.info`, `log.error`, `log.warn`, `log.debug`
- **Timestamp**: When the log was emitted
- **Attributes**:
  - `log.message` - The log message
  - `log.level` - The severity level
  - `log.logger` - The logger name
  - Custom attributes (flattened with dot notation)

---

## Color Coding (Terminal Only)

Terminal output uses colors for quick scanning:

- 🔵 **[DEBUG]** = Cyan (detailed info)
- 🟢 **[INFO]** = Green (normal operation)
- 🟡 **[WARN]** = Yellow (warnings)
- 🔴 **[ERROR]** = Red (errors)

---

## Usage Examples

### In API Routes

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("api/users");

export async function POST(request: NextRequest) {
  logger.info("User creation started");

  try {
    const user = await createUser(body);
    
    logger.info("User created successfully", {
      userId: user.id,
      email: user.email,
      duration: "245ms",
    });
    
    return NextResponse.json(user);
  } catch (error) {
    logger.error("User creation failed", {
      error: error.message,
      code: error.code,
      stack: error.stack,
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
  
  const data = await fetchData();
  
  logger.info("Data loaded", {
    itemCount: data.length,
    loadTime: "156ms",
  });
  
  return <div>{/* ... */}</div>;
}
```

### In Middleware

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("middleware/auth");

export function middleware(request: NextRequest) {
  const isAuthenticated = !!request.headers.get("authorization");
  
  if (!isAuthenticated) {
    logger.warn("Unauthenticated request", {
      path: request.nextUrl.pathname,
      method: request.method,
    });
  } else {
    logger.debug("Authenticated request", {
      path: request.nextUrl.pathname,
    });
  }
  
  return NextResponse.next();
}
```

---

## Serializable Format

All logs are in **serializable JSON format**:

```json
{
  "timestamp": "2026-09-05T14:18:20.123Z",
  "level": "INFO",
  "logger": "api/test-logs",
  "message": "Request successful",
  "attributes": {
    "status": 200,
    "dataSize": 87,
    "duration": "122ms"
  }
}
```

This can be:
- Parsed by log aggregators (Datadog, ELK, Splunk, etc.)
- Stored in databases
- Analyzed and searched
- Correlated with traces via timestamps

---

## Integration with Log Aggregators

### For Production: Use a Log Aggregator

To send these logs to a service like Datadog, you'd add a log collector:

```yaml
# datadog-agent.yaml
logs:
  - type: file
    path: /var/log/app.log
    service: my-app
    source: nodejs
```

Or capture from stdout:
```yaml
logs:
  - type: docker
    service: my-app
    source: nodejs
```

---

## How Logs Appear in Jaeger

Each log call adds a **span event** to the active trace:

1. **Traces are created** for each request (existing behavior)
2. **Span events are added** when you call `logger.info()`, `logger.error()`, etc.
3. **Events appear in Jaeger** showing:
   - Time within the trace
   - Log message
   - Log attributes
   - Correlation with request spans

This provides **complete observability**:
- See request flow in spans
- See log messages as events within spans
- Correlate timing between operations and logs

---

## Best Practices

✅ **Always log operation start and end**
```typescript
logger.info("Processing started");
// ... do work ...
logger.info("Processing completed", { duration: "245ms" });
```

✅ **Include relevant context**
```typescript
logger.error("Database query failed", {
  query: "SELECT * FROM users",
  error: err.message,
  duration: "5000ms",
});
```

✅ **Use appropriate levels**
```typescript
logger.debug("Cache hit");        // Detailed info
logger.info("User logged in");    // Normal operation
logger.warn("Retry attempt 2/3"); // Potential issues
logger.error("Connection lost");  // Actual errors
```

❌ **Avoid logging sensitive data**
```typescript
// ❌ Never do this:
logger.info("User login", { password: "secret123" });

// ✅ Do this instead:
logger.info("User login", { userId: "123", method: "email" });
```

---

## Troubleshooting

### Logs not showing in Jaeger?

1. **Restart your app** - Changes to log-helper.ts require app restart
2. **Make a fresh request** - Logs only appear in new traces
3. **Check the Logs section** - Scroll down in span details to find "Logs"
4. **Verify Jaeger is running** - `docker ps | grep jaeger`

### Terminal logs not showing?

1. Check you're looking at the correct terminal where `pnpm dev` runs
2. Restart the app: `pnpm --filter ibe-app dev`
3. Make a request: `curl http://localhost:3000/api/test-logs`

### Want to store logs to file?

```bash
pnpm --filter ibe-app dev | tee app.log
```

### Want to grep/search logs?

```bash
# Show only errors
pnpm --filter ibe-app dev 2>&1 | grep ERROR

# Show only specific logger
pnpm --filter ibe-app dev 2>&1 | grep "api/users"
```

---

## Architecture Overview

```
Your App Code
    ↓
logger.info("message", { attributes })
    ↓
Dual Output:
├─ Terminal: Color-coded console log
└─ Jaeger: Span event with attributes
    ↓
Development: View in terminal for quick feedback
Production: View in Jaeger for trace correlation
```

---

## Summary

✅ **Dual logging** - Console + Jaeger span events  
✅ **Serializable** - JSON format for all attributes  
✅ **Color-coded terminal** - Easy debugging  
✅ **Trace correlation** - Logs appear in request traces  
✅ **Production-ready** - Works with distributed systems  

**Logs visible in Jaeger!** 🎯📝