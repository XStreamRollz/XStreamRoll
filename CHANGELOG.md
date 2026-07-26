# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Trivy vulnerability scanning for Docker images (`api`, `app`, `processing`) in CI; scans run on Dockerfile changes and weekly against published `ghcr.io` images, with SARIF reports uploaded to GitHub Code Scanning and the workflow failing on `CRITICAL` findings. Closes #372.
- Dependabot configuration in `.github/dependabot.yml` covering all five `package.json` locations (root, `api`, `app`, `xstreamroll-sdk`, `xstreamroll-processing`), with grouped updates (`@nestjs/*`, `@opentelemetry/*`, React/Next, `@radix-ui/*`), weekly schedules, and auto-merge for patch and security updates via `.github/workflows/dependabot-auto-merge.yml`. Closes #368.
- `.trivyignore` file at the repo root documenting the suppression format and serving as the canonical place for triaged false-positive findings.

### Changed

### Fixed

### Removed

### Security
- Scheduled re-scan of published `ghcr.io/<owner>/xstreamroll-{api,app,processing}:latest` images so newly disclosed CVEs are surfaced outside of release windows. (#372)
