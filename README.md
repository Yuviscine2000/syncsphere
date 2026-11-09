# SyncSphere

SyncSphere is an enterprise collaboration platform featuring authentication,
a dashboard, chat, video calls, file upload, notifications, an admin portal,
and user settings.

## Status

Phase 1 foundation only. This repository currently contains project structure,
configuration, and architecture documentation. No application code has been
scaffolded yet.

## Architecture

The fixed architecture is documented in
[docs/architecture/architecture.md](docs/architecture/architecture.md).

Highlights:

- **Frontend:** Angular 22 standalone, TypeScript, SCSS, Angular Material,
  feature-based architecture, lazy loading, signals and reactive forms.
- **Backend:** Node.js, Express.js, REST APIs, JWT authentication,
  role-based authorization.
- **Data:** MySQL, MongoDB, Redis.
- **Real-time:** Socket.IO, WebRTC, TURN/STUN.
- **Infrastructure:** Docker, PM2, Nginx, AWS.
- **Phase 1:** Enterprise monolithic application, high availability,
  primary data center, disaster recovery.
- **Phase 2 (future only):** Kubernetes, Helm, GitOps.
- **Design:** Green brand identity, light and dark themes, user-selectable
  theme switching.

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

## Getting Started

Application scaffolding and tooling are introduced in later tasks. This
repository intentionally contains no packages or application code yet.
