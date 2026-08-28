import pg from 'pg'
import { serverConfig } from './config.js'

const { Pool } = pg
export const database = new Pool({ connectionString: serverConfig.databaseUrl })

export async function checkDatabase() {
  const result = await database.query<{ database: string; now: Date }>('SELECT current_database() AS database, NOW() AS now')
  return result.rows[0]
}
