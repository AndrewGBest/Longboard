// Sandboxed preload of the page view. The whole layer runs here, in the
// isolated world. Nothing is exposed to the page: there is no contextBridge
// API, so site scripts cannot call into the app.
import { ipcRenderer } from 'electron';
import type { Action, BootData, BridgeMessage, PointerSpot } from '../shared/actions';
import { parseAdapter } from '../layer/adapter/adapter';
import { installPurchaseGuard } from '../layer/guard/purchase-guard';
import { startLayer, type Layer } from '../layer/index';

/**
 * Inside an embedded frame there is no layer. The one thing done there, and
 * only in a scripted run, is the purchase guard: pointer mode sends real
 * clicks, and those reach frames too (Hard rule 11). The frame tells the
 * shell the guard is up, so the shell knows a click there will be checked.
 */
function guardFrame(): void {
  if (!process.argv.includes('--longboard-automation')) return;
  installPurchaseGuard(document, [], () => ipcRenderer.send('longboard:frame', 'blocked'));
  ipcRenderer.send('longboard:frame', 'guarded');
}

const start = (): void => {
  if (window.top !== window) return;
  // Asked for when the page starts, so the shell can choose by the page's address.
  const boot = (ipcRenderer.sendSync('longboard:boot') as BootData | null) ?? { options: { dev: false, automation: false }, adapter: null };
  const send = (msg: BridgeMessage): void => ipcRenderer.send('longboard:msg', msg);
  const layer: Layer = startLayer({
    doc: document,
    options: boot.options,
    adapter: parseAdapter(boot.adapter, document),
    send,
  });

  // From the shell to the layer. These arrive in the isolated world; the
  // page's own scripts never see them.
  ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
    if (typeof text === 'string') layer.notice(text.slice(0, 200));
  });
  // The window is no longer the one in front.
  ipcRenderer.on('longboard:away', () => layer.away());
  // Pointer mode: where the pointer is now, or null when it has been put away.
  ipcRenderer.on('longboard:pointer', (_event, spot: PointerSpot) => {
    const ok = spot && typeof spot.x === 'number' && typeof spot.y === 'number';
    layer.pointer(ok ? { x: spot.x, y: spot.y } : null);
  });
  // Under automation the shell asks before it clicks (Hard rule 11).
  ipcRenderer.on('longboard:pointer-check', (_event, ask: { id: number; x: number; y: number }) => {
    const answer = layer.mayClickAt(ask.x, ask.y);
    if (answer !== 'no') send({ kind: 'pointerClickOk', id: ask.id, frame: answer === 'frame' });
  });
  // A menu entry that stands for a key.
  ipcRenderer.on('longboard:action', (_event, name: unknown) => {
    const actions: Record<string, Action> = { diagnostics: { type: 'diagnostics' } };
    if (typeof name === 'string' && Object.hasOwn(actions, name)) layer.dispatch(actions[name]!);
  });
};

if (window.top !== window) {
  guardFrame();
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
