import { readFile } from 'node:fs/promises'
import { database } from './database.js'
import { sourceWorkflowFor } from './source-workflows.js'

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
await database.query(schema)
const workflows = await database.query<{ user_id: string; sources: string[] }>('SELECT user_id,sources FROM career_workflows')
for (const workflow of workflows.rows) {
  for (const source of workflow.sources) {
    const definition = sourceWorkflowFor(source)
    await database.query(`INSERT INTO source_workflows (user_id,source,automation_mode,submission_mode,status,detail,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(user_id,source) DO UPDATE SET automation_mode=$3,submission_mode=$4,status=$5,detail=$6,updated_at=NOW()`, [workflow.user_id, definition.source, definition.automationMode, definition.submissionMode, definition.status, definition.detail])
    await database.query(`INSERT INTO platform_integrations (user_id,source) VALUES ($1,$2) ON CONFLICT(user_id,source) DO NOTHING`, [workflow.user_id, definition.source])
  }
}
console.log('PostgreSQL schema is ready.')
await database.end()
