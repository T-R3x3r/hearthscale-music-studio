/** What the app hears in audio: its tempo. */
import { guess } from 'web-audio-beat-detector';

/** The tempo of the audio in whole beats a minute, or null where it hears no steady beat. */
export async function findTempo(buffer: AudioBuffer): Promise<number | null> {
  try {
    const { bpm } = await guess(buffer);
    return Number.isFinite(bpm) ? Math.round(bpm) : null;
  } catch {
    return null;
  }
}
