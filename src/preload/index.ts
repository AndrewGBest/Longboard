// Sandboxed preload of the page view. The whole layer runs here, in the
// isolated world. Nothing is exposed to the page: there is no contextBridge
// API, so site scripts cannot call into the app.
import { contextBridge, ipcRenderer } from 'electron';
import { correctAudioAnswers } from '../shared/audio-truth';
import { fillLogin, watchLogins } from '../layer/logins';
import type { Action, BootData, BridgeMessage, EditView, PointerSpot } from '../shared/actions';
import { rulesFromUntrusted } from '../layer/profile/rules';
import { installPurchaseGuard } from '../layer/guard/purchase-guard';
import { startLayer, type Layer } from '../layer/index';
import { readArticle } from '../layer/reader';
import { Referee } from '../layer/diagnostics/referee';
import { HOST_TAG } from '../layer/ui/overlay';
import { isSecretField } from '../shared/osk';

/**
 * Inside an embedded frame there is no layer. The one thing done there, and
 * only in a scripted run, is the purchase guard: pointer mode sends real
 * clicks, and those reach frames too (Hard rule 11). The frame tells the
 * shell the guard is up, so the shell knows a click there will be checked.
 */
function guardFrame(): void {
  if (!process.argv.includes('--longboard-automation')) return;
  installPurchaseGuard(document, [], () => ipcRenderer.send('longboard:frame', 'blocked'));
  // Said now, and again once the document is there: the first word can
  // reach the shell before the shell hears that the frame has gone to this
  // page, and is then forgotten with the page before. (Seen on a film
  // service's sign-in frame, 2026-11-21: guarded, and never known to be.)
  const say = (): void => ipcRenderer.send('longboard:frame', 'guarded');
  say();
  document.addEventListener('DOMContentLoaded', say, { once: true });
  window.addEventListener('load', say, { once: true });
}

/**
 * The other thing done in a frame: saying when a click (pointer mode's, or a
 * mouse's) has put the cursor in a text field there, and when it has left,
 * so the on-screen keyboard can come up for it. A sign-in prompt is often a
 * frame from the service's own sign-in site. Only that a field has the
 * cursor is said, whether it is a secret one, the page's word for the Enter
 * key and where the field is; never what is in it.
 */
function watchFrameFields(): (el: Element) => void {
  const isField = (el: EventTarget | null): el is HTMLElement => {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !['button', 'submit', 'checkbox', 'radio', 'range', 'reset', 'file', 'image', 'color', 'hidden'].includes(el.type);
    return el instanceof HTMLElement && el.isContentEditable;
  };
  let pressedAt = 0;
  let told = false;
  window.addEventListener('mousedown', (e) => {
    if (e.isTrusted) pressedAt = Date.now();
  }, true);
  const say = (el: HTMLElement): void => {
    const box = el.getBoundingClientRect();
    told = true;
    ipcRenderer.send('longboard:frame', {
      field: 'in',
      secret: isSecretField(el.getAttribute('type'), el.getAttribute('autocomplete'), `${el.getAttribute('name') ?? ''} ${el.id}`),
      hint: (el.getAttribute('enterkeyhint') ?? '').toLowerCase().slice(0, 10),
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
    });
  };
  window.addEventListener('focusin', (e) => {
    // Only a field a click just went to, or the next one while the keyboard is already up for this frame.
    if (isField(e.target) && (told || Date.now() - pressedAt < 1500)) say(e.target);
  }, true);
  // A click on a field that already had the cursor.
  window.addEventListener('mouseup', (e) => {
    if (e.isTrusted && !told && isField(document.activeElement) && document.activeElement.contains(e.target as Node)) say(document.activeElement);
  }, true);
  const gone = (): void => {
    if (!told) return;
    // The cursor may be on its way to the next field: wait and see.
    setTimeout(() => {
      if (isField(document.activeElement) && document.hasFocus()) return;
      told = false;
      ipcRenderer.send('longboard:frame', { field: 'out' });
    }, 50);
  };
  window.addEventListener('focusout', gone, true);
  window.addEventListener('blur', gone);
  return (el) => {
    if (isField(el)) say(el);
  };
}

/**
 * A layer of its own for a frame, started the first time the highlight is
 * sent into it. It moves the highlight among what is in the frame and
 * presses what OK is pressed on, as in the page. It has no keyboard, menu
 * or pointer of its own: those are the page's, and it asks the shell for
 * them in a few fixed words. A press with nowhere to go leaves the frame.
 */
