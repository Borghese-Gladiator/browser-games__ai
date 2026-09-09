// A minimal numbered migration runner. It reads NNN_name.sql files, sorts them by
// version, and applies the pending ones inside schema_migrations bookkeeping so
// each version is applied exactly once.

import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from './postgresStore.ts';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f));
  const migrations: Migration[] = [];
  for (const file of files) {
    const match = /^(\d+)_(.*)\.sql$/.exec(file);
    if (!match) continue;
    const sql = await readFile(`${dir}/${file}`, 'utf8');
    migrations.push({ version: Number(match[1]), name: match[2], sql });
  }
  return migrations.sort((a, b) => a.version - b.version);
}

export async function runMigrations(pool: Pool, dir: string): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at BIGINT NOT NULL
     )`,
  );
  const { rows } = await pool.query(`SELECT version FROM schema_migrations`);
  const applied = new Set(rows.map((r) => Number(r.version)));
  for (const migration of await loadMigrations(dir)) {
    if (applied.has(migration.version)) continue;
    await pool.query(migration.sql);
    await pool.query(`INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)`, [
      migration.version,
      migration.name,
      Date.now(),
    ]);
  }
}
