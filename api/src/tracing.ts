import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    })
  : undefined

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "xstreamroll-api",
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs instrumentation generates too much noise for routine file reads
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
})

sdk.start()

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0))
})
