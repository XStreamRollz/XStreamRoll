#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SDK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${SDK_DIR}/src/generated"
OUTPUT_FILE="${OUTPUT_DIR}/schema.d.ts"

# ── 1. Generate the OpenAPI spec ────────────────────────────────────────────
# Try HTTP endpoint first (fastest when API is already running).
SPEC_JSON=""
API_URL="${1:-http://localhost:3001}"

if command -v curl &>/dev/null; then
  SPEC_JSON=$(curl -sSf --max-time 5 "${API_URL}/docs-json" 2>/dev/null || true)
fi

# Fallback: extract the spec programmatically from the compiled NestJS app.
if [ -z "$SPEC_JSON" ]; then
  echo "API not reachable at ${API_URL}, attempting programmatic extraction …"

  if [ ! -d "${ROOT_DIR}/api/dist" ]; then
    echo "Building API first …"
    cd "${ROOT_DIR}/api" && npm run build 2>/dev/null
  fi

  if [ -f "${ROOT_DIR}/api/dist/app.module.js" ]; then
    SPEC_JSON=$(cd "${ROOT_DIR}/api" && node -e "
      process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/xstreamroll_dev';
      process.env.STREAM_API_KEY = process.env.STREAM_API_KEY || 'dev-key';
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_HEADER_ROLES = '1';

      const { Test } = require('@nestjs/testing');
      const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
      const { AppModule } = require('./dist/app.module');

      async function main() {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        const app = moduleRef.createNestApplication();
        await app.init();
        const config = new DocumentBuilder()
          .setTitle('XStreamRoll API')
          .setVersion('1.0.0')
          .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
          .build();
        const document = SwaggerModule.createDocument(app, config);
        process.stdout.write(JSON.stringify(document));
        await app.close();
      }
      main().catch((e) => { console.error(e.message); process.exit(1); });
    " 2>/dev/null || true)
  fi
fi

if [ -z "$SPEC_JSON" ]; then
  echo ""
  echo "ERROR: Could not generate OpenAPI spec."
  echo ""
  echo "Make sure the API server is running or the API dist is built:"
  echo "  cd api && npm run build"
  echo ""
  echo "Then re-run:"
  echo "  npm run generate:types --workspace=xstreamroll-sdk"
  exit 1
fi

# ── 2. Generate TypeScript types ────────────────────────────────────────────
echo "Generating TypeScript types …"
mkdir -p "${OUTPUT_DIR}"
echo "${SPEC_JSON}" | npx openapi-typescript /dev/stdin --output "${OUTPUT_FILE}"

echo ""
echo "Types written to ${OUTPUT_FILE}"
