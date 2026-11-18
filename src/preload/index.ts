// Sandboxed preload of the page view. The whole layer runs here, in the
// isolated world. Nothing is exposed to the page: there is no contextBridge
// API, so site scripts cannot call into the app.
import { ipcRenderer } from 'electron';
import type { Action, BootData, BridgeMessage, EditView, PointerSpot } from '../shared/actions';
import { rulesFromUntrusted } from '../layer/profile/rules';
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

// In a scripted run the guard goes up now, before any of the page's own
// scripts have run, so nothing the page sets up can get in ahead of it.
// What it says when it stops something waits for the layer to exist.
const scripted = process.argv.includes('--longboard-automation');
const guarded: string[] = [];
let sayBlocked: () => void = () => undefined;
if (scripted && window.top === window) installPurchaseGuard(document, guarded, () => sayBlocked());

/** Puts new button mappings into the object the layer holds. Only names and strings are taken. */
function replaceKeys(into: Record<string, string>, keys: unknown): void {
  if (!into || !keys || typeof keys !== 'object') return;
  for (const key of Object.keys(into)) delete into[key];
  for (const [key, action] of Object.entries(keys as Record<string, unknown>).slice(0, 200)) if (typeof action === 'string') into[key] = action;
}

const start = (): void => {
  if (window.top !== window) return;
  // Asked for when the page starts, so the shell can choose by the page's address.
  const boot = (ipcRenderer.sendSync('longboard:boot') as BootData | null) ?? { options: { dev: false, automation: process.argv.includes('--longboard-automation') }, profile: null };
  const send = (msg: BridgeMessage): void => ipcRenderer.send('longboard:msg', msg);
  // The one object of button mappings the layer reads; Settings can change what is in it.
  const held = ((boot.options as { keys?: Record<string, string> }).keys ??= {});
  const layer: Layer = startLayer({
    doc: document,
    options: boot.options,
    rules: rulesFromUntrusted(boot.profile, document),
    send,
  });
  if (scripted) {
    // The profile's own list of purchase controls joins the early guard.
    guarded.push(...rulesFromUntrusted(boot.profile, document).selectors.purchaseControls);
    sayBlocked = () => layer.notice('Blocked: automation mode never activates purchase or sign-up controls');
  }

  // From the shell to the layer. These arrive in the isolated world; the
  // page's own scripts never see them.
  ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
    if (typeof text === 'string') layer.notice(text.slice(0, 200));
  });
  // The window is no longer the one in front.
  ipcRenderer.on('longboard:away', () => layer.away());
  // Button mappings changed in Settings: the layer reads this object at every key.
  ipcRenderer.on('longboard:keys', (_event, keys: unknown) => replaceKeys(held, keys));
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
  // The profile editor (see main/browser.ts): pick what is at a point, draw
  // the marks, and drive the page by the draft as it changes.
  ipcRenderer.on('longboard:edit-pick', (_event, at: { x: number; y: number }) => {
    if (at && typeof at.x === 'number' && typeof at.y === 'number') layer.editPick(at.x, at.y);
  });
  ipcRenderer.on('longboard:edit-show', (_event, view: EditView | null) => {
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 60) : []);
    if (!view || typeof view !== 'object') layer.editShow(null);
    else {
      layer.editShow({
        picked: typeof view.picked === 'string' ? view.picked : null,
        marks: { include: list(view.marks?.include), exclude: list(view.marks?.exclude), row: list(view.marks?.row), player: list(view.marks?.player) },
      });
    }
  });
  ipcRenderer.on('longboard:rules', (_event, profile: unknown) => layer.setRules(rulesFromUntrusted(profile, document)));
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
