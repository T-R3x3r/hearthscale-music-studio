import { build } from 'esbuild';

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
