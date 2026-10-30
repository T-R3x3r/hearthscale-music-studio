/**
 * The edits a person makes to a song, each a pure function from one song
 * to the next. Positions snap to bars, or to beats where the person asks
 * for the finer grid.
 */
import {
  clipSeconds,
  clipStart,
  fadeSeconds,
  newId,
  newTrack,
  secondsPerBeat,
  type Clip,
  type Song,
  type Track,
} from './song';

/** The shortest a clip may be trimmed to, in beats. */
const SHORTEST_BEATS = 0.25;

export function newClip(take: string, startBeat: number, length: number, offset = 0): Clip {
  return { id: newId(), take, versions: [], expected: 0, startBeat, offset, length, loops: 1, fadeIn: 0, fadeOut: 0 };
}

export function snapBeat(song: Song, beat: number, fine: boolean): number {
  const step = fine ? 1 : song.beatsPerBar;
  return Math.max(0, Math.round(beat / step) * step);
}

export function trackOf(song: Song, clip: string): Track | undefined {
  return song.tracks.find((t) => t.clips.some((c) => c.id === clip));
}

export function clipOf(song: Song, clip: string): Clip | undefined {
  return song.tracks.flatMap((t) => t.clips).find((c) => c.id === clip);
}

function mapClip(song: Song, id: string, change: (clip: Clip) => Clip): Song {
  return { ...song, tracks: song.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? change(c) : c)) })) };
}

export function moveClip(song: Song, id: string, track: string, startBeat: number): Song {
  const clip = clipOf(song, id);
  if (!clip) return song;
  const moved = { ...clip, startBeat };
  return {
    ...song,
    tracks: song.tracks.map((t) => {
      const kept = t.clips.filter((c) => c.id !== id);
      return { ...t, clips: t.id === track ? [...kept, moved] : kept };
    }),
  };
}

/** Moves a clip's start to `startBeat`, keeping its end where it is. */
export function trimStart(song: Song, id: string, startBeat: number): Song {
  return mapClip(song, id, (clip) => {
    if (clip.loops !== 1) return clip;
    const perBeat = secondsPerBeat(song);
    const end = clip.startBeat + clip.length / perBeat;
    const earliest = clip.startBeat - clip.offset / perBeat;
    const beat = Math.min(end - SHORTEST_BEATS, Math.max(earliest, startBeat));
    const moved = (beat - clip.startBeat) * perBeat;
    return { ...clip, startBeat: beat, offset: clip.offset + moved, length: clip.length - moved };
  });
}

/** Moves a clip's end so it runs `seconds` long, within its take. */
export function trimEnd(song: Song, id: string, seconds: number): Song {
  return mapClip(song, id, (clip) => {
    const take = song.takes[clip.take];
    if (!take || clip.loops !== 1) return clip;
    const length = Math.min(take.seconds - clip.offset, Math.max(SHORTEST_BEATS * secondsPerBeat(song), seconds));
    return { ...clip, length };
  });
}

export function setLoops(song: Song, id: string, loops: number): Song {
  return mapClip(song, id, (clip) => ({ ...clip, loops: Math.max(1, Math.round(loops)) }));
}

/** Cuts a clip of one pass in two at a point of the song, in seconds. */
export function cutAt(song: Song, id: string, at: number): Song {
  const clip = clipOf(song, id);
  if (!clip || clip.loops !== 1) return song;
  const into = at - clipStart(song, clip);
  if (into <= 0 || into >= clip.length) return song;
  const left: Clip = { ...clip, length: into, fadeOut: 0 };
  const right: Clip = {
    ...clip,
    id: newId(),
    startBeat: clip.startBeat + into / secondsPerBeat(song),
    offset: clip.offset + into,
    length: clip.length - into,
    fadeIn: 0,
  };
  return {
    ...song,
    tracks: song.tracks.map((t) => ({ ...t, clips: t.clips.flatMap((c) => (c.id === id ? [left, right] : [c])) })),
  };
}

/** Puts a copy of a clip, with the id `copy`, right after it, on the next bar. */
export function duplicate(song: Song, id: string, copy: string): Song {
  const clip = clipOf(song, id);
  const track = trackOf(song, id);
  if (!clip || !track) return song;
  const after = clip.startBeat + clipSeconds(clip) / secondsPerBeat(song);
  const twin: Clip = { ...clip, id: copy, versions: [], expected: 0, startBeat: Math.ceil(after / song.beatsPerBar) * song.beatsPerBar };
  return { ...song, tracks: song.tracks.map((t) => (t.id === track.id ? { ...t, clips: [...t.clips, twin] } : t)) };
}

export function removeClip(song: Song, id: string): Song {
  return { ...song, tracks: song.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })) };
}

export function toggleFade(song: Song, id: string, end: 'in' | 'out'): Song {
  const seconds = fadeSeconds(song);
  return mapClip(song, id, (clip) =>
    end === 'in' ? { ...clip, fadeIn: clip.fadeIn > 0 ? 0 : seconds } : { ...clip, fadeOut: clip.fadeOut > 0 ? 0 : seconds },
  );
}

export function addTrack(song: Song, name: string): { song: Song; track: string } {
  const track = newTrack(song, name);
  return { song: { ...song, tracks: [...song.tracks, track] }, track: track.id };
}

export function changeTrack(song: Song, id: string, change: Partial<Omit<Track, 'id' | 'clips'>>): Song {
  return { ...song, tracks: song.tracks.map((t) => (t.id === id ? { ...t, ...change } : t)) };
}

export function removeTrack(song: Song, id: string): Song {
  return { ...song, tracks: song.tracks.filter((t) => t.id !== id) };
}

/** A clip of a take, put on a track at a beat. */
export function placeClip(song: Song, track: string, clip: Clip): Song {
  return { ...song, tracks: song.tracks.map((t) => (t.id === track ? { ...t, clips: [...t.clips, clip] } : t)) };
}
