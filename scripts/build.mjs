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
  // The year this copy was built in, which Longboard states as its year to a site with an interface for TVs (main/useragent.ts).
  define: { LONGBOARD_BUILD_YEAR: JSON.stringify(String(new Date().getUTCFullYear())) },
  // The two extension libraries stay as they are in node_modules: they find their own preload file from where they sit.
  external: ['electron', 'electron-chrome-extensions', 'electron-chrome-web-store'],
});

// The page view's preload (the layer) and the chrome view's (Longboard's own screens).
for (const [entry, outfile] of [
  ['src/preload/index.ts', 'dist/preload.js'],
  ['src/chrome/index.ts', 'dist/chrome.js'],
]) {
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

// The script of the page a phone shows to type on the TV (main/phone.ts serves it).
await build({
  ...common,
  sourcemap: false,
  minify: true,
  entryPoints: ['src/phone/index.ts'],
  outfile: 'dist/phone.js',
  platform: 'browser',
  format: 'iife',
});

// For extensions' own workers and pages only (main/extensions.ts registers it).
await build({
  ...common,
  entryPoints: ['src/extension/preload.ts'],
  outfile: 'dist/extension-preload.js',
  platform: 'browser',
  format: 'iife',
  external: ['electron'],
});

// The listening page (main/voice.ts serves it): its script, which loads the speech engine from beside it, and its preload.
await build({
  ...common,
  entryPoints: ['src/voice/page.ts'],
  outfile: 'dist/voice.js',
  platform: 'browser',
  format: 'esm',
  external: ['/m/*'],
});
await build({
  ...common,
  entryPoints: ['src/voice/preload.ts'],
  outfile: 'dist/voice-preload.js',
  platform: 'browser',
  format: 'iife',
  external: ['electron'],
});

await copyFile('src/layer/ui/tv.css', 'dist/tv.css');
await copyFile('src/chrome/chrome.html', 'dist/chrome.html');
