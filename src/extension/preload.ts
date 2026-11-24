// A preload for extensions only: their background workers and their own
// pages (chrome-extension://). Never a website.
//
// The engine gives an extension two names for the same interfaces, `chrome`
// and `browser`. The library that supplies what Electron leaves out
// (electron-chrome-extensions) adds its parts to `chrome` alone, so an
// extension that prefers `browser` (uBlock Origin Lite does) finds them
// missing and stops as it starts. This copies across what `browser` lacks.
// It exposes nothing: it runs one function in the extension's own world.
import { contextBridge } from 'electron';

function fill(): void {
  const g = globalThis as unknown as { chrome?: Record<string, unknown>; browser?: Record<string, unknown> };
  const from = g.chrome;
  const to = g.browser;
  if (!from || !to || from === to) return;
  for (const name of Object.keys(from)) {
    try {
      if (to[name] !== from[name])
        Object.defineProperty(to, name, { value: from[name], enumerable: true, configurable: true });
    } catch {
      // one that cannot be set is left as the engine made it
    }
  }
}

const extensionPage = typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
if ((process as unknown as { type?: string }).type === 'service-worker' || extensionPage) {
  try {
    (contextBridge as unknown as { executeInMainWorld: (script: { func: () => void }) => void }).executeInMainWorld({
      func: fill,
    });
  } catch {
    // an engine without this call: extensions that use `browser` stay as they were
  }
}
