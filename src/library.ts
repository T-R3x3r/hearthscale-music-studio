/**
 * The songs, kept in the app's database: one row per song, its document as
 * JSON beside the title and the times the list sorts by.
 */
import { call } from './bridge';
import type { Song } from './song';

export interface SongRow {
  id: string;
  title: string;
  updated: number;
}

export async function openLibrary(): Promise<void> {
  await call('hearthscale/db/exec', {
    sql: `CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      doc TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )`,
  });
}

export async function listSongs(): Promise<SongRow[]> {
  const { rows } = await call('hearthscale/db/query', {
    sql: 'SELECT id, title, updated FROM songs ORDER BY updated DESC',
  });
  return rows as unknown as SongRow[];
}

export async function loadSong(id: string): Promise<Song | null> {
  const { rows } = await call('hearthscale/db/query', { sql: 'SELECT doc FROM songs WHERE id = ?', params: [id] });
  const row = rows[0] as { doc: string } | undefined;
  return row ? (JSON.parse(row.doc) as Song) : null;
}

export async function saveSong(song: Song): Promise<void> {
  const now = Date.now();
  await call('hearthscale/db/exec', {
    sql: `INSERT INTO songs (id, title, doc, created, updated) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, doc = excluded.doc, updated = excluded.updated`,
    params: [song.id, song.title, JSON.stringify(song), now, now],
  });
}

export async function deleteSong(id: string): Promise<void> {
  await call('hearthscale/db/exec', { sql: 'DELETE FROM songs WHERE id = ?', params: [id] });
}
