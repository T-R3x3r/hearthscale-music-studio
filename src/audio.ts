/**
 * The sound of a song: one AudioContext at a fixed rate, every clip
 * scheduled on its clock when playback starts, so tracks never drift. The
 * export renders the same graph in an OfflineAudioContext.
 */
import { assetUrl } from './bridge';
import { clipSeconds, clipStart, secondsPerBeat, songSeconds, type Song, type Sound, type Track } from './song';

export const RATE = 48_000;

/** Time from a press of Play to the first sound, so every clip starts on time. */
const LEAD = 0.05;

/** How far ahead the metronome schedules its clicks, and how often it looks. */
const TICK_AHEAD = 0.3;
const TICK_EVERY_MS = 100;

export interface PlayOptions {
  /** Seconds of clicks before the song starts. */
  countIn?: number;
  metronome?: boolean;
  /** Plays on past the song's end until stopped, as a recording does. */
  open?: boolean;
}

/** One metronome click at the context time `when`, higher on the first beat of a bar. */
function click(context: BaseAudioContext, when: number, downbeat: boolean): void {
  const tone = context.createOscillator();
  const level = context.createGain();
  tone.frequency.value = downbeat ? 1600 : 1000;
  level.gain.setValueAtTime(0.3, when);
  level.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  tone.connect(level).connect(context.destination);
  tone.start(when);
  tone.stop(when + 0.06);
}

/** Waveform points kept per second of audio. */
export const PEAKS_PER_SECOND = 200;

/** Whether a track sounds: not muted, and solo while any track is. */
export function audible(song: Song, track: Track): boolean {
  const solo = song.tracks.some((t) => t.solo);
  return !track.muted && (!solo || track.solo);
}

/** Connects every clip that sounds after `from` to `out`, starting at the context time `at`. */
function schedule(
  context: BaseAudioContext,
  out: AudioNode,
  song: Song,
  from: number,
  at: number,
  buffers: Map<string, AudioBuffer>,
): AudioBufferSourceNode[] {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  limiter.connect(out);
  const bus = song.louder ? louder(context, limiter) : limiter;
  const sources: AudioBufferSourceNode[] = [];
  for (const track of song.tracks) {
    if (!audible(song, track)) continue;
    const gain = context.createGain();
    gain.gain.value = track.volume;
    const pan = context.createStereoPanner();
    pan.pan.value = track.pan;
    pan.connect(bus);
    gain.connect(track.sound ? colour(context, track.sound, pan) : pan);
    for (const clip of track.clips) {
      const take = song.takes[clip.take];
      const buffer = take && buffers.get(take.asset);
      if (!buffer) continue;
      const start = clipStart(song, clip);
      const total = clipSeconds(clip);
      if (start + total <= from) continue;
      const envelope = context.createGain();
      envelope.connect(gain);
      fade(envelope.gain, at, from, start, total, clip.fadeIn, clip.fadeOut);
      for (let pass = 0; pass < clip.loops; pass++) {
        const passStart = start + pass * clip.length;
        if (passStart + clip.length <= from) continue;
        const skip = Math.max(0, from - passStart);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(envelope);
        source.start(at + Math.max(0, passStart - from), clip.offset + skip, clip.length - skip);
        sources.push(source);
      }
    }
  }
  return sources;
}

/** A compressor that evens the song out, and the gain that makes up what it took: the input of `out`. */
function louder(context: BaseAudioContext, out: AudioNode): AudioNode {
  const squeeze = context.createDynamicsCompressor();
  squeeze.threshold.value = -20;
  squeeze.knee.value = 10;
  squeeze.ratio.value = 3;
  squeeze.attack.value = 0.01;
  squeeze.release.value = 0.2;
  const makeUp = context.createGain();
  makeUp.gain.value = 1.8;
  squeeze.connect(makeUp).connect(out);
  return squeeze;
}

