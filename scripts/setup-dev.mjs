import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const envPath = new URL('../.env', import.meta.url)
const settingsPath = new URL('../backend/src/Sg.Api/appsettings.Development.local.json', import.meta.url)

let env
try {
  env = await readFile(envPath, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  env = `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\n`
  await writeFile(envPath, env, { flag: 'wx', mode: 0o600 })
}

const password = /^POSTGRES_PASSWORD=([a-zA-Z0-9_-]+)\r?$/m.exec(env)?.[1]
if (!password) {
  throw new Error('Expected POSTGRES_PASSWORD containing letters, numbers, underscores or hyphens in .env. Existing files have been preserved.')
}

const settings = {
  ConnectionStrings: {
    AppDatabase: `Host=localhost;Port=54329;Database=sg;Username=sg;Password=${password}`,
  },
}

try {
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  console.log('Created local database configuration. Both credential files are ignored by Git.')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  const existing = JSON.parse(await readFile(settingsPath, 'utf8'))
  if (existing.ConnectionStrings?.AppDatabase !== settings.ConnectionStrings.AppDatabase) {
    throw new Error('Existing backend connection settings differ from .env. Reconcile them manually; no settings were overwritten.')
  }
  console.log('Local database configuration is already set up.')
}
