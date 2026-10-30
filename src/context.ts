/** The open song in words, for the assistant: its ids, tracks, clips and what the music model can do. */
import type { ModelCard } from '@hearthscale/app';
import type { Edits } from './edits';
import { lyricsText } from './lyrics';
import { abilities, musicSchema } from './music';
import { clipBars, SOUNDS, type Song } from './song';

export function songContext(song: Song, card: ModelCard | null, edits: Edits): string {
  const lines = [
    `Open song: id ${song.id}, "${song.title}".`,
    `Tempo: ${song.tempo === null ? 'not set' : `${song.tempo} BPM`}. Key: ${song.key ?? 'not set'}. ${song.beatsPerBar} beats a bar.`,
  ];
  if (song.tracks.length === 0) lines.push('No tracks yet.');
  for (const track of song.tracks) {
    const state = [
      `volume ${track.volume}`,
      `pan ${track.pan}`,
      track.muted ? 'muted' : null,
      track.solo ? 'solo' : null,
      track.sound ? `sound ${SOUNDS[track.sound]}` : null,
    ].filter(Boolean);
    lines.push(`Track id ${track.id}, "${track.name}" (${state.join(', ')}):`);
    for (const clip of track.clips) {
      const take = song.takes[clip.take];
      const { from, to } = clipBars(song, clip);
      const what = take ? `"${take.words ?? 'audio'}"` : clip.failure ? 'not made' : 'being made';
      lines.push(`- clip id ${clip.id}, bars ${from} to ${to}, ${what}${clip.loops > 1 ? `, played ${clip.loops} times` : ''}`);
    }
  }
  const lyrics = lyricsText(song.lyrics);
  if (lyrics) lines.push(`Lyrics:\n${lyrics}`);
  if (card) {
    const schema = musicSchema(card);
    const can = [
      'make music from words',
      edits.restyle ? 'change a clip\'s style' : null,
      edits.repaint ? 'redo bars of a clip and make a clip longer' : null,
      edits.addPart ? 'add an instrument part' : null,
    ].filter(Boolean);
    lines.push(`The music model "${card.label}" can ${can.join(', ')}. It ${schema && abilities(schema).sings ? 'sings' : 'does not sing'}.`);
  } else {
    lines.push('No music model can run now.');
  }
  return lines.join('\n');
}
