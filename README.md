# XStreamRoll

[![codecov](https://codecov.io/gh/XStreamRollz/XStreamRoll/branch/main/graph/badge.svg)](https://codecov.io/gh/XStreamRollz/XStreamRoll)

XStreamRoll is a powerful distributed streaming platform designed for developers and content creators who need real-time data streaming capabilities. The platform provides a complete ecosystem for building, managing, and scaling streaming applications with a modern web interface, robust API backend, client SDKs, and dedicated stream processing infrastructure. It's built for teams looking to deploy production-ready streaming solutions without the complexity of managing multiple disconnected services.

## Repository Structure

- **app/** - Next.js frontend application with modern UI components
- **api/** - NestJS backend server with REST API and WebSocket support
- **xstreamroll-sdk/** - TypeScript client SDK for easy integration
- **xstreamroll-processing/** - Node.js stream processing worker for real-time data handling
- **database/** - PostgreSQL schema and migrations

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- Git

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

## Development

XStreamRoll is designed as a production-ready platform with comprehensive type safety, modern development practices, and scalable architecture. Each service is containerized and can be deployed independently or as part of the complete platform ecosystem. The codebase follows TypeScript best practices and includes extensive documentation for easy onboarding.
