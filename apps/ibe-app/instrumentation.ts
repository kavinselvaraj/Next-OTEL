// Next.js automatically calls the exported `register()` function from this
// file once per runtime it loads - and once middleware.ts exists, that
// includes the Edge runtime, not just Node.js. @yourorg/otel's register()
// wraps @vercel/otel, which is Node-only (it isn't Edge-safe - importing it
// on Edge throws "Cannot read properties of undefined (reading
// 'attributeCountLimit')" from deep inside its Node-specific SDK setup).
// Gating on NEXT_RUNTIME keeps the Node-only import out of the Edge bundle
// entirely and skips calling it there.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerOtel } = await import("@yourorg/otel");
    registerOtel();
  }
}