function frameLayer(sayField: (el: Element) => void): void {
  let layer: Layer | null = null;
  const tell = (what: Record<string, unknown>): void => ipcRenderer.send('longboard:frame', what);
  let frameFront: boolean | null | undefined;
  const started = (made: Layer): Layer => {
    if (frameFront !== undefined) made.front(frameFront);
    return made;
  };
  const begin = (): Layer =>
    (layer ??= started(startLayer({
      doc: document,
      options: { dev: false, automation: process.argv.includes('--longboard-automation') },
      rules: rulesFromUntrusted(null, document),
      // Of all a layer may ask the shell, a frame's may ask for these only.
      send: (msg) => {
        if (msg.kind === 'frameEnter') tell({ enter: true, stay: msg.stay === true });
        else if (msg.kind === 'menu') tell({ menu: true });
        else if (msg.kind === 'pointer' && msg.x === undefined) tell({ pointer: true });
        // A player inside the frame: its keys are pressed by the shell, as on
        // any page, and its controls are brought up by a pointer movement.
        else if (msg.kind === 'playerKey') tell({ playerKey: msg.key });
        else if (msg.kind === 'revealControls') tell({ reveal: true });
        else if (msg.kind === 'pictureClick') tell({ click: true });
      },
      frame: {
        exit: (how) => tell({ exit: how }),
        field: sayField,
      },
    })));
  // The shell asks every frame; the one that has the cursor answers.
  ipcRenderer.on('longboard:frame-enter', (_event, stay: unknown) => {
    if (!document.hasFocus() || document.activeElement instanceof HTMLIFrameElement) return;
    const taken = begin().takeHighlight(stay === true);
    tell({ entered: taken, player: taken && begin().framePlayer() });
  });
  ipcRenderer.on('longboard:frame-out', () => layer?.dropHighlight());
  ipcRenderer.on('longboard:front', (_event, on: unknown) => {
    frameFront = on === null ? null : on === true;
    layer?.front(frameFront);
  });
  ipcRenderer.on('longboard:frame-in', (_event, state: unknown) => {
    if (state === 'in' || state === 'none' || state === 'lost') layer?.frameIn(state);
  });
  ipcRenderer.on('longboard:frame-exit', (_event, how: unknown) => {
    if (how === 'up' || how === 'down' || how === 'left' || how === 'right' || how === 'back') layer?.frameExit(how);
  });
}

