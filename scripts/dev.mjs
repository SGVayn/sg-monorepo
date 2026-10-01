import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { resolveDocker } from './docker.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const frontend = fileURLToPath(new URL('../frontend/', import.meta.url))
const vite = fileURLToPath(new URL('../frontend/node_modules/vite/bin/vite.js', import.meta.url))
const isWindows = process.platform === 'win32'
const children = new Set()
const cancellation = new AbortController()
let shutdownPromise
let databaseStarted = false
let childEnvironment = process.env

function start(label, command, args, { cwd = root, quiet = false } = {}) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...childEnvironment, DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER: '1' },
  })
  children.add(child)
  let output = ''
  if (quiet) {
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.resume()
  } else {
    // Pipe explicitly: detached Windows processes cannot inherit the terminal's console handles.
    child.stdout.pipe(process.stdout, { end: false })
    child.stderr.pipe(process.stderr, { end: false })
  }

  const done = new Promise((resolve) => {
    child.once('error', (error) => {
      children.delete(child)
      resolve({ label, code: 1, error, output })
    })
    child.once('close', (code, signal) => {
      children.delete(child)
      resolve({ label, code, signal, output })
    })
  })
  return { child, done }
}

function checkResult(result) {
  if (result.error) {
    throw new Error(`${result.label}: ${result.error.message}. Check that the required tool is installed and restart your terminal.`)
  }
  if (result.code !== 0) {
    throw new Error(`${result.label} failed (${result.signal ?? `exit code ${result.code}`}). See the output above.`)
  }
}

async function run(label, command, args, options) {
  cancellation.signal.throwIfAborted()
  console.log(`\n[SG] ${label}`)
  checkResult(await start(label, command, args, options).done)
  cancellation.signal.throwIfAborted()
}

async function stopChild(child) {
  if (!child.pid) return
  if (isWindows) {
    // Kill only the process tree created by this script, including dotnet watch's API.
    await new Promise((resolve) => {
      const stop = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      stop.once('error', resolve)
      stop.once('close', resolve)
    })
  } else {
    try { process.kill(-child.pid, 'SIGTERM') } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    // The detached process group also contains any grandchildren.
    await delay(500)
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}

function shutdown(code) {
  if (shutdownPromise) return shutdownPromise
  cancellation.abort()
  process.exitCode = code
  shutdownPromise = (async () => {
    console.log('\n[SG] Stopping development processes...')
    const results = await Promise.allSettled([...children].map(stopChild))
    for (const result of results) {
      if (result.status === 'rejected') console.error(result.reason.message)
    }
    if (databaseStarted) {
      console.log('[SG] PostgreSQL is left running with your data intact. To stop it: npm run db:stop')
    }
  })()
  return shutdownPromise
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', ...(isWindows ? ['SIGBREAK'] : [])]) {
  process.on(signal, () => { void shutdown(0) })
}

async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(
      `Port ${port} is unavailable. Stop the existing frontend/backend task before running this command.`,
    )))
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}

async function waitUntilReady() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    cancellation.signal.throwIfAborted()
    try {
      let ready = true
      // Wait for the API first so Vite does not log proxy failures during normal startup.
      for (const url of ['http://localhost:5080/api/health', 'http://localhost:5173/api/projects']) {
        const response = await fetch(url, {
          signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(2000)]),
        })
        await response.body?.cancel()
        if (!response.ok) {
          ready = false
          break
        }
      }
      if (ready) return
    } catch {
      // The servers may still be compiling or starting. Retry until the deadline.
    }
    await delay(500, undefined, { signal: cancellation.signal })
  }
  throw new Error('The app did not become ready within two minutes. Check the server output above.')
}

async function main() {
  try { await access(vite) } catch {
    throw new Error('Frontend dependencies are missing. Complete the README first-time setup before running npm run dev.')
  }
  await Promise.all([requireFreePort(5080), requireFreePort(5173)])
  await run('Checking .NET SDK', 'dotnet', ['--version'])

  console.log('\n[SG] Checking Docker...')
  const dockerCli = resolveDocker()
  childEnvironment = dockerCli.env
  let docker = await start('Docker', dockerCli.command, ['info', '--format', '{{.OSType}}'], { quiet: true }).done
  if (docker.error) checkResult(docker)
  if (docker.code !== 0) {
    if (!isWindows && process.platform !== 'darwin') {
      throw new Error('Docker is not running. Start the Docker engine and try again.')
    }
    await run('Starting Docker Desktop (this can take a minute)', dockerCli.command, ['desktop', 'start', '--timeout', '120'])
    docker = await start('Docker', dockerCli.command, ['info', '--format', '{{.OSType}}'], { quiet: true }).done
  }
  checkResult(docker)
  if (docker.output.trim() !== 'linux') {
    throw new Error('Docker must use Linux containers. Switch Docker Desktop to Linux containers and try again.')
  }

  await run('Preparing local configuration', process.execPath, ['scripts/setup-dev.mjs'])
  await run('Starting PostgreSQL', dockerCli.command, ['compose', 'up', '-d', '--wait', '--wait-timeout', '120', 'db'])
  databaseStarted = true
  await run('Applying database migrations', 'dotnet', ['run', '--project', 'backend/src/Sg.Api', '--', '--migrate'])

  console.log('\n[SG] Starting backend and frontend. Press Ctrl+C to stop both.')
  const backend = start('Backend', 'dotnet', ['watch', '--non-interactive', '--project', 'backend/src/Sg.Api'])
  const web = start('Frontend', process.execPath, [vite], { cwd: frontend })
  const serverExit = Promise.race([backend.done, web.done]).then((result) => {
    checkResult(result)
    throw new Error(`${result.label} stopped. Stopping the other server too.`)
  })

  await Promise.race([waitUntilReady(), serverExit])
  console.log('\n[SG] Ready: http://localhost:5173/projects')
  console.log('[SG] API: http://localhost:5080/api/health\n')
  await serverExit
}

try {
  await main()
} catch (error) {
  if (!cancellation.signal.aborted) {
    console.error(`\n[SG] ${error.message}`)
    await shutdown(1)
  }
}
