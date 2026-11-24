// Longboard's own screens: Home, the menu panel, About, and questions. This
// is the preload of the chrome view, which only ever shows chrome.html. It
// draws everything from the isolated world and talks to the shell directly;
// the page itself has no script and no API (Hard rule 13).
//
// The highlight here is moved by the same layer that drives websites, so
// Longboard's own interface is the first user of its navigation engine.
//
// This file listens to the shell and starts the layer. Each screen is drawn
// by a function in ./screens; how they look is in chrome.html; the parts
// they are built from (rows, switches, icons) are in ./parts.
import { ipcRenderer } from 'electron';

import { startLayer } from '../layer/index';
import { genericRules } from '../layer/profile/rules';
import { type ChromeState } from '../shared/chrome';
import { PRODUCT } from '../shared/product';
import { drawClock, focusedTile, showSuggestions } from './screens/home';
import { pinKey } from './screens/panels';
import { render } from './screens/render';
import { boot, send, tell, ui } from './screens/ui';

// A new state from the shell. Before it is drawn, what the screens remember
// between drawings (ui) is put back to its start for any screen that has closed.

ipcRenderer.on('longboard:chrome-state', (_event, next: ChromeState) => {
  // A panel that opens or closes ends any typing in the Home field.
  if (ui.state && (ui.state.panel !== next.panel || ui.state.surface !== next.surface)) ui.typing = false;
  // The menu opens on its first page each time, and a chooser does not outlive its screen.
  if (next.panel !== 'menu' || ui.state?.panel !== 'menu') ui.menuPage = 'main';
  if (next.panel !== 'settings') ui.choosing = null;
  if (next.panel !== 'find') ui.finding = '';
  if (next.panel !== 'history') ui.historyWords = '';
  // Settings opens on its first page each time; coming back from choosing a PIN it is where it was.
  if (next.panel !== 'settings' && next.panel !== 'pin') ui.settingsPage = 'main';
  if (next.panel !== 'pin' || ui.state?.panel !== 'pin') ui.pinDigits = '';
  if (next.panel !== 'settings') ui.confirming = null;
  // The "add as an app" panel starts from the page's own name each time it opens.
  if (next.panel === 'addApp' && ui.state?.panel !== 'addApp')
    ui.draft = { name: next.page?.title || next.page?.site || '', ownSession: false, launcher: true };
  // The menu opened from Home is about the tile the highlight was on.
  if (next.panel === 'menu' && ui.state && ui.state.panel === null && ui.state.surface === 'home')
    ui.menuFor = focusedTile(ui.state);
  else if (next.panel !== 'menu') ui.menuFor = null;
  ui.state = next;
  render();
});
// A site's own icon, to be drawn small and handed back as a PNG made here.
// This process is sandboxed, so it is the right place for a picture from a
// website to be decoded; the shell never decodes one.
ipcRenderer.on('longboard:icon', (_event, job: { id: number; dataUrl: string; size: number }) => {
  if (!job || typeof job.id !== 'number' || typeof job.dataUrl !== 'string' || !job.dataUrl.startsWith('data:image/'))
    return;
  const size = Math.min(256, Math.max(16, Number(job.size) || 128));
  const done = (png: string | null): void => tell({ kind: 'icon', id: job.id, png });
  const img = new Image();
  img.onerror = () => done(null);
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const w = img.naturalWidth || size;
      const h = img.naturalHeight || size;
      const scale = Math.min(size / w, size / h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return done(null);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
      done(canvas.toDataURL('image/png'));
    } catch {
      done(null);
    }
  };
  img.src = job.dataUrl;
});
// Whether this view is the one in front. Null: the shell cannot say, and the layer goes by what the window hears.
ipcRenderer.on('longboard:front', (_event, on: unknown) => ui.layer?.front(on === null ? null : on === true));
// Button mappings changed in Settings. The layer reads this object at every
// key, so it is emptied and refilled in place, never replaced.
ipcRenderer.on('longboard:keys', (_event, keys: unknown) => {
  const held = ((boot.options as { keys?: Record<string, string> }).keys ??= {});
  if (!keys || typeof keys !== 'object') return;
  for (const key of Object.keys(held)) delete held[key];
  for (const [key, action] of Object.entries(keys as Record<string, unknown>).slice(0, 200))
    if (typeof action === 'string') held[key] = action;
});
ipcRenderer.on(
  'longboard:suggestions',
  (_event, reply: { text: string; list: Array<{ url: string; text: string; search?: boolean }> }) => {
    const field = (document.getElementById('address') ??
      document.getElementById('menu-address')) as HTMLInputElement | null;
    // Only for what is in the field now: an answer to something typed earlier is out of date.
    if (!reply || !field || field.value !== reply.text || !Array.isArray(reply.list)) return;
    showSuggestions(reply.list.slice(0, 7).filter((x) => x && typeof x.url === 'string' && typeof x.text === 'string'));
  },
);
// Ctrl+L on a keyboard: straight into the address field, on Home or in the menu.
ipcRenderer.on('longboard:type-address', () => {
  const inMenu = document.getElementById('menu-address');
  if (inMenu) ui.layer?.typeIn(inMenu);
  else if (!ui.state?.panel) document.getElementById('go')?.click();
});
// A phone has sent text: the layer says whether a text field has the cursor for it.
ipcRenderer.on('longboard:phone-text', (_event, id: unknown) => {
  if (typeof id === 'number') ui.layer?.phoneText(id);
});
ipcRenderer.on('longboard:notice', (_event, text: unknown) => {
  if (typeof text === 'string') ui.layer?.notice(text.slice(0, 200));
});