// In a scripted run the guard goes up now, before any of the page's own
// scripts have run, so nothing the page sets up can get in ahead of it.
// What it says when it stops something waits for the layer to exist.
// On Linux the engine says it can play two kinds of sound it cannot decode.
// The answer is put right in the page's own world before the page's scripts
// run, in every frame (shared/audio-truth.ts). Nothing is exposed to the
// page by this: one function is run there once and nothing of Longboard's
// stays reachable.
if (process.platform === 'linux') {
  try {
    (contextBridge as unknown as { executeInMainWorld: (script: { func: () => void }) => void }).executeInMainWorld({ func: correctAudioAnswers });
  } catch {
    // an engine without this call: pages get the engine's own answers
  }
}

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
  // What the page says its icons are, for its tile on Home. Read, never changed;
  // said again once everything has loaded, since many pages add them late.
  let saidIcons = '';
  const sayIcons = (): void => {
    const list = [...document.querySelectorAll<HTMLLinkElement>('link[rel][href]')]
      .filter((l) => /(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed|manifest)(\s|$)/i.test(l.rel) && /^https?:/i.test(l.href))
      .slice(0, 24)
      .map((l) => ({ href: l.href, rel: l.rel.toLowerCase(), sizes: l.getAttribute('sizes') ?? '' }));
    const key = JSON.stringify(list);
    if (key === saidIcons) return;
    saidIcons = key;
    send({ kind: 'icons', list });
  };
  if (/^https?:$/.test(location.protocol)) {
    sayIcons();
    if (document.readyState !== 'complete') window.addEventListener('load', sayIcons, { once: true });
  }
  if (scripted) {
    // The referee, for the scorecard: a script presses Tab and asks here
    // where it stopped. It lives in this isolated world, where the page's
    // own scripts cannot see or call it, and only in a scripted run.
    const referee = new Referee(document, () => layer.candidates(), HOST_TAG);
    // `targets` says what the highlight can reach now, as kinds and boxes only: for working out why a page goes wrong.
    const targets = (): string[] => layer.candidates().map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    });
    (globalThis as { longboardReferee?: unknown }).longboardReferee = { note: () => referee.note(), report: () => referee.report(), targets };
    // The profile's own list of purchase controls joins the early guard.
    guarded.push(...rulesFromUntrusted(boot.profile, document).selectors.purchaseControls);
    sayBlocked = () => layer.notice('Blocked: automation mode never activates purchase or sign-up controls');
  }

  // From the shell to the layer. These arrive in the isolated world; the
  // page's own scripts never see them.
  // A phone has sent text: the layer says whether a text field has the cursor for it.
  ipcRenderer.on('longboard:phone-text', (_event, id: unknown) => {
    if (typeof id === 'number') layer.phoneText(id);
  });
  // A text field inside an embedded frame has the cursor (or no longer has): the keyboard comes up for it here.
  ipcRenderer.on('longboard:frame-field', (_event, field: unknown) => {
    const f = field as { hint?: unknown; top?: unknown; bottom?: unknown } | null;
    layer.frameField(f && typeof f === 'object' ? { hint: typeof f.hint === 'string' ? f.hint : '', top: Number(f.top) || 0, bottom: Number(f.bottom) || 0 } : null);
  });
  // The highlight was asked into a frame, or has come out of one.
  ipcRenderer.on('longboard:frame-in', (_event, state: unknown, player: unknown) => {
    if (state === 'in' || state === 'none' || state === 'lost') layer.frameIn(state, player === true);
  });
  ipcRenderer.on('longboard:frame-exit', (_event, how: unknown) => {
    if (how === 'up' || how === 'down' || how === 'left' || how === 'right' || how === 'back') layer.frameExit(how);
  });
  // A key the shell took while that keyboard is up (the frame has the keys, not this page).
  ipcRenderer.on('longboard:frame-key', (_event, action: unknown) => {
    const a = action as Action | null;
    if (a && typeof a === 'object' && (a.type === 'move' || a.type === 'select' || a.type === 'back')) layer.dispatch(a.type === 'move' ? { type: 'move', dir: a.dir } : { type: a.type });
  });
  ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
    if (typeof text === 'string') layer.notice(text.slice(0, 200));
  });
  // Saved sign-ins, only where the shell says they are on (never in a scripted run, Hard rule 10):
  // the shell is told there is a sign-in form and what was typed into it when it is sent, and may fill it in.
  if (boot.options.logins === true && !scripted) {
    watchLogins(document, { seen: () => send({ kind: 'loginSeen' }), sent: (login) => send({ kind: 'credentials', ...login }) });
    ipcRenderer.on('longboard:fill', (_event, login: { user?: unknown; password?: unknown }) => {
      if (login && typeof login.user === 'string' && typeof login.password === 'string') fillLogin(document, login.user, login.password);
    });
  }
  // A page is arriving: this one until it has all come, or the one that will replace it.
  ipcRenderer.on('longboard:loading', (_event, on: unknown) => layer.loading(on === true));
  if (document.readyState !== 'complete' && /^https?:$/.test(location.protocol)) {
    layer.loading(true);
    // The shell says when everything has come; this is for a page it never hears the end of.
    window.addEventListener('load', () => window.setTimeout(() => layer.loading(false), 4000), { once: true });
  }
  // The window is no longer the one in front.
  ipcRenderer.on('longboard:away', () => layer.away());
  ipcRenderer.on('longboard:front', (_event, on: unknown) => layer.front(on === null ? null : on === true));
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
    // Reader view: the article's words are read here and shown on a screen of Longboard's own.
    if (name === 'reader') {
      let article: ReturnType<typeof readArticle> = null;
      try {
        article = readArticle(document);
      } catch {
        // a page that cannot be read has no article
      }
      send({ kind: 'reader', article });
      return;
    }
    const actions: Record<string, Action> = { diagnostics: { type: 'diagnostics' } };
    if (typeof name === 'string' && Object.hasOwn(actions, name)) layer.dispatch(actions[name]!);
  });
};

if (window.top !== window) {
  guardFrame();
  frameLayer(watchFrameFields());
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
