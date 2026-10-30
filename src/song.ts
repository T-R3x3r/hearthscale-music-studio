/**
 * A song: its tempo, key and beats per bar, its tracks of clips, and every
 * piece of audio it has used. Clip positions are in beats, so a change of
 * tempo moves them with the song. Takes are never dropped from a song, so
 * a version the person did not keep stays in its history.
 */

export type Made = 'generated' | 'recorded' | 'imported';

export interface Take {
  /** The platform asset that holds the audio, a WAV file. */
  asset: string;
  seconds: number;
  made: Made;
  /** The words the take was made from. */
  words?: string;
  seed?: number;
  /** The card id of the model that made it. */
  model?: string;
}

/** A job under way, the clip whose versions it fills, and what it was asked. */
export interface Pending {
  job: string;
  clip: string;
  words: string;
  seed?: number;
  model?: string;
}

/** What a clip asked a music model for, so it can ask again. */
export interface Ask {
  model: string;
  /** The job input, without a seed: each version gets its own. */
  input: Record<string, unknown>;
  words: string;
  /** Whether the model takes a seed. */
  seeded: boolean;
  count: number;
}

export interface Clip {
  id: string;
  ask?: Ask;
  /** The take the clip plays; empty while its first version is made. */
  take: string;
  /** The takes the person chooses between, until they keep one. */
  versions: string[];
  /** How many versions the clip waits for. */
  expected: number;
  /** Why making a version failed. */
  failure?: string;
  startBeat: number;
  /** Where in the take the clip starts, in seconds. */
  offset: number;
  /** How long the clip plays, in seconds. */
  length: number;
}

export interface Track {
  id: string;
  name: string;
  swatch: Swatch;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clips: Clip[];
}

export interface Song {
  id: string;
  title: string;
  /** Beats a minute; null until the person or the music sets one. */
  tempo: number | null;
  /** Such as "A minor"; null until the person or the music sets one. */
  key: string | null;
  beatsPerBar: number;
  tracks: Track[];
  takes: Record<string, Take>;
  pending: Pending[];
}

export const SWATCHES = ['ocean', 'ember', 'jade', 'violet', 'sun', 'rose', 'sky', 'lime', 'plum', 'amber', 'indigo', 'moss'] as const;
export type Swatch = (typeof SWATCHES)[number];

/** The tempo the grid uses while the song has none. */
export const GRID_TEMPO = 120;

export function newId(): string {
  return crypto.randomUUID();
}

export function newSong(title: string): Song {
  return { id: newId(), title, tempo: null, key: null, beatsPerBar: 4, tracks: [], takes: {}, pending: [] };
}

export function newTrack(song: Song, name: string): Track {
  const swatch = SWATCHES[song.tracks.length % SWATCHES.length]!;
  return { id: newId(), name, swatch, volume: 1, pan: 0, muted: false, solo: false, clips: [] };
}

export function secondsPerBeat(song: Song): number {
  return 60 / (song.tempo ?? GRID_TEMPO);
}

export function clipStart(song: Song, clip: Clip): number {
  return clip.startBeat * secondsPerBeat(song);
}

/** The seconds a clip takes on the timeline: its length, or the length it waits for. */
export function clipSeconds(clip: Clip): number {
  if (clip.take) return clip.length;
  const asked = clip.ask?.input.seconds;
  return typeof asked === 'number' ? asked : WAITING_SECONDS;
}

/** The seconds a clip that waits for a piece of no stated length takes. */
const WAITING_SECONDS = 30;

/** How long the song runs, in seconds: to the end of its last clip. */
export function songSeconds(song: Song): number {
  let end = 0;
  for (const track of song.tracks) {
    for (const clip of track.clips) if (clip.take) end = Math.max(end, clipStart(song, clip) + clip.length);
  }
  return end;
}

/** A copy of the song with one clip changed. */
export function withClip(song: Song, id: string, change: (clip: Clip) => Clip): Song {
  return {
    ...song,
    tracks: song.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === id ? change(clip) : clip)),
    })),
  };
}

/** The assets of every take the song holds. */
export function songAssets(song: Song): string[] {
  return Object.values(song.takes).map((take) => take.asset);
}
