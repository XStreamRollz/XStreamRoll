# XStreamRoll

[![codecov](https://codecov.io/gh/XStreamRollz/XStreamRoll/branch/main/graph/badge.svg)](https://codecov.io/gh/XStreamRollz/XStreamRoll)
[![CI Status](https://github.com/XStreamRollz/XStreamRoll/actions/workflows/ci.yml/badge.svg)](https://github.com/XStreamRollz/XStreamRoll/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)

XStreamRoll is a powerful distributed streaming platform designed for developers and content creators who need real-time data streaming capabilities. The platform provides a complete ecosystem for building, managing, and scaling streaming applications with a modern web interface, robust API backend, client SDKs, and dedicated stream processing infrastructure. It's built for teams looking to deploy production-ready streaming solutions without the complexity of managing multiple disconnected services.

## 📐 Architecture Overview
XStreamRoll is built with scalability in mind. 

```mermaid
flowchart TD
    %% Define Styling
    classDef primary fill:#2563eb,stroke:#1e40af,stroke-width:2px,color:#fff
    classDef secondary fill:#475569,stroke:#334155,stroke-width:2px,color:#fff
    classDef database fill:#059669,stroke:#047857,stroke-width:2px,color:#fff
    classDef external fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff

    %% External Entities
    Sources((External Data\nStreams)):::external
    User((End User)):::external

    %% Application Boundaries
    subgraph XStreamRoll [XStreamRoll System]
    direction TB
        
        %% Packages
        Client[Client Dashboard\nReact / UI]:::primary
        API[API Gateway\nREST / GraphQL]:::primary
        Core[Core Engine\nRolling Aggregation & State]:::primary
        
        %% Data Layer
        subgraph DataLayer [Data Storage]
         Redis[(Redis\nCache & Fast State)]:::database
         Postgres[(PostgreSQL\nPersistent Storage)]:::database
        end
    end

    %% Connections
    Sources -->|Ingests Real-time Data| API
    User -->|Views Dashboard| Client
    Client -->|Queries/Subscribes| API
    
    API -->|Routes Traffic| Core
    Core <-->|Manages State| Redis
    Core <-->|Persists Data| Postgres
    Core -.->|Pushes Updates| Client
   ```

### Installation

1. **Fork/Clone the repository**
   ```bash
   git clone https://github.com/XStreamRollz/XStreamRoll
   cd xstreamroll
   ```

2. **Install all dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   # Create environment files for each service
   cp app/.env.example app/.env
   cp api/.env.example api/.env
   cp xstreamroll-sdk/.env.example xstreamroll-sdk/.env
   cp xstreamroll-processing/.env.example xstreamroll-processing/.env
   ```
   
   Configure the following variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `JWT_SECRET` - JWT signing secret
   - `STREAM_API_KEY` - API key for stream authentication

4. **Set up the database**
   ```bash
   # Import the schema into PostgreSQL
   psql -d your_database_name -f database/schema.sql
   ```

5. **Start the development environment**
   ```bash
   # Start all services concurrently
   npm run dev
   
   # Or start individual services
   npm run dev:app    # Frontend on http://localhost:3000
   npm run dev:api    # API on http://localhost:3001
   ```
The application should now be running at `http://localhost:3000`.

## 📦 Package Breakdown
This repository contains the following core packages:

| Package | Description |
|---------|-------------|
| `core` | The main processing engine and state management. |
| `api` | REST/GraphQL API endpoints for external integrations. |
| `client` | Frontend dashboard for monitoring streams. |

*For a full list, see [REPOSITORIES.md](./REPOSITORIES.md).*

## 🛠️ Technology Stack

| Category | Technology |
|----------|------------|
| **Language** | TypeScript / Node.js |
| **Framework** | [e.g., Express / NestJS / React] |
| **Database** | [e.g., PostgreSQL / Redis] |
| **Tooling** | ESLint, Prettier, Jest |

## 📖 API Documentation
Once the local server is running, you can access the full OpenAPI/Swagger documentation at:
👉 **`http://localhost:3000/docs`**

## 💻 Development Workflow
We use standard scripts for our development lifecycle:
* `npm run lint` - Run code formatting and linting.
* `npm run test` - Execute unit and integration tests.
* `npm run build` - Compile TypeScript to production-ready JavaScript.

## 🚢 Deployment
Deployments are handled automatically via GitHub Actions. Pushing to the `main` branch triggers the CI/CD pipeline which builds the Docker images and deploys them to our staging environment.

### Testing

```bash
# Run tests for all services
npm run test

# Run tests for specific services
npm run test:app
npm run test:api
npm run test:sdk
```

### Network Configuration

The platform uses the following default ports:
- Frontend: `3000`
- API Backend: `3001`
- Stream Processing: `3002`

Ensure these ports are available in your environment or update the environment variables accordingly.

## Helpful Links

- **Repository Structure**: See `REPOSITORIES.md` for detailed service documentation
- **API Documentation**: Available at `http://localhost:3001/docs` when API is running
- **SDK Documentation**: See `xstreamroll-sdk/README.md` for integration examples
- **Contribution Guidelines**: See `CONTRIBUTING.md` for development practices
- **Issue Tracking**: Use GitHub Issues for bug reports and feature requests

## Tech Stack

- **Frontend**: Next.js 16 with TypeScript, Tailwind CSS, Radix UI
- **Backend**: NestJS with TypeScript, Express, WebSockets
- **SDK**: TypeScript with modern build tools
- **XStreamRoll Processing**: Node.js with TypeScript, event-driven architecture
- **Database**: PostgreSQL with optimized streaming schemas
- **Development**: npm workspaces, ESLint, Prettier, Husky

## 🤝 Contributing
We welcome contributions! Please read our guidelines before submitting a Pull Request:
* [CONTRIBUTING.md](./CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
* [SECURITY.md](./SECURITY.md)

## 📄 License
This project is licensed under the terms found in the [LICENSE](./LICENSE) file.
