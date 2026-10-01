# SG

React frontend and ASP.NET Core backend in one VS Code workspace.

- `frontend/`: React, TypeScript, and Vite.
- `backend/`: ASP.NET Core API, PostgreSQL migrations, and integration tests.
- `docs/architecture.md`: technology decisions and future milestones.

## Prerequisites

- Node **24.20.0** (see `.nvmrc`), with Corepack. The frontend pins pnpm **11.24.0**.
- .NET SDK **10.0.401** or a later patch in that SDK feature band (see `global.json`).
- Docker Desktop, running Linux containers with the WSL 2 engine on Windows.
- VS Code with Microsoft's **C# Dev Kit** extension.

You do not need to install PostgreSQL separately. Docker runs it for this project.
After installing tools, fully restart VS Code so its terminal picks up the new PATH.

Open **the `sg` folder** in VS Code so the repository's tasks and debugging settings are available.

## First-time setup

Run these commands from the `sg` folder. On Windows PowerShell, use `npm.cmd` and
`corepack.cmd` if your execution policy blocks their `.ps1` wrappers.

```sh
cd frontend
corepack pnpm install --frozen-lockfile
cd ..
dotnet restore backend/Sg.slnx --locked-mode
dotnet tool restore
```

The startup script below handles local configuration and the database for you.
Its `setup:dev` step creates a random database password in `.env` and a matching connection
string in `backend/src/Sg.Api/appsettings.Development.local.json`. Both files are
ignored by Git. Re-running setup preserves existing matching settings and data.
Keep these files while using the database volume: its password is set when the
volume is first created, and regenerating a different password does not change it.

The first Docker start downloads PostgreSQL. The first migration creates the
Projects table and inserts the project's existing portfolio example.

## How to start everything needed to run the app locally

Complete [First-time setup](#first-time-setup) once after cloning the repository.
Then follow these steps whenever you want to work on the app, including after restarting your PC.

The app needs three things running:

| Component | What it does | Where it runs |
| --- | --- | --- |
| PostgreSQL database | Stores your projects | Docker Desktop, container `sg-db-1` |
| ASP.NET Core backend | Reads the database and serves the API | `http://localhost:5080` |
| Vite frontend | Serves the React website | `http://localhost:5173` |

### Start everything with one command

Open **`C:\Repos\sg`** in VS Code (or wherever you cloned it). In its PowerShell
terminal, run:

```powershell
npm.cmd run dev
```

On other shells, use `npm run dev`. Both run [scripts/dev.mjs](scripts/dev.mjs).
You can also run the script directly with `node scripts/dev.mjs`.

Windows PowerShell and Git Bash are both supported. The scripts look for Docker
on PATH and in Docker Desktop's standard per-user and system-wide Windows
installation folders. An older terminal does not need its PATH updated for Docker;
the scripts also make Docker's credential helper available to their child processes.
This applies to startup, `db:up`, `db:stop`, and the VS Code database tasks.

The script:

1. Checks that the frontend dependencies and .NET SDK are available, and that
   ports 5080 and 5173 are free.
2. Starts Docker Desktop if its engine is not running on Windows or macOS, then
   checks that Docker uses Linux containers. On Linux, start the Docker engine first.
3. Creates local configuration if needed, starts PostgreSQL, and waits for it to be ready.
4. Applies pending database migrations.
5. Runs the backend and frontend together, with automatic reload when you edit code.
6. Checks the API and the frontend's connection to it, then prints
   **`[SG] Ready: http://localhost:5173/projects`**.

Open **http://localhost:5173/projects** once that ready message appears. Keep this
one terminal running while you use the app. Both servers' logs appear there.
Vite forwards requests under `/api` to the backend.

If a startup step fails, the script reports the error and stops any development
processes it started. It also stops the other server if either server exits.
Database data is preserved.

### Alternative: use the VS Code task

Choose **Terminal > Run Task > SG: Start development** to run the same script.
Open the whole `sg` folder so VS Code can find the task. Use either the command
or the task, not both at once.

### Check that everything is working

In a separate PowerShell terminal, run:

```powershell
Invoke-RestMethod http://localhost:5080/api/health
Invoke-RestMethod http://localhost:5080/api/projects
```

The first command should return `Healthy`, confirming that the backend can read the
database. The second should return the example project's details. Docker Desktop's
Containers screen should show the `sg` group with its database container running.

If `dotnet` is not recognised after installation, fully close and reopen VS Code.
If Docker was installed in a custom folder and cannot be found, add that installation's
`resources/bin` folder to PATH and reopen VS Code. If startup reports that a port is already in use,
stop the previous frontend or backend task before starting another one.
If automatic Docker startup fails, open Docker Desktop manually, wait for its
engine to be ready, then run the command again.

### Debug the backend

To debug C#, use **Run and Debug > SG: Debug backend and open site**, then press
**F5**. This starts the database and frontend, builds the API, and launches the API
under the debugger. Set a breakpoint in
`backend/src/Sg.Api/Features/Projects/ProjectEndpoints.cs`, then refresh Projects.
Use either the debugging configuration or Start development; stop an already-running
backend first so both don't try to use port 5080.

### Stop everything when finished

1. Press **Ctrl+C** in the startup terminal. The script stops both servers and their
   child processes. If Windows asks **Terminate batch job (Y/N)?**, enter **Y**.
   For the VS Code task, you can also use **Terminal > Terminate
   Task > SG: Start development**. If using the separate debugging configuration,
   use **Shift+F5** to stop the backend and terminate **SG: Run frontend** separately.
2. Choose **Terminal > Run Task > SG: Stop database**, or run
   `npm.cmd run db:stop` from the `sg` folder.
3. You can now quit Docker Desktop if you do not need it for anything else.

Stopping the database preserves your data in Docker's named volume. Next time,
repeat the startup steps above; you do not need to repeat the first-time setup.

## Validation

```sh
npm run validate:commit
npm run build
npm run build:backend
npm run test:backend
```

The backend tests start temporary PostgreSQL containers and remove them afterward.
They never connect to the development database. Docker must be running; the first
test run also downloads Testcontainers' cleanup-helper image.

After cloning, activate the frontend commit checks once with `npm run setup:hooks`.
The commit hook runs frontend type checks, lint, and tests. GitHub Actions runs
those checks, the frontend production build, and a separate backend build/test job.

## Current scope

The Projects page reads persisted data through `GET /api/projects`, with loading,
empty, error, and retry states. `GET /api/health` checks database readiness.
Accounts, admin editing, uploads, and the forum are future milestones.

See [backend instructions](backend/README.md) for database migrations, file layout,
and how the API is configured.
