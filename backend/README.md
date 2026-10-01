# SG backend

An ASP.NET Core 10 Minimal API using Entity Framework Core and PostgreSQL.
Start with the [repository setup guide](../README.md).

## Where things live

```text
backend/
  Sg.slnx                         Solution opened by C# Dev Kit
  src/Sg.Api/
    Program.cs                    Configuration, services, and HTTP pipeline
    Features/Projects/            Project model and public read endpoint
    Data/AppDbContext.cs          Database mapping
    Data/Migrations/              Versioned database schema and initial content
    Health/                       Database readiness check
  tests/Sg.Api.Tests/              HTTP integration tests using real PostgreSQL
```

The flow is: React requests `/api/projects`, the endpoint queries `AppDbContext`,
EF Core reads PostgreSQL, and ASP.NET Core returns JSON. Database credentials stay
in the backend. Response records define what is returned to the browser.

## Endpoints

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/projects` | JSON array of `{ id, title, description, tags }`, sorted by title and ID |
| GET | `/api/health` | `200 Healthy` when the Projects table is readable; `503 Unhealthy` otherwise |

An empty database table returns `[]`. Unhandled failures return generic Problem
Details JSON; server logs retain diagnostics. There are no write endpoints in
this milestone. All content stored in Projects is currently public.

## Database changes

The initial migration also inserts the existing Three.js portfolio project.
Applying migrations repeatedly does not insert duplicates. The API does not change
the schema automatically when it starts; the VS Code preparation task explicitly
runs the migration command first.

After deliberately changing the model, run from the repository root:

```sh
dotnet tool restore
dotnet ef migrations add DescribeYourChange --project backend/src/Sg.Api --output-dir Data/Migrations
npm run db:migrate
```

Review and commit the generated migration and model snapshot with your code.
Run `npm run test:backend` to check migrations against fresh PostgreSQL databases.
The initial project is model-managed seed data; replacing it with admin-managed
content will be a deliberate migration in the accounts/admin milestone.

## Configuration

In Development only, `appsettings.Development.local.json` supplies the local
connection string. Environment variables and command-line arguments override it.
`npm run setup:dev` creates this ignored file and Docker's ignored `.env` file.

The local database is bound to `127.0.0.1:54329`, with a persistent named Docker volume.
Use `npm run db:stop` when finished. Stopping or recreating the container preserves
the named volume; deleting the volume deletes the development data.

For a future hosted deployment, provide `ConnectionStrings__AppDatabase` and
`AllowedHosts` through the host's configuration/secrets system. Run reviewed
migrations as a deployment step. Serve HTTPS and route `/api` to this application
under the frontend's public origin. The checked-in launch profile and Compose
configuration are for local development, not a production deployment.

## Tests

```sh
dotnet test backend/Sg.slnx
```

Docker must be running. Each integration test gets a fresh PostgreSQL container
with a generated password. Tests cover initial migration/seed data, repeated
migrations, data surviving application restarts, empty results, database readiness,
safe failure responses, and rejection of unsupported write requests.
