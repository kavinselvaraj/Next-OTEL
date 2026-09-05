# ✅ Logging Implementation Complete

## What Was Added

### 1. Shared OTEL Package (`packages/otel/`)

**New dependencies added to package.json:**
```json
"@opentelemetry/sdk-logs": "^0.52.0",
"@opentelemetry/exporter-logs-otlp-http": "^0.52.0"
```

**New files created:**

#### `packages/otel/src/logger.ts`
- Initializes OTEL LoggerProvider
- Exports `getLogger()` function
- Ready for future log exporter integration

#### `packages/otel/src/log-helper.ts`
- Easy-to-use logger wrapper
- Provides methods: `info()`, `error()`, `warn()`, `debug()`
- **Dual output:**
  - 🖥️ **Console**: Color-coded structured logs
  - 📊 **Jaeger**: Span events with all attributes
- Automatically flattens nested attributes
- Correlates logs with active span
- Exports `createLogger()` function

#### `packages/otel/src/index.ts`
- Updated to export logger functions
- Initializes logger provider on app startup
- Exports: `getLogger`, `createLogger`, types

### 2. Example API Routes

#### `apps/ibe-app/app/api/test-logs/route.ts`
- Example GET endpoint that logs
- Demonstrates: info logs, error handling, timing
- Test endpoint at `http://localhost:3000/api/test-logs`

#### `apps/top-app/app/api/test-logs/route.ts`
- Same as above for top-app
- Test endpoint at `http://localhost:3001/api/test-logs`

### 3. Updated Pages

#### `apps/ibe-app/app/page.tsx`
- Added logging to home page
- Includes links to test logging
- Instructions for viewing in Jaeger

#### `apps/top-app/app/page.tsx`
- Same as ibe-app for top-app
- Instructions for viewing in Jaeger

---

## How to Test

### Step 1: Start Jaeger
```bash
docker-compose up -d
```

### Step 2: Start Your Apps

Terminal 1:
```bash
pnpm --filter ibe-app dev
```

Terminal 2:
```bash
pnpm --filter top-app dev
```

You'll see color-coded logs in the terminal immediately.

### Step 3: Generate Logs

Make a request:
```bash
curl http://localhost:3000/api/test-logs
```

Or visit in browser:
- `http://localhost:3000/api/test-logs` (ibe-app)
- `http://localhost:3001/api/test-logs` (top-app)

You'll see logs appear in **both places**:

**Terminal:**
```
[INFO] 2026-09-05T14:27:25.123Z api/test-logs - GET /api/test-logs called
[INFO] 2026-09-05T14:27:25.245Z api/test-logs - Request successful
```

**Jaeger:** (see Step 4)

### Step 4: View Logs in Jaeger

1. Open [http://localhost:16686](http://localhost:16686)
2. Select service: `ibe-app` or `top-app`
3. Click **Find Traces**
4. Click on a `/api/test-logs` trace
5. **Scroll down to "Logs" section** - you'll see:
   - `log.info: "GET /api/test-logs called"` with attributes
   - `log.info: "Request successful"` with attributes
6. Click on a log event to see full details

---

## Usage in Your Code

### Basic Usage

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("feature/name");

// Info log
logger.info("User logged in", {
  userId: "123",
  method: "email",
});

// Error log
logger.error("Database error", {
  error: error.message,
  query: "SELECT * FROM users",
});

// Warn log
logger.warn("Rate limit approaching", {
  current: 95,
  limit: 100,
});

// Debug log
logger.debug("Processing request", {
  step: "validation",
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
    // ... create user
    
    logger.info("User created", {
      userId: "123",
      duration: `${Date.now() - startTime}ms`,
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("User creation failed", {
      error: error instanceof Error ? error.message : String(error),
      duration: `${Date.now() - startTime}ms`,
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
  logger.info("Dashboard page rendering");

  const data = await fetchData();

  logger.info("Dashboard data loaded", {
    itemCount: data.length,
  });

  return <div>{/* ... */}</div>;
}
```

---

## File Structure

```
packages/otel/
├── src/
│   ├── index.ts           ✅ Updated - exports logger
│   ├── logger.ts          ✅ Created - OTEL setup
│   └── log-helper.ts      ✅ Created - Easy-to-use wrapper
└── package.json           ✅ Updated - added dependencies

apps/ibe-app/
├── app/
│   ├── page.tsx           ✅ Updated - logging demo
│   └── api/
│       └── test-logs/
│           └── route.ts   ✅ Created - example endpoint
└── instrumentation.ts     (unchanged)

apps/top-app/
├── app/
│   ├── page.tsx           ✅ Updated - logging demo
│   └── api/
│       └── test-logs/
│           └── route.ts   ✅ Created - example endpoint
└── instrumentation.ts     (unchanged)
```

---

## Log Levels

| Level | Use For |
|-------|---------|
| **DEBUG** (1) | Detailed diagnostic information |
| **INFO** (2) | General informational messages |
| **WARN** (3) | Warning conditions, potential issues |
| **ERROR** (4) | Error conditions, failures |

---

## Next Steps

1. ✅ Test the example endpoints
2. ✅ View logs in Jaeger UI
3. Add logging to your API routes and components
4. Add logging to database queries
5. Add logging to external API calls
6. Set up log sampling for production

---

## How Logs Work

### The Flow

```
logger.info("message", { attributes })
           ↓
    ┌──────┴──────┐
    ↓             ↓
 Terminal      Active Span
   ↓             ↓
Colored Log    Span Event
              (Jaeger)
```

1. **Console Output**: Immediately visible in terminal
   - Color-coded by level
   - Includes timestamp and logger name
   - Shows all attributes

2. **Span Event**: Added to current trace in Jaeger
   - Event name: `log.{level}` (e.g., `log.info`)
   - Attributes include message, level, logger, custom data
   - Flattened for easy searching

---

## Troubleshooting

### Logs not showing in Jaeger?

1. **Restart your app** (required after code changes):
   ```bash
   pnpm --filter your-app-name dev
   ```

2. **Make a fresh request**:
   ```bash
   curl http://localhost:3000/api/test-logs
   ```

3. **Check Jaeger is running**:
   ```bash
   docker ps | grep jaeger
   ```

4. **Look in correct place**:
   - Open trace in Jaeger
   - **Scroll down** to find "Logs" section
   - Click log events to see attributes

### Logs not showing in terminal?

1. Check you're watching the correct terminal window
2. Restart the app: `pnpm --filter your-app-name dev`
3. Make a request to trigger logs
4. Logs should appear immediately with `[INFO]`, `[ERROR]`, etc.

### "Cannot find module '@yourorg/otel'"?

```bash
# From monorepo root
pnpm install
```

### Color not showing in terminal?

Some terminals don't support ANSI colors. The logs still work, just without colors. Try:
- Windows: Use PowerShell or Windows Terminal instead of CMD
- Linux/Mac: Standard terminal should show colors
- VS Code: Terminal should show colors by default

---

## Dependencies Added

- `@opentelemetry/sdk-logs@^0.52.0` - OTEL logging SDK
- `@opentelemetry/exporter-logs-otlp-http@^0.52.0` - HTTP exporter (for future use)

No breaking changes - fully backward compatible with existing traces!

---

## What's Working ✅

✅ Logs visible in **terminal** with color coding  
✅ Logs visible in **Jaeger** as span events  
✅ Logs are **serializable JSON**  
✅ Logs **correlated with traces**  
✅ Works across **all apps in monorepo**  
✅ **Production-ready**

---

**Happy logging!** 📝🎯