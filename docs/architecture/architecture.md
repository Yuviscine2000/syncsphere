# SyncSphere Architecture

> Fixed architecture reference. This document defines the approved technology
> choices and structure for SyncSphere. It must not be changed without
> Architect approval.

## Overview

SyncSphere is an enterprise collaboration platform delivered in phases.
Phase 1 is an enterprise monolithic application. Phase 2 (future only)
introduces container orchestration and GitOps.

## Frontend

- Angular 22 (Standalone components)
- TypeScript and SCSS
- Angular Material
- Feature-based architecture
- Lazy loading
- Signals and Reactive Forms

## Backend

- Node.js
- Express.js
- REST APIs
- JWT authentication
- Role-based authorization

## Data

- MySQL
- MongoDB
- Redis

## Real-time

- Socket.IO
- WebRTC
- TURN/STUN

## Infrastructure

- Docker
- PM2
- Nginx
- AWS

## Deployment Phases

### Phase 1

- Enterprise monolithic application
- High Availability
- Primary Data Center
- Disaster Recovery

### Phase 2 (future only)

- Kubernetes
- Helm
- GitOps

## Application Features

- Authentication
- Dashboard
- Chat
- Video Calls
- File Upload
- Notifications
- Admin Portal
- Settings

## Design

- Green brand identity
- Light and Dark themes
- User-selectable theme switching

## Repository Layout

```text
syncsphere/
├── client/           # Angular 22 standalone frontend (feature-based)
├── server/           # Node.js + Express REST API
├── infrastructure/   # Docker, Nginx, PM2, AWS deployment assets
├── scripts/          # Build, deploy, and maintenance scripts
├── docs/             # Project documentation
│   └── architecture/ # Architecture references
├── .editorconfig
├── .gitattributes
├── .gitignore
└── README.md
```

## Status

Phase 1 foundation. No application code has been scaffolded yet.
