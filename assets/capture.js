// The microphone's sound handed to the page in blocks, each with the frame
// of the audio context's clock its first sample was heard on.
const BLOCK = 4096;

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.filled = 0;
    this.first = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    if (this.filled === 0) {
      this.first = currentFrame;
      this.channels = input.map(() => new Float32Array(BLOCK));
    }
    const take = Math.min(input[0].length, BLOCK - this.filled);
    input.forEach((samples, c) => this.channels[c].set(samples.subarray(0, take), this.filled));
    this.filled += take;
    if (this.filled === BLOCK) {
      this.port.postMessage({ frame: this.first, channels: this.channels }, this.channels.map((c) => c.buffer));
      this.filled = 0;
    }
    return true;
  }
}

registerProcessor('music-studio-capture', Capture);
