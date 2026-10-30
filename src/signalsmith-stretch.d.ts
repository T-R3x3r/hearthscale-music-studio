declare module 'signalsmith-stretch' {
  interface StretchNode extends AudioWorkletNode {
    addBuffers(channels: Float32Array[]): Promise<number>;
    schedule(change: { output?: number; active?: boolean; input?: number; rate?: number; semitones?: number }): void;
    latency(): Promise<number>;
  }
  interface SignalsmithStretch {
    (context: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
    /** The address of the AudioWorklet module, in place of the `blob:` one the library makes. */
    moduleUrl?: string;
  }
  const stretch: SignalsmithStretch;
  export default stretch;
}
