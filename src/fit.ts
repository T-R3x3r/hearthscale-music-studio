/**
 * Fits audio to a song: faster or slower to its tempo, higher or lower to
 * its key, rendered once with Signalsmith Stretch, whose AudioWorklet module
 * the package carries in `assets/`.
 */
import stretch from 'signalsmith-stretch';
import { assetsUrl } from './bridge';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The semitones that move a piece in `from` to `to`, the shorter way; 0 where either is unknown. */
export function semitonesBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const tonic = (key: string) => {
    const [note, mode] = key.split(' ');
    const index = NOTES.indexOf(note ?? '');
    return index < 0 ? null : mode === 'minor' ? (index + 3) % 12 : index;
  };
  const a = tonic(from);
  const b = tonic(to);
  if (a === null || b === null) return 0;
  const up = (b - a + 12) % 12;
  return up > 6 ? up - 12 : up;
}

/** The longest a stage of a fit may take, in milliseconds, before the fit fails. */
const STAGE_MS = 20_000;

function within<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('The snippet could not be fitted to the song. Try again.')), STAGE_MS)),
  ]);
}

/** The audio played `speed` times as fast and `semitones` higher, at the same sample rate. */
export async function fit(audio: AudioBuffer, speed: number, semitones: number): Promise<AudioBuffer> {
  stretch.moduleUrl = new URL('stretch.js', assetsUrl()).href;
  const seconds = audio.duration / speed;
  const probe = new OfflineAudioContext(2, 1, audio.sampleRate);
  const lead = await within((await within(stretch(probe))).latency());
  const offline = new OfflineAudioContext(2, Math.ceil((seconds + lead) * audio.sampleRate), audio.sampleRate);
  const node = await within(stretch(offline));
  node.connect(offline.destination);
  const right = audio.numberOfChannels > 1 ? 1 : 0;
  await within(node.addBuffers([audio.getChannelData(0), audio.getChannelData(right)]));
  node.schedule({ output: lead, active: true, input: 0, rate: speed, semitones });
  const rendered = await within(offline.startRendering());
  const skip = Math.round(lead * audio.sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, rendered.length - skip), sampleRate: audio.sampleRate });
  for (let c = 0; c < 2; c++) out.copyToChannel(rendered.getChannelData(c).subarray(skip), c);
  return out;
}
