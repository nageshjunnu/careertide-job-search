import pg from 'pg'
import { serverConfig } from './config.js'

const { Pool } = pg
let pool: pg.Pool | null = null

function getPool() {
  if (!serverConfig.databaseUrl) throw new Error('DATABASE_URL is missing in the Vercel production environment. Add it in Project Settings → Environment Variables, select Production, then redeploy.')
  pool ??= new Pool({ connectionString: serverConfig.databaseUrl })
  return pool
}

// Lazily create the pool so a missing deployment variable returns a useful API
// error instead of crashing the entire Vercel Function during module loading.
export const database = {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]) => getPool().query<T>(text, values),
  connect: () => getPool().connect(),
  end: () => pool?.end(),
}

export async function checkDatabase() {
  const result = await database.query<{ database: string; now: Date }>('SELECT current_database() AS database, NOW() AS now')
  return result.rows[0]
}