/** The input of a named sound that ends in `out`. */
function colour(context: BaseAudioContext, sound: Sound, out: AudioNode): AudioNode {
  if (sound === 'space') {
    const dry = context.createGain();
    const wet = context.createConvolver();
    wet.buffer = room(context);
    const level = context.createGain();
    level.gain.value = 0.35;
    dry.connect(out);
    dry.connect(wet).connect(level).connect(out);
    return dry;
  }
  const low = context.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 250;
  low.gain.value = sound === 'warm' ? 3 : -1;
  const high = context.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = sound === 'warm' ? 5000 : 3500;
  high.gain.value = sound === 'warm' ? -4 : 4;
  low.connect(high).connect(out);
  return low;
}

const rooms = new WeakMap<BaseAudioContext, AudioBuffer>();

/** A room's echo: two seconds of noise that dies away, a channel each side. */
function room(context: BaseAudioContext): AudioBuffer {
  let found = rooms.get(context);
  if (!found) {
    const seconds = 2.2;
    found = context.createBuffer(2, Math.round(seconds * context.sampleRate), context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = found.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    rooms.set(context, found);
  }
  return found;
}

/** Shapes a clip's gain from where playback starts: up over the fade in, down over the fade out. */
function fade(param: AudioParam, at: number, from: number, start: number, total: number, fadeIn: number, fadeOut: number): void {
  const level = (t: number) => {
    let gain = 1;
    if (fadeIn > 0) gain = Math.min(gain, (t - start) / fadeIn);
    if (fadeOut > 0) gain = Math.min(gain, (start + total - t) / fadeOut);
    return Math.max(0, Math.min(1, gain));
  };
  const time = (t: number) => at + Math.max(0, t - from);
  const now = Math.max(from, start);
  param.setValueAtTime(level(now), time(now));
  const fullFrom = start + fadeIn;
  const fullTo = start + total - fadeOut;
  if (fadeIn > 0 && fullFrom > now) param.linearRampToValueAtTime(level(Math.min(fullFrom, fullTo)), time(Math.min(fullFrom, fullTo)));
  if (fadeOut > 0) {
    const down = Math.max(now, fullTo);
    param.setValueAtTime(level(down), time(down));
    param.linearRampToValueAtTime(0, time(start + total));
  }
}

function heardAssets(song: Song): string[] {
  const assets = new Set<string>();
  for (const track of song.tracks) {
    for (const clip of track.clips) {
      const take = song.takes[clip.take];
      if (take) assets.add(take.asset);
    }
  }
  return [...assets];
}

export class Engine {
  readonly context = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
  private readonly decoded = new Map<string, Promise<AudioBuffer>>();
  private sources: AudioBufferSourceNode[] = [];
  private endTimer = 0;
  private startedAt = 0;
  private from = 0;
  /** The song the engine plays now, as it was when playback started; null while stopped. */
  playing: Song | null = null;

  /** The decoded audio of an asset, read once and kept. */
  buffer(asset: string): Promise<AudioBuffer> {
    let decoded = this.decoded.get(asset);
    if (!decoded) {
      decoded = fetch(assetUrl(asset))
        .then((answer) => {
          if (!answer.ok) throw new Error('The audio could not be loaded. Try again.');
          return answer.arrayBuffer();
        })
        .then((bytes) => this.context.decodeAudioData(bytes));
      decoded.catch(() => this.decoded.delete(asset));
      this.decoded.set(asset, decoded);
    }
    return decoded;
  }

  forget(asset: string): void {
    this.decoded.delete(asset);
  }

  get isPlaying(): boolean {
    return this.playing !== null;
  }

  /** Where playback is in the song, in seconds. */
  position(): number {
    return this.playing !== null ? this.from + Math.max(0, this.context.currentTime - this.startedAt) : this.from;
  }

  /** Moves the playhead; a running playback goes on from there. */
  async seek(song: Song, seconds: number, onEnd: () => void): Promise<void> {
    if (this.playing !== null) await this.play(song, seconds, onEnd);
    else this.from = seconds;
  }

  /**
   * Plays the song from `from`, after `options.countIn` seconds of
   * metronome clicks where asked. Answers the context time `from` sounds
   * at. An open playback goes on past the song's end until it is stopped.
   */
  async play(song: Song, from: number, onEnd: () => void, options: PlayOptions = {}): Promise<number> {
    this.halt();
    await this.context.resume();
    const assets = heardAssets(song);
    const buffers = new Map(await Promise.all(assets.map(async (a) => [a, await this.buffer(a)] as const)));
    const countIn = options.countIn ?? 0;
    this.from = from;
    this.startedAt = this.context.currentTime + LEAD + countIn;
    this.sources = schedule(this.context, this.context.destination, song, from, this.startedAt, buffers);
    this.playing = song;
    if (options.metronome) this.tick(song, from, this.startedAt - countIn, countIn);
    if (!options.open) {
      const remaining = songSeconds(song) - from;
      this.endTimer = window.setTimeout(() => {
        this.halt();
        this.from = 0;
        onEnd();
      }, (remaining + LEAD + countIn) * 1000);
    }
    return this.startedAt;
  }

  private ticker = 0;

  /** Clicks every beat from the context time `at`, on the beats of the song from `from` less the count-in. */
  private tick(song: Song, from: number, at: number, countIn: number): void {
    const beat = secondsPerBeat(song);
    const first = from - countIn;
    let next = Math.ceil(first / beat - 1e-6);
    const schedule = () => {
      const until = this.context.currentTime + TICK_AHEAD;
      for (;;) {
        const when = at + (next * beat - first);
        if (when > until) break;
        if (when >= this.context.currentTime) click(this.context, when, next % song.beatsPerBar === 0);
        next++;
      }
    };
    schedule();
    this.ticker = window.setInterval(schedule, TICK_EVERY_MS);
  }

  stop(): void {
    const at = this.position();
    this.halt();
    this.from = at;
  }

  private sample: AudioBufferSourceNode | null = null;

  /** Plays a stretch of one asset alone, beside the song; `onEnd` hears its end. */
  async preview(asset: string, offset: number, length: number, onEnd: () => void): Promise<void> {
    this.stopPreview();
    await this.context.resume();
    const source = this.context.createBufferSource();
    source.buffer = await this.buffer(asset);
    source.connect(this.context.destination);
    source.onended = () => {
      if (this.sample === source) this.sample = null;
      onEnd();
    };
    source.start(this.context.currentTime + LEAD, offset, length);
    this.sample = source;
  }

  stopPreview(): void {
    if (!this.sample) return;
    this.sample.stop();
    this.sample = null;
  }

  private halt(): void {
    window.clearTimeout(this.endTimer);
    window.clearInterval(this.ticker);
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources = [];
    this.playing = null;
  }

  /** The whole song mixed down to stereo at the engine's rate. */
  async render(song: Song): Promise<AudioBuffer> {
    const assets = heardAssets(song);
    const buffers = new Map(await Promise.all(assets.map(async (a) => [a, await this.buffer(a)] as const)));
    const length = Math.max(1, Math.ceil(songSeconds(song) * RATE));
    const offline = new OfflineAudioContext(2, length, RATE);
    schedule(offline, offline.destination, song, 0, 0, buffers);
    return offline.startRendering();
  }
}

/**
 * A stretch of one asset as stereo audio at `rate`, such as the 44.1 kHz a
 * stem split reads, with `pad` seconds of silence after it.
 */
export async function excerpt(engine: Engine, asset: string, offset: number, length: number, rate: number, pad = 0): Promise<AudioBuffer> {
  const buffer = await engine.buffer(asset);
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil((length + pad) * rate)), rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0, offset, length);
  return offline.startRendering();
}

/** The loudest sample of each stretch of 1 / PEAKS_PER_SECOND seconds, over all channels. */
export function peaks(buffer: AudioBuffer): Float32Array {
  const size = Math.max(1, Math.round(buffer.sampleRate / PEAKS_PER_SECOND));
  const points = new Float32Array(Math.ceil(buffer.length / size));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const point = (i / size) | 0;
      const level = Math.abs(data[i]!);
      if (level > points[point]!) points[point] = level;
    }
  }
  return points;
}

/** A 16-bit PCM WAV file of the buffer. */
export function wav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, data[c]![i]!));
      view.setInt16(at, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
