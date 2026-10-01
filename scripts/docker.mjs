import { spawn } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Windows terminals opened before Docker was installed can have an outdated PATH.
// Keep this fix local to our child processes, without changing system settings.
export function resolveDocker(environment = process.env) {
  const windows = process.platform === 'win32'
  const separator = windows ? ';' : ':'
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const originalPath = environment[pathKey] ?? ''
  const folders = originalPath.split(separator).filter(Boolean).map((folder) => folder.replace(/^"(.*)"$/, '$1'))

  if (windows) {
    if (environment.LOCALAPPDATA) {
      folders.push(join(environment.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin'))
    }
    if (environment.ProgramFiles) {
      folders.push(join(environment.ProgramFiles, 'Docker', 'Docker', 'resources', 'bin'))
    }
  }

  for (const folder of folders) {
    const command = resolve(folder, windows ? 'docker.exe' : 'docker')
    try {
      if (!statSync(command).isFile()) continue
      accessSync(command, windows ? constants.F_OK : constants.X_OK)
    } catch {
      continue
    }

    const env = { ...environment }
    // Node on Windows treats environment keys case-insensitively. Keep one PATH.
    if (windows) {
      for (const key of Object.keys(env)) {
        if (key.toLowerCase() === 'path') delete env[key]
      }
    }
    env[windows ? 'PATH' : pathKey] = `${dirname(command)}${separator}${originalPath}`
    // Docker invokes its credential helper by name, so it needs this PATH too.
    return { command, env }
  }

  throw new Error(
    'Docker CLI was not found. Install Docker Desktop, or add its resources/bin folder to PATH if you used a custom installation location.',
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const docker = resolveDocker()
    const child = spawn(docker.command, process.argv.slice(2), {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: docker.env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', (error) => {
      console.error(`[SG] Docker: ${error.message}`)
      process.exitCode = 1
    })
    child.once('exit', (code) => { process.exitCode = code ?? 1 })
  } catch (error) {
    console.error(`[SG] ${error.message}`)
    process.exitCode = 1
  }
}
