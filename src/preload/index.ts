// Sandboxed preload of the page view. The whole layer runs here, in the
// isolated world. Nothing is exposed to the page: there is no contextBridge
// API, so site scripts cannot call into the app.
import { ipcRenderer } from 'electron';
import type { Action, BootData, BridgeMessage } from '../shared/actions';
import { parseAdapter } from '../layer/adapter/adapter';
import { startLayer, type Layer } from '../layer/index';

const start = (): void => {
  // Only the top frame gets a layer; embedded frames are left alone.
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
  // A menu entry that stands for a key.
  ipcRenderer.on('longboard:action', (_event, name: unknown) => {
    const actions: Record<string, Action> = { diagnostics: { type: 'diagnostics' } };
    if (typeof name === 'string' && Object.hasOwn(actions, name)) layer.dispatch(actions[name]!);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
