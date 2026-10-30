import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

await writeStretchWorklet();

await build({
  entryPoints: ['src/index.tsx'],
  outfile: 'views/studio.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  loader: { '.css': 'text' },
  external: ['@modelcontextprotocol/ext-apps'],
  define: { 'process.env.NODE_ENV': '"production"' },
});

/**
 * Writes Signalsmith Stretch's AudioWorklet module to assets/stretch.js. The
 * library builds the module as a `blob:` address, which a view's policy
 * refuses for a worklet, so the view loads it from the package instead. The
 * module's text is what the library puts in that blob, caught as it does so.
 */
async function writeStretchWorklet() {
  let code = null;
  globalThis.Blob = class {
    constructor(parts) {
      code = parts.join('');
    }
  };
  URL.createObjectURL = () => 'blob:caught';
  globalThis.AudioWorkletNode = class {
    constructor() {
      throw new Error('No audio while building');
    }
  };
  const { default: stretch } = await import('signalsmith-stretch');
  await stretch({ audioWorklet: { addModule: async () => {} } }).catch(() => {});
  if (!code) throw new Error('Signalsmith Stretch gave no worklet module');
  writeFileSync(
    'assets/stretch.js',
    `// Signalsmith Stretch (MIT, https://signalsmith-audio.co.uk/code/stretch/): its AudioWorklet module, written by build.mjs.\n${code}\n`,
  );
}
