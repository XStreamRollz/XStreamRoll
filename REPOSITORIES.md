# XStreamRoll - Repository Structure

This project is organized as a monorepo with 4 main services:

## 1. Web Frontend (`/app`)
- **Framework**: Next.js 16 with TypeScript
- **Description**: User-facing web application for the Stellar Streaming platform
- **Setup**: 
  ```bash
  cd app
  npm install
  npm run dev
  ```

## 2. API Backend (`/api`)
- **Framework**: NestJS with TypeScript
- **Description**: REST API server handling all business logic and data operations
- **Setup**:
  ```bash
  cd api
  pnpm install
  pnpm run dev
  ```

## 3. Streaming SDK (`/xstreamroll-sdk`)
- **Framework**: TypeScript SDK
- **Description**: Client library for publishing events and interacting with streams
- **Setup**:
  ```bash
  cd xstreamroll-sdk
  npm install
  npm run build
  ```

## 4. Stream Processing (`/xstreamroll-processing`)
- **Framework**: Node.js with TypeScript
- **Description**: Dedicated service for processing real-time streaming data
- **Setup**:
  ```bash
  cd xstreamroll-processing
  npm install
  npm run start
  ```

## 5. Database (`/database`)
- **Type**: PostgreSQL
- **Description**: SQL schema and migrations for the platform
- **Setup**: Import `schema.sql` into your PostgreSQL instance

## Monorepo Management

This project uses npm workspaces at the repo root. The `api/` package also
commits a `pnpm-lock.yaml`, so direct package work there should use `pnpm`
while the other packages use `npm`. Available root scripts:

```bash
# Install all dependencies for all services
npm run install:all

# Start both app and api concurrently
npm run dev

# Start individual services
npm run dev:app
npm run dev:api

# Build all services
npm run build
```

## Getting Started

1. Clone this repository
2. Install all dependencies: `npm run install:all`
3. Set up each service according to the setup instructions above
4. Ensure all services are running on their respective ports
5. Web frontend typically runs on `http://localhost:3000`
6. API backend typically runs on `http://localhost:3001`
7. Stream processing worker starts automatically

## Environment Variables

Each service has its own `.env` file. Create these files based on the structure of the service before running.
