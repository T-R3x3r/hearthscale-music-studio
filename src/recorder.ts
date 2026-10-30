/**
 * Records the microphone on the engine's own clock: an AudioWorklet from
 * the package hands each block of sound with the frame it was heard on, so
 * a recording lines up with the song that played while it was made.
 */

interface Block {
  frame: number;
  channels: Float32Array<ArrayBuffer>[];
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export class Recorder {
  private readonly blocks: Block[] = [];

  private constructor(
    private readonly context: AudioContext,
    private readonly stream: MediaStream,
    private readonly node: AudioWorkletNode,
    private readonly silent: GainNode,
  ) {
    node.port.onmessage = (event: MessageEvent<Block>) => this.blocks.push(event.data);
  }

  /** Opens the microphone, with the browser's voice processing off, which music does not want. */
  static async start(context: AudioContext, assets: string): Promise<Recorder> {
    let module = loaded.get(context);
    if (!module) {
      module = context.audioWorklet.addModule(new URL('capture.js', assets).href);
      loaded.set(context, module);
    }
    await module;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
    });
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'music-studio-capture', { numberOfInputs: 1, numberOfOutputs: 1 });
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(node).connect(silent).connect(context.destination);
    return new Recorder(context, stream, node, silent);
  }

  /** The time sound takes from the speakers to the ear and from the microphone to the clock, in seconds. */
  latency(): number {
    const settings = this.stream.getAudioTracks()[0]?.getSettings() as (MediaTrackSettings & { latency?: number }) | undefined;
    const input = settings?.latency ?? 0;
    return this.context.outputLatency + this.context.baseLatency + input;
  }

  /** Ends the recording and answers what was heard from the context time `from` on, in stereo. */
  stop(from: number): AudioBuffer {
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.silent.disconnect();
    for (const track of this.stream.getTracks()) track.stop();
    const rate = this.context.sampleRate;
    const first = Math.round(from * rate);
    const last = this.blocks.reduce((end, b) => Math.max(end, b.frame + b.channels[0]!.length), first);
    const out = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, last - first), sampleRate: rate });
    for (const block of this.blocks) {
      for (let c = 0; c < 2; c++) {
        const samples = block.channels[Math.min(c, block.channels.length - 1)]!;
        const at = block.frame - first;
        const skip = Math.max(0, -at);
        if (skip >= samples.length) continue;
        out.copyToChannel(samples.subarray(skip), c, Math.max(0, at));
      }
    }
    return out;
  }
}
