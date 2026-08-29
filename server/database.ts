import pg from 'pg'
import { serverConfig } from './config.js'

const { Pool } = pg
if (!serverConfig.databaseUrl) throw new Error('DATABASE_URL is missing in the Vercel production environment. Add it in Project Settings → Environment Variables, select Production, then redeploy.')
export const database = new Pool({ connectionString: serverConfig.databaseUrl })

export async function checkDatabase() {
  const result = await database.query<{ database: string; now: Date }>('SELECT current_database() AS database, NOW() AS now')
  return result.rows[0]
}
