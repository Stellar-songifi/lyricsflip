# Contributing to LyricsFlip 🎶

Thank you for your interest in contributing to LyricsFlip! This document provides guidelines and instructions to help you get started.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Branch Naming Conventions](#branch-naming-conventions)
5. [Commit Message Conventions](#commit-message-conventions)
6. [Pull Request Process](#pull-request-process)
7. [Running Tests](#running-tests)
8. [Coding Standards](#coding-standards)
9. [Claiming Issues](#claiming-issues)
10. [Event Issue Rule](#event-issue-rule)
11. [Getting Help](#getting-help)

---

## Code of Conduct

We're all here to have fun and build something awesome. Treat everyone with respect, even if their code is off-key. We value:
- Respectful communication
- Constructive feedback
- Inclusive collaboration
- Diverse perspectives

---

## Getting Started

### Prerequisites

- **Node.js**: v20.18.0 - v21 (see `.nvmrc`)
- **npm** or **yarn** (npm recommended)
- **Git**
- **PostgreSQL** (for backend)
- **Redis** (optional, for caching/real-time features)

### Repository Overview

LyricsFlip is a monorepo with three main packages:

```
lyricsflip/
├── frontend/          # Next.js + React frontend
├── backend/           # NestJS backend API
├── onchain/           # Stellar Soroban smart contracts
├── ISSUES.md          # Backlog of 125+ scoped issues
├── CONTRIBUTING.md    # This file
└── README.md          # Project overview
```

The mobile app lives in its own repository: [Stellar-songifi/lyricsflip_mobile](https://github.com/Stellar-songifi/lyricsflip_mobile).

---

## Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/Stellar-songifi/lyricsflip.git
cd lyricsflip
npm install
```

The root `package.json` uses workspaces for `frontend` and `backend`.

### 2. Environment Variables

Each package has its own environment configuration:

**Backend** (`backend/.env.development`):
```
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/lyricsflip
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_key
JWT_TOKEN_AUDIENCE=lyricsflip
JWT_TOKEN_ISSUER=lyricsflip
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=7776000
PORT=3000
CORS_ORIGIN=http://localhost:3001
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WALLET_NETWORK=testnet
```

See `backend/.env.example` and `frontend/.env.example` for complete templates.

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install --legacy-peer-deps

# Set up database
npm run migration:run

# (Optional) Seed sample data
npm run seed

# Start development server
npm run start:dev
```

The backend runs on http://localhost:3000 and includes Swagger docs at `/api/docs`.

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend runs on http://localhost:3001.

### 5. Smart Contracts (Optional)

```bash
cd onchain

# See onchain/README.md for contract-specific instructions
```

---

## Branch Naming Conventions

Use descriptive branch names that follow this pattern:

```
<type>/<issue-number>-<short-description>
```

**Types:**
- `feature/` - New feature
- `bugfix/` - Bug fix
- `docs/` - Documentation updates
- `chore/` - Build, CI, or other non-code changes
- `refactor/` - Code refactoring without behavior changes

**Examples:**
```
feature/510-websocket-auth
bugfix/511-fix-imports
docs/534-contributing-guide
refactor/optimize-database-queries
```

**Rules:**
- Always create a new branch; never push directly to `main`
- Use lowercase letters and hyphens (no spaces or underscores)
- Include the issue number if applicable
- Keep descriptions concise but descriptive

---

## Commit Message Conventions

LyricsFlip uses [Conventional Commits](https://www.conventionalcommits.org/) to maintain a clear commit history.

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code refactoring without feature changes
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Build system, dependencies, or other maintenance

**Scopes:**
- `auth` - Authentication & authorization
- `api` - API endpoints
- `db` - Database & migrations
- `ws` - WebSocket connections
- `frontend` - Frontend components
- `backend` - Backend services
- `contracts` - Smart contracts

**Subject:**
- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize first letter
- No period (.) at the end
- Maximum 50 characters

**Examples:**
```
feat(auth): add websocket jwt authentication

fix(api): resolve bare src/ import paths

docs: update contributing guide

test(backend): add websocket guard tests
```

**Commit Message Template:**

Set up the template globally for consistency:

```bash
git config --global commit.template ~/.gitcommit_template
```

Create `~/.gitcommit_template`:
```
# <type>(<scope>): <subject>
#
# <body>
#
# <footer>
# Fix #<issue-number>
```

---

## Pull Request Process

### Before You Start

1. **Check existing PRs** - Make sure your change isn't already being worked on
2. **Reference an issue** - All PRs should reference an issue (see [Claiming Issues](#claiming-issues))
3. **Sync with main** - Ensure your branch is up-to-date: `git pull origin main`

### Opening a PR

1. **Push your branch** (first time):
   ```bash
   git push -u origin feature/510-websocket-auth
   ```

2. **Create PR on GitHub** with this checklist:
   ```markdown
   ## Description
   Brief description of changes.

   Fixes #510

   ## Type of Change
   - [ ] Feature
   - [ ] Bug Fix
   - [ ] Documentation
   - [ ] Refactoring
   - [ ] Performance Improvement

   ## Testing
   - [ ] Unit tests added/updated
   - [ ] Integration tests added/updated
   - [ ] Manual testing completed
   - [ ] Tested on: [browser/OS]

   ## Checklist
   - [ ] Code follows project standards
   - [ ] All tests pass
   - [ ] Commit messages follow conventions
   - [ ] Documentation updated (if needed)
   - [ ] No breaking changes (or documented)
   - [ ] Ready for review
   ```

3. **Address feedback** - Respond to reviewer comments and push updates:
   ```bash
   git add .
   git commit -m "fix: address review feedback"
   git push
   ```

4. **Merge** - Once approved, a maintainer will merge your PR

### PR Guidelines

- **Keep PRs focused** - One feature or fix per PR
- **Small is better** - Aim for < 400 lines per PR if possible
- **Write good descriptions** - Explain what, why, and how
- **Respond promptly** - Reply to feedback within 24-48 hours

---

## Running Tests

### Backend

```bash
cd backend

# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

Tests use Jest and are located alongside source files with `.spec.ts` extension.

### Frontend

```bash
cd frontend

# Run all tests
npm run test

# Run e2e tests
npm run test:e2e
```

### Linting

```bash
# Lint all packages
npm run lint

# Lint specific packages
npm --prefix backend run lint
npm --prefix frontend run lint

# Auto-fix lint issues
npm --prefix backend exec -- eslint --fix src/
npm --prefix frontend exec -- eslint --fix src/
```

---

## Coding Standards

### Backend (NestJS + TypeScript)

**Naming Conventions:**
- Classes: `PascalCase` (e.g., `UserController`, `AuthService`)
- Methods & functions: `camelCase` (e.g., `getUserById`, `verifyToken`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `REQUEST_USER_KEY`, `JWT_SECRET`)
- File names: `kebab-case.ts` (e.g., `user.controller.ts`, `ws-jwt-auth.guard.ts`)

**Module Organization:**
```
src/
├── feature/
│   ├── feature.controller.ts       # Route handlers
│   ├── feature.service.ts          # Business logic
│   ├── feature.module.ts           # Module definition
│   ├── feature.spec.ts             # Tests
│   

/* … truncated 4299 chars — edit only what you need near the top … */
