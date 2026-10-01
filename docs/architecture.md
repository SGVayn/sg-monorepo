# Architecture

## Repository

SG is a monorepo with separate `frontend/` and `backend/` applications. Browser-facing concerns belong in the frontend; database access and security enforcement belong in the backend.

## Current technology

### Frontend

- React 19
- TypeScript 6
- Node.js 24.20.0
- Vite 8
- React Router 7
- ESLint 10
- Vitest 4 with jsdom and React Testing Library
- pnpm 11.24.0 lockfile

### Backend

- ASP.NET Core 10 Minimal API, written in C#.
- One API application, grouped by feature; no separate services are needed at this stage.
- .NET SDK pinned in `global.json`; NuGet dependency versions locked per project.
- Explicit EF Core migrations, standard Problem Details error responses, and a database readiness endpoint.
- xUnit HTTP integration tests with disposable PostgreSQL containers.

### Database

- PostgreSQL 17 for both local development and integration tests.
- Entity Framework Core 10 with the Npgsql provider.
- Local Docker Compose service with persistent storage and a loopback-only port.
- Generated development credentials in ignored local files.
- Initial Projects model: ID, title, description, and tags. All projects are public in this milestone.

### Authentication

Planned for a later milestone: ASP.NET Core Identity, browser cookies, CSRF protection,
and backend-enforced user/admin permissions. Not implemented yet; the API only
exposes public reads. Public registration and write endpoints require the account
and authorization work first.

### File and media storage

Planned: object storage for uploaded files, with ownership and metadata in PostgreSQL.
The provider remains undecided. Uploads, media processing, and the forum are not
part of the initial implementation.

## Architectural decisions

Significant choices such as backend framework, API design, database, authentication, storage, and deployment should be evaluated and documented deliberately. Do not introduce them implicitly while implementing an unrelated feature.

The first milestone implements React -> API -> PostgreSQL through the Projects page.
Vite proxies `/api` to the backend during development and preview. A future production
host should provide the same routing under a single public origin. Database changes
are explicit migration commands, including in the VS Code startup task; starting
the API itself never applies schema changes.

Later milestones are accounts/admin editing, admin image uploads, other media,
and a moderated forum. Hosting-provider selection and public deployment remain
separate work.
