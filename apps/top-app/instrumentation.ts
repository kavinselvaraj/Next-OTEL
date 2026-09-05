// Next.js automatically calls the exported `register()` function from this
// file once, when the server instance starts (app router "instrumentation
// hook"). We just delegate to the shared OTEL setup so both apps stay in
// sync.
export { register } from "@yourorg/otel";
