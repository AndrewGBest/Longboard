// The preload of the listening page (src/voice/page.ts). The page is
// Longboard's own, served from this machine, and sees no website. It has no
// API from the shell: it and this preload pass plain messages across the
// window, and this passes them on.
import { ipcRenderer } from 'electron';

window.addEventListener('message', (e) => {
  const data = e.data as { from?: unknown } | null;
  if (e.source !== window || !data || typeof data !== 'object' || data.from !== 'voice-page') return;
  ipcRenderer.send('longboard:voice', data);
});
ipcRenderer.on('longboard:voice-do', (_event, what: unknown) => window.postMessage({ from: 'voice-shell', what }, '*'));
