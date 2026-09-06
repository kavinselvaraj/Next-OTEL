# 🚀 Next-OTEL: OpenTelemetry + Logging in Next.js Monorepo

A complete, production-ready implementation of **OpenTelemetry** with **structured logging** in a Next.js pnpm monorepo. Get automatic request tracing and serializable logs visible in both terminal and Jaeger UI.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Next.js](https://img.shields.io/badge/Next.js-14.2-black)
![OTEL](https://img.shields.io/badge/OpenTelemetry-latest-green)

---

## ✨ Features

- ✅ **Automatic Tracing** - All HTTP requests traced automatically
- ✅ **Structured Logging** - Serializable JSON logs with full context (JSON Lines in production)
- ✅ **Dual Output** - Color-coded terminal logs + Jaeger span events
- ✅ **Trace Correlation** - `x-trace-id` response header + trace ID on every log line
- ✅ **Accurate Error Status** - Failed requests marked as errored spans (`recordException`) in Jaeger
- ✅ **OTEL Collector** - Sits between apps and Jaeger so the backend can change without touching app code
- ✅ **Easy API** - Simple `logger.info()`, `logger.error()` etc.
- ✅ **Monorepo Ready** - Shared OTEL package for multiple apps
- ✅ **Jaeger Integration** - View traces and logs together
- ✅ **Production Ready** - Works with any OTEL backend
- ✅ **Zero Setup** - Just follow the guide and go

---

## 🎯 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/kavinselvaraj/Next-OTEL.git
cd Next-OTEL
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Start Jaeger + OTEL Collector
```bash
docker-compose up -d
```
This starts Jaeger and an OTEL Collector in front of it. Apps send traces to
the collector (`localhost:4317`), which batches and forwards them to Jaeger.

### 4. Start Apps

Terminal 1 - ibe-app:
```bash
pnpm --filter ibe-app dev
```

Terminal 2 - top-app:
```bash
pnpm --filter top-app dev
```

### 5. Test Logging

Make requests:
```bash
curl http://localhost:3000/api/test-logs
curl http://localhost:3001/api/test-logs
```

### 6. View Logs

**Terminal:** Color-coded logs appear instantly, tagged with the trace ID
```
[INFO] 2026-09-05T14:27:25.123Z api/test-logs - GET /api/test-logs called (trace=220be882e6353f0d7fafc17730fa5152)
[INFO] 2026-09-05T14:27:25.245Z api/test-logs - Request successful (trace=220be882e6353f0d7fafc17730fa5152)
```

**Response header:** every response carries the same trace ID
```bash
curl -i http://localhost:3000/api/test-logs | grep x-trace-id
```

**Jaeger:** Open [http://localhost:16686](http://localhost:16686)
1. Select service (ibe-app or top-app)
2. Click "Find Traces" (or paste the trace ID directly into the search box)
3. Open a trace and scroll to "Logs" section
4. A failed request shows as a **red/errored span**, not just a log event

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md](OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md)** | ⭐ **START HERE** - Complete step-by-step setup |
| [SSR_CSR_TRACING_DEMO.md](SSR_CSR_TRACING_DEMO.md) | How to verify the correlation-ID demo (`/orders`, `/orders-ssr`) and the `journey_id` multi-page demo (`/flight/*`) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Sequence diagrams, design decisions (including `journey_id`), and a checklist for adopting this in a real project |
| [TRACING_IDS_EXPLAINED.md](TRACING_IDS_EXPLAINED.md) | 🎓 Team onboarding doc — `trace_id`/`traceparent` vs `external_correlation_id` vs `journey_id`, with analogies, diagrams, and hands-on examples |

---

## 🏗️ Project Structure

```
Next-OTEL/
│
├── packages/
│   └── otel/                    # Shared OTEL package
│       ├── src/
│       │   ├── index.ts         # Main exports
│       │   ├── logger.ts        # LoggerProvider setup
│       │   └── log-helper.ts    # createLogger() + getTraceContext()
│       └── package.json
│
├── apps/
│   ├── ibe-app/                 # Example Next.js app 1
│   │   ├── instrumentation.ts   # OTEL hook (uses shared package)
│   │   ├── .env.local           # Config
│   │   ├── app/
│   │   │   ├── page.tsx         # Home page with logging
│   │   │   └── api/test-logs/   # Test endpoint (x-trace-id header)
│   │   └── package.json
│   │
│   └── top-app/                 # Example Next.js app 2
│       ├── instrumentation.ts   # Same as ibe-app
│       ├── .env.local           # Config (port 3001)
│       ├── app/
│       │   ├── page.tsx         # Home page with logging
│       │   └── api/test-logs/   # Test endpoint (x-trace-id header)
│       └── package.json
│
├── otel-collector-config.yaml   # OTLP receiver → batch → Jaeger + debug
├── docker-compose.yml           # jaeger + otel-collector services
├── pnpm-workspace.yaml          # Monorepo config
└── README.md                    # This file
```

---

## 💻 Usage Examples

### Basic Logging

```typescript
import { createLogger } from "@yourorg/otel";

const logger = createLogger("feature-name");

logger.info("Operation started");
// 3rd argument records the exception on the active span (recordException +
// setStatus ERROR), so it shows as a failed span in Jaeger, not just a log:
logger.error("Something went wrong", { context: "extra info" }, error);
logger.warn("Rate limit approaching", { current: 95, limit: 100 });
logger.debug("Debug details", { data: "value" });
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
    const user = await createUser();
    logger.info("User created", {
      userId: user.id,
      duration: `${Date.now() - startTime}ms`
    });
    return NextResponse.json(user);
  } catch (error) {
    const traceId = getTraceContext()?.traceId;

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
  
  const data = await fetchData();
  
  logger.info("Data loaded", {
    itemCount: data.length
  });
  
  return <div>{/* ... */}</div>;
}
```

---

## 🔧 How It Works

### Dual Output System

```
Your Code
    ↓
logger.info("message", { attributes })
    ↓
    ├─→ Console: Colored output (development)
    └─→ Active Span: Event added (Jaeger)
```

### What You Get

1. **Terminal Output** (Immediate):
   - Color-coded by level (INFO=green, ERROR=red, etc.)
   - Structured JSON attributes
   - Real-time feedback during development

2. **Jaeger UI** (Trace Correlation):
   - Logs appear as span events
   - Tied to request traces
   - See full request flow with timing

---

## 📊 Log Levels

| Level | Color | Usage |
|-------|-------|-------|
| **DEBUG** | 🔵 Cyan | Detailed diagnostic info |
| **INFO** | 🟢 Green | General informational messages |
| **WARN** | 🟡 Yellow | Warning conditions |
| **ERROR** | 🔴 Red | Error conditions |

---

## 🚀 Deployment

### Environment Variables

```env
# Development
OTEL_SERVICE_NAME=my-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Production
OTEL_SERVICE_NAME=my-app
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com:4317
```

### Supported Backends

- **Jaeger** - Self-hosted or managed
- **Datadog** - Enterprise APM
- **Honeycomb** - Event analytics
- **New Relic** - Comprehensive monitoring
- **Lightstep** - Distributed tracing
- **AWS X-Ray** - AWS-native tracing

---

## 📦 Technologies

- **Next.js 14** - React framework
- **OpenTelemetry** - Observability standard
- **Jaeger** - Distributed tracing
- **pnpm** - Package manager
- **TypeScript** - Type safety
- **Turbo** - Monorepo tooling

---

## 🎓 Adding to Existing Apps

### Quick Setup (3 Steps)

1. **Add to package.json:**
   ```json
   {
     "dependencies": {
       "@yourorg/otel": "workspace:*"
     }
   }
   ```

2. **Create instrumentation.ts:**
   ```typescript
   export { register } from "@yourorg/otel";
   ```

3. **Create .env.local:**
   ```env
   OTEL_SERVICE_NAME=my-app
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
   ```

Done! ✅

For detailed instructions, see [OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md](OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md)

---

## 🐛 Troubleshooting

### Logs not showing in Jaeger?
- Restart your app (changes require restart)
- Make a fresh request
- Scroll down in trace to find "Logs" section

### "Cannot find module '@yourorg/otel'"?
```bash
pnpm install
```

### Jaeger / collector not accessible?
```bash
docker ps | grep -E "jaeger|otel-collector"
docker-compose up -d
```

### Traces not reaching Jaeger after adding the collector?
```bash
docker logs otel-collector   # look for "Traces" log lines after a request
```
Apps still point at `localhost:4317` — that's correct, the collector owns
that port now and forwards to `jaeger:4317` internally.

See [OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md](OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md#troubleshooting) for more solutions.

---

## 📖 Learning Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [pnpm Workspaces](https://pnpm.io/workspaces)

---

## 🤝 Contributing

This is a reference implementation. Feel free to:
- Fork and adapt to your needs
- Create issues for improvements
- Share with your team

---

## 📝 License

MIT License - Feel free to use this in your projects

---

## 🎯 Next Steps

1. ✅ Read [OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md](OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md)
2. ✅ Follow the step-by-step setup
3. ✅ Add logging to your apps
4. ✅ Monitor with Jaeger
5. ✅ Deploy to production

---

## 📧 Questions?

Check the documentation or review example apps:
- `apps/ibe-app/app/api/test-logs/route.ts` - API logging example
- `apps/ibe-app/app/page.tsx` - Component logging example

---

**Built with ❤️ using OpenTelemetry and Next.js**

Get started now! → [OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md](OTEL_COMPLETE_IMPLEMENTATION_GUIDE.md)