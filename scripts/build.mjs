// Bundles the entry points. Each output is a single file so the sandboxed
// preloads never need `require` at runtime.
import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
};

await mkdir('dist', { recursive: true });

await build({
  ...common,
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main.js',
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});

// The page view's preload (the layer) and the chrome view's (Longboard's own screens).
for (const [entry, outfile] of [['src/preload/index.ts', 'dist/preload.js'], ['src/chrome/index.ts', 'dist/chrome.js']]) {
  await build({
    ...common,
    entryPoints: [entry],
    outfile,
    platform: 'browser',
    format: 'iife',
    external: ['electron'],
    loader: { '.css': 'text' },
  });
}

await copyFile('src/layer/ui/tv.css', 'dist/tv.css');
await copyFile('src/chrome/chrome.html', 'dist/chrome.html');
