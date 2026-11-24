// Keys: which ones the shell answers itself, and which go on to the page or to Longboard's screens.
import { shortcutFor, type Shortcut } from '../../shared/shortcuts';
import { app, type WebContents } from 'electron';
import { keyToAction } from '../../layer/input/keys';
import { strayKeyCode } from '../../shared/player-keys';
import { mapButton } from '../../shared/settings';
import type { Core } from './core';
import { isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface KeysPart {
  frameField: { pointer: boolean } | null;
  sentKeys: { key: string; until: number }[];
  toggleMenu: () => void;
  awayAt: number;
  /** Tells every layer the button mappings as they now are; pages opened later get them when they start. */
  sendKeys: () => void;
}

export function createKeys(core: Core): Omit<KeysPart, 'frameField' | 'awayAt'> {
  // While the on-screen keyboard is up for a text field inside an embedded
  // frame, that frame has the keys. The shell takes the arrows, OK and Back
  // before the frame sees them and hands them to the page's layer, which
  // has the keyboard. Keys the shell itself sends for that keyboard (Enter,
  // backspace) are let through, as is anything typed on a real keyboard.
  core.frameField = null;
  const sentKeys: { key: string; until: number }[] = [];
  core.eachPage((wc) =>
    wc.on('before-input-event', (event, input) => {
      if (wc !== core.page || !core.frameField || core.pointerOn || core.active() !== core.page) return;
      const now = Date.now();
      while (sentKeys.length && sentKeys[0]!.until < now) sentKeys.shift();
      const mine = sentKeys.findIndex((k) => k.key === input.key);
      if (mine !== -1) {
        if (input.type === 'keyUp') sentKeys.splice(mine, 1);
        return;
      }
      if (input.key === 'Backspace') return;
      const action = keyToAction(
        { key: input.key, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift },
        'browse',
        core.config.keys,
      );
      if (!action || (action.type !== 'move' && action.type !== 'select' && action.type !== 'back')) return;
      event.preventDefault();
      // Handed over after this event has been dealt with: acting on the page
      // from inside the handling of a key event stalls the key (as in pointer mode).
      if (input.type === 'keyDown')
        setImmediate(() => {
          if (core.frameField && !core.page.isDestroyed()) core.page.send('longboard:frame-key', action);
        });
    }),
  );
  core.eachPage((wc) =>
    wc.on('did-start-navigation', (details) => {
      if (wc === core.page && details.isMainFrame && !details.isSameDocument && core.frameField) {
        core.frameField = null;
        if (!core.pointerOn) core.detach();
      }
    }),
  );
  // A key that reaches a website while one of Longboard's own screens is in
  // front (the menu, Settings, Home) belongs to that screen. It should never
  // happen, since the screen in front is given the keys; Andrew saw it happen
  // at a TV on 2026-11-23 (the menu open, the keys still moving the page, and
  // so no way to close the menu), by a road not yet found. Whatever the
  // road, the key is taken from the page, the screen in front is given the
  // keys again, and the key is passed on to it. Keys Longboard itself sends
  // a page (a player's pause as the page is left) are let through.
  core.eachPage((wc) =>
    wc.on('before-input-event', (event, input) => {
      const front = core.active();
      if (front === wc || front !== core.chrome || core.chrome.isDestroyed()) return;
      const now = Date.now();
      while (core.ownKeys.length && core.ownKeys[0]!.until < now) core.ownKeys.shift();
      const mine = core.ownKeys.findIndex((k) => k.to === wc && k.key === input.key);
      if (mine !== -1) {
        if (input.type === 'keyUp') core.ownKeys.splice(mine, 1);
        return;
      }
      event.preventDefault();
      // The menu key, Quit and the like are acted on by the shell itself, wherever they arrive (below).
      const own = keyToAction(
        { key: input.key, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift },
        'text',
        core.config.keys,
      );
      const keyCode =
        own && (own.type === 'menu' || own.type === 'exit' || own.type === 'voice' || own.type === 'pointer')
          ? null
          : strayKeyCode(input.key);
      if (!core.strayLogged) {
        core.strayLogged = true;
        console.error(
          '[longboard] a key reached the page while another screen was in front; it was passed on to that screen',
        );
      }
      setImmediate(() => {
        if (core.chrome.isDestroyed() || core.active() !== core.chrome) return;
        core.chrome.focus();
        if (keyCode && (input.type === 'keyDown' || input.type === 'keyUp'))
          core.chrome.sendInputEvent({ type: input.type, keyCode });
      });
    }),
  );
  // In pointer mode the shell takes the keys before the page sees them: the
  // pointer must work wherever in the page the keys would have gone.
  core.eachPage((wc) =>
    wc.on('before-input-event', (event, input) => {
      if (wc !== core.page || !core.pointerOn || core.active() !== core.page) return;
      const action = keyToAction(
        { key: input.key, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift },
        'browse',
        core.config.keys,
      );
      if (!action || (action.type !== 'move' && action.type !== 'select' && action.type !== 'back')) return;
      event.preventDefault();
      if (input.type !== 'keyDown') return;
      const repeat = input.isAutoRepeat;
      // Acted on after this event has been dealt with: sending the page a mouse
      // event from inside the handling of a key event stalls the key.
      setImmediate(() => {
        if (!core.pointerOn || core.page.isDestroyed()) return;
        if (action.type === 'move') core.keyPointer(action.dir, repeat);
        else if (repeat) return;
        else if (core.edit) {
          // In the editor OK picks what is under the pointer, and Back opens the editor's panel.
          if (action.type === 'select') core.pickForEdit();
          else core.openEditPanel();
        } else if (action.type === 'select') core.pressPointer();
        else core.setPointer(false);
      });
    }),
  );

  // The page is told when another is on its way and when it has come, and
  // draws a line along the top meanwhile (the layer's overlay). The page
  // being left is the one that hears the start; the new one starts with the
  // line showing and hears the end.
  core.eachPage((wc) => {
    const said = (on: boolean): void => {
      if (wc.isDestroyed() || core.arriving.has(wc) === on) return;
      if (on) core.arriving.add(wc);
      else core.arriving.delete(wc);
      wc.send('longboard:loading', on);
      if (wc === core.page && core.panel === 'menu') core.refreshChrome();
    };
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument && !isNotice(details.url)) said(true);
    });
    wc.on('did-stop-loading', () => said(false));
    wc.on('did-fail-load', (_e, _code, _text, _url, isMainFrame) => {
      if (isMainFrame) said(false);
    });
  });

  /** A desk browser's keyboard shortcut (shared/shortcuts.ts), done with what the menu already does. */
  const runShortcut = (shortcut: Shortcut): void => {
    if (core.win.isDestroyed()) return;
    const onPage = core.surface === 'page';
    const step = (by: number): void => {
      const places = core.tabPlaces();
      const at = places.indexOf(core.partition);
      if (places.length > 1 && at >= 0) core.tabAction('switch', places[(at + by + places.length) % places.length]);
    };
    switch (shortcut) {
      case 'address':
        if (onPage) {
          core.panel = 'menu';
          core.layout();
        } else if (core.panel) {
          core.panel = null;
          core.layout();
        }
        if (!core.chrome.isDestroyed()) core.chrome.send('longboard:type-address');
        break;
      case 'newTab':
        core.tabAction('new', undefined);
        break;
      case 'privateTab':
        core.tabAction('private', undefined);
        break;
      case 'reopenTab':
        core.tabAction('reopen', undefined);
        break;
      case 'closeTab':
        if (core.isTab(core.partition)) core.tabAction('close', core.partition);
        break;
      case 'nextTab':
        step(1);
        break;
      case 'previousTab':
        step(-1);
        break;
      case 'history':
        core.menu('history');
        break;
      case 'downloads':
        core.menu('downloads');
        break;
      case 'reload':
      case 'back':
      case 'forward':
      case 'find':
      case 'zoomIn':
      case 'zoomOut':
      case 'zoomReset':
        if (onPage) core.menu(shortcut);
        break;
      case 'savePage':
        if (onPage && !core.saved.some((p) => p.url === core.page.getURL())) core.menu('savePage');
        break;
    }
  };

  const toggleMenu = (): void => {
    if (core.panel === 'prompt') return;
    core.stopGlide();
    // While a profile is being edited the menu key opens the editor's panel.
    core.panel = core.panel ? null : core.edit ? 'edit' : 'menu';
    if (core.panel === 'menu' && core.surface === 'page') core.menuLearned();
    core.layout();
  };

  // If the desktop never says the window has focus again, a key press in it
  // still proves someone is here. (Not the layer's own pause key, just sent.)
  core.awayAt = 0;
  const watchKeys = (wc: WebContents): void => {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || (wc !== core.chrome && wc !== core.page)) return;
      if (core.awayAt !== 0 && Date.now() - core.awayAt > 1500) core.returned();
      // Settings is waiting for a button to give to an action: this press is it.
      if (core.capturing && wc === core.chrome && core.panel === 'settings') {
        event.preventDefault();
        const action = core.capturing;
        core.capturing = null;
        const next =
          input.key === 'Escape' || input.key === 'Backspace'
            ? null
            : mapButton(core.config.keys, input.key, input.control, action);
        if (next && core.deps.settings.set('keys', next)) {
          sendKeys();
          core.notify('That button is set');
        } else
          core.notify(
            input.key === 'Escape' || input.key === 'Backspace'
              ? 'No button was set'
              : 'That button cannot be used for this',
          );
        core.layout();
        return;
      }
      // Quit and the menu must work whatever the page is doing, and wherever
      // in the page the keys are going (an embedded frame has no layer).
      const action = keyToAction(
        { key: input.key, ctrlKey: input.control, altKey: input.alt, metaKey: input.meta, shiftKey: input.shift },
        'text',
        core.config.keys,
      );
      if (action?.type === 'exit') {
        event.preventDefault();
        app.quit();
      } else if (action?.type === 'menu') {
        event.preventDefault();
        toggleMenu();
      } else if (action?.type === 'voice') {
        event.preventDefault();
        setImmediate(core.speak);
      } else if (action?.type === 'pointer') {
        event.preventDefault();
        // After this event, for the reason given in the pointer's own key handling.
        if (wc === core.page && core.active() === core.page) setImmediate(() => core.setPointer(!core.pointerOn));
      } else if (!action && input.key === 'BrowserHome') {
        // A remote's Home button, unless Settings gave it another job.
        event.preventDefault();
        if (core.panel !== 'prompt' && core.panel !== 'pin' && !core.edit) setImmediate(() => core.menu('home'));
      } else if (!action) {
        const shortcut = shortcutFor(input, core.config.keys);
        if (!shortcut || core.panel === 'prompt' || core.panel === 'pin' || core.edit) return;
        event.preventDefault();
        // After this event: several of these change which view has the keys.
        setImmediate(() => runShortcut(shortcut));
      }
    });
  };
  /** Tells every layer the button mappings as they now are; pages opened later get them when they start. */
  const sendKeys = (): void => {
    for (const wc of [core.chrome, ...[...core.views.values()].map((v) => v.webContents)])
      if (!wc.isDestroyed()) wc.send('longboard:keys', core.config.keys);
  };
  watchKeys(core.chrome);
  core.eachPage(watchKeys);
  return { sentKeys, toggleMenu, sendKeys };
}