const start = (): void => {
  document.title = PRODUCT.name;
  // A remote's number buttons, or a keyboard's, enter the PIN directly.
  document.addEventListener(
    'keydown',
    (e) => {
      if (ui.state?.panel !== 'pin' || !e.isTrusted) return;
      if (/^\d$/.test(e.key)) pinKey(e.key);
      else if (e.key === 'Backspace') pinKey('delete');
      else return;
      e.preventDefault();
    },
    true,
  );
  window.setInterval(drawClock, 5000);
  ui.layer = startLayer({
    doc: document,
    options: boot.options,
    // Longboard's own screens are not a site to be worked out: everything on
    // them is a real control, and nothing is read by scrolling.
    rules: { ...genericRules(), generic: false },
    send,
    hooks: {
      // A list on a TV goes round: up from the top is the bottom, down from the bottom is the top.
      edge: (dir) => {
        const panel = document.getElementById('panel');
        if (!panel || (dir !== 'up' && dir !== 'down')) return false;
        // The reader view has nothing to move to above or below its buttons: the arrows move the words.
        if (ui.state?.panel === 'reader') {
          panel.scrollBy({ top: (dir === 'down' ? 1 : -1) * panel.clientHeight * 0.6, behavior: 'smooth' });
          return true;
        }
        const all = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
        const to = dir === 'up' ? all[all.length - 1] : all[0];
        if (!to || all.length < 2) return false;
        ui.layer?.focus(to);
        return true;
      },
      back: () => {
        if (!ui.state) return true;
        // Back out of an address field that is showing suggestions puts the button back.
        if (ui.typing && !ui.state.panel) {
          ui.typing = false;
          render();
          return true;
        }
        if (ui.state.panel === 'prompt') tell({ kind: 'answer', allow: false, remember: false });
        // Back on the editor's panel goes back to pointing; the panel's own buttons end the editing.
        else if (ui.state.panel === 'edit') tell({ kind: 'edit', action: 'pickAgain' });
        // Back inside the menu or Settings goes up a page before it closes.
        else if (ui.state.panel === 'menu' && ui.menuPage === 'site') {
          ui.menuPage = 'main';
          render();
        } else if (ui.state.panel === 'settings' && ui.choosing) {
          ui.choosing = null;
          render();
        } else if (ui.state.panel === 'settings' && ui.state.settings?.folders) tell({ kind: 'folder', path: null });
        else if (ui.state.panel === 'settings' && ui.settingsPage !== 'main') {
          ui.settingsPage = ui.settingsPage === 'adsList' ? 'ads' : 'main';
          ui.confirming = null;
          render();
        } else if (ui.state.panel) tell({ kind: 'menu', action: 'close' });
        else if (ui.state.page) tell({ kind: 'menu', action: 'resume' });
        return true;
      },
    },
  });
  render();
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
