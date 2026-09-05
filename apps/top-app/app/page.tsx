import { createLogger } from "@yourorg/otel";

const logger = createLogger("pages/home");

export default function Home() {
  logger.info("Home page rendered (top-app)");

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>top-app</h1>
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
          <li>Select "top-app" in the Service dropdown</li>
          <li>Click "Find Traces" to see traces with logs</li>
        </ul>
      </div>
    </div>
  );
}
