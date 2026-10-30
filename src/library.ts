/**
 * What the app keeps in its database: the songs, each as its document in
 * JSON; the versions a person saved of a song; and the snippets, pieces of
 * audio a person keeps to use in any song.
 */
import { call } from './bridge';
import type { Song } from './song';

export interface SongRow {
  id: string;
  title: string;
  updated: number;
}

export interface VersionRow {
  id: string;
  name: string;
  created: number;
}

export interface Snippet {
  id: string;
  name: string;
  asset: string;
  /** The length of the whole audio of the asset, in seconds. */
  seconds: number;
  offset: number;
  length: number;
  /** The tempo and key of the song it came from, where it had them. */
  tempo: number | null;
  key: string | null;
}

export async function openLibrary(): Promise<void> {
  await call('hearthscale/db/exec', {
    sql: `CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, doc TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY, song TEXT NOT NULL, name TEXT NOT NULL, doc TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, doc TEXT NOT NULL, created INTEGER NOT NULL);`,
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
  await call('hearthscale/db/batch', {
    statements: [
      { sql: 'DELETE FROM versions WHERE song = ?', params: [id] },
      { sql: 'DELETE FROM songs WHERE id = ?', params: [id] },
    ],
  });
}

export async function listVersions(song: string): Promise<VersionRow[]> {
  const { rows } = await call('hearthscale/db/query', {
    sql: 'SELECT id, name, created FROM versions WHERE song = ? ORDER BY created DESC',
    params: [song],
  });
  return rows as unknown as VersionRow[];
}

export async function saveVersion(song: Song, id: string, name: string): Promise<void> {
  await call('hearthscale/db/exec', {
    sql: 'INSERT INTO versions (id, song, name, doc, created) VALUES (?, ?, ?, ?, ?)',
    params: [id, song.id, name, JSON.stringify(song), Date.now()],
  });
}

export async function loadVersion(id: string): Promise<Song | null> {
  const { rows } = await call('hearthscale/db/query', { sql: 'SELECT doc FROM versions WHERE id = ?', params: [id] });
  const row = rows[0] as { doc: string } | undefined;
  return row ? (JSON.parse(row.doc) as Song) : null;
}

export async function listSnippets(): Promise<Snippet[]> {
  const { rows } = await call('hearthscale/db/query', { sql: 'SELECT doc FROM snippets ORDER BY created DESC' });
  return (rows as unknown as { doc: string }[]).map((row) => JSON.parse(row.doc) as Snippet);
}

export async function saveSnippet(snippet: Snippet): Promise<void> {
  await call('hearthscale/db/exec', {
    sql: `INSERT INTO snippets (id, name, doc, created) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, doc = excluded.doc`,
    params: [snippet.id, snippet.name, JSON.stringify(snippet), Date.now()],
  });
}

export async function deleteSnippet(id: string): Promise<void> {
  await call('hearthscale/db/exec', { sql: 'DELETE FROM snippets WHERE id = ?', params: [id] });
}

/** The assets of `candidates` that no song, other than `except`, and no snippet uses. */
export async function unusedAssets(candidates: string[], except: string | null): Promise<string[]> {
  if (candidates.length === 0) return [];
  const { rows } = await call('hearthscale/db/query', {
    sql: `SELECT json_extract(t.value, '$.asset') AS asset FROM songs, json_each(songs.doc, '$.takes') AS t
        WHERE songs.id IS NOT ?
      UNION SELECT json_extract(snippets.doc, '$.asset') FROM snippets`,
    params: [except],
  });
  const used = new Set((rows as unknown as { asset: string }[]).map((r) => r.asset));
  return candidates.filter((asset) => !used.has(asset));
}
