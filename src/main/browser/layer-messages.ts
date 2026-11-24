// Messages from the navigation layer in a page: what it is told as it starts
// (onBoot, which chooses the page's profile from the frame's real address)
// and what it asks for afterwards (onMessage). Only the top frame of a view
// is listened to. Also keeps the display awake while a video plays.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain, powerSaveBlocker, type WebContents } from 'electron';
import { cleanCredentials, loginPlace, shouldOffer } from '../../shared/passwords';
import { type BootData, type BridgeMessage, type Direction, type LayerOptions } from '../../shared/actions';
import { siteName } from '../../shared/address';
import { type ChromeState } from '../../shared/chrome';
import { parsePicked } from '../../shared/editor';
import { typableText } from '../../shared/osk';
import { playerKeyInfo } from '../../shared/player-keys';
import { startPoint } from '../pointer';
import { type Profile } from '../../shared/profile';
import { hoverPoint } from '../zoom';
import { parseArticle } from '../../shared/reader';
import { parseIconLinks } from '../../shared/icons';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface LayerMessagesPart {
  /** What keeps the display awake while a video plays (a powerSaveBlocker id); undefined when nothing does. */
  blocker: number | undefined;
  /** Which way the last sweep of the pointer went. They alternate, so that each one is a real movement. */
  nudge: boolean;
  /** The width and height of a view, in view pixels. */
  viewSize: (wc: WebContents) => [number, number];
  /** Answers a layer as it starts: its options and, for a website, the profile that drives the page. */
  onBoot: (event: Electron.IpcMainEvent) => void;
  /** Acts on what the layer in the page in front, or in Longboard's own screens, asks for. */
  onMessage: (event: Electron.IpcMainEvent, msg: BridgeMessage) => void;
}

export function createLayerMessages(core: Core): Omit<LayerMessagesPart, 'blocker' | 'nudge'> {
  core.blocker = undefined;
  core.nudge = false;
  // An ordinary pointer movement across a point of the picture, which is
  // what brings a player's controls up. One step is not enough on some
  // players, and steps sent together are merged into one, so it is a short
  // sweep spread over time, in alternating directions so every call is a
  // real movement.
  const sweep = (wc: WebContents, cx: number, cy: number): void => {
    core.nudge = !core.nudge;
    const forward = core.nudge;
    const steps = forward ? [0, 20, 40, 60] : [60, 40, 20, 0];
    steps.forEach((dx, i) => {
      setTimeout(() => {
        if (wc.isDestroyed()) return;
        const x = Math.round(cx) + dx;
        const y = Math.round(cy);
        // A real pointer reports how far it moved; some players ignore a move that reports zero.
        wc.sendInputEvent({
          type: 'mouseMove',
          x,
          y,
          globalX: x,
          globalY: y,
          movementX: forward ? 20 : -20,
          movementY: 0,
        });
      }, i * 40);
    });
  };
  const viewSize = (wc: WebContents): [number, number] => {
    const b = (wc === core.page ? core.pageView : core.chromeView).getBounds();
    return [b.width, b.height];
  };

  /** The profile each website view's page is being driven by now. */
  const driving = new WeakMap<WebContents, Profile | null>();
  // A site that changes its address without loading a page (most web apps)
  // can move onto or off the paths a profile is for. The page is the same
  // page, so its layer is told the new rules; nothing is reloaded.
  core.eachPage((wc) =>
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame || core.edit) return;
      const next = core.profileFor(url)?.profile ?? null;
      if (next === (driving.get(wc) ?? null)) return;
      driving.set(wc, next);
      wc.send('longboard:rules', next);
      if (wc !== core.page) return;
      core.layout();
      core.applyZoom();
    }),
  );

  const onBoot = (event: Electron.IpcMainEvent): void => {
    const wc = event.sender;
    const top = event.senderFrame === wc.mainFrame;
    // Any website view is answered, in front or not: a page that starts
    // behind another must still get its options (the automation guard above all).
    if ((!core.isPageView(wc) && wc !== core.chrome) || !top) {
      event.returnValue = null;
      return;
    }
    const place = [...core.views].find(([, v]) => v.webContents === wc)?.[0] ?? '';
    const layerOptions: LayerOptions = {
      ...core.options,
      surface: wc === core.chrome ? 'chrome' : 'page',
      keys: core.config.keys,
      buttons: core.config.buttons ?? {},
      logins: wc !== core.chrome && core.loginsOn() && !core.isPrivate(place),
    };
    const boot: BootData & { state?: ChromeState } = { options: layerOptions, profile: null };
    if (wc === core.chrome) boot.state = core.chromeState();
    else {
      // Chosen by the shell from the frame's real address, never from anything the page says.
      const choice = core.deps.profiles.choose(event.senderFrame?.url ?? '');
      const use = core.profileOffAt(event.senderFrame?.url ?? '')
        ? null
        : choice.kind === 'use'
          ? choice
          : choice.kind === 'ask'
            ? choice.fallback
            : null;
      boot.profile = use?.profile ?? null;
      driving.set(wc, use?.profile ?? null);
      if (choice.kind === 'ask' && wc === core.page && !core.profileOffAt(event.senderFrame?.url ?? '')) {
        const asked = choice.profile;
        setImmediate(() => core.askAboutProfile(asked));
      }
    }
    event.returnValue = boot;
  };
  ipcMain.on('longboard:boot', onBoot);

  const onMessage = (event: Electron.IpcMainEvent, msg: BridgeMessage): void => {
    const wc = event.sender;
    // Only the top frame of one of our two views may talk to the shell.
    if ((wc !== core.page && wc !== core.chrome) || event.senderFrame !== wc.mainFrame) return;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.kind) {
      case 'exit':
        app.quit();
        break;
      case 'playerKey': {
        // An ordinary key press, delivered to the page like one from a keyboard.
        const info = playerKeyInfo(msg.key);
        if (info && core.frameField && wc === core.page && core.attached) {
          // The keyboard's Enter and backspace, for a field inside a frame: the same channel as its letters.
          core.sentKeys.push({ key: info.domKey, until: Date.now() + 1000 });
          const key = {
            key: info.domKey,
            code: info.domKey,
            windowsVirtualKeyCode: info.domKey === 'Enter' ? 13 : 8,
            nativeVirtualKeyCode: info.domKey === 'Enter' ? 13 : 8,
          };
          if (info.domKey === 'Enter' || info.domKey === 'Backspace') {
            void core.page.debugger
              .sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
              .then(() =>
                info.char
                  ? core.page.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', ...key, text: info.char })
                  : undefined,
              )
              .then(() => core.page.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key }))
              .catch(() => undefined);
          }
          break;
        }
        if (info) {
          core.ownKeys.push({ to: wc, key: info.domKey, until: Date.now() + 600 });
          wc.sendInputEvent({ type: 'keyDown', keyCode: info.code });
          if (info.char) wc.sendInputEvent({ type: 'char', keyCode: info.char });
          wc.sendInputEvent({ type: 'keyUp', keyCode: info.code });
        }
        break;
      }
      case 'pointerAway':
        // The pointer has "left the window", as far as the page is concerned,
        // until the mouse is really moved again.
        if (wc === core.page && !core.pointerOn && !wc.isDestroyed())
          wc.sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 });
        break;
      case 'pictureClick': {
        // OK on the bare picture of a player that does not answer its key until it has been clicked.
        if (wc !== core.page || core.active() !== core.page || core.pointerOn) break;
        const at = hoverPoint(msg, core.page.getZoomFactor(), viewSize(core.page));
        if (!at) break;
        core.mouse(at.x, at.y, { type: 'move' });
        core.mouse(at.x, at.y, { type: 'down' });
        core.mouse(at.x, at.y, { type: 'up' });
        break;
      }
      case 'voice':
        core.speak();
        break;
      case 'phoneNo': {
        const held = core.phoneHeld;
        if (!held || held.id !== msg.id || held.to !== wc) break;
        core.phoneHeld = null;
        // Said with no text field selected: it is where to go, or what to search for.
        if (held.from === 'voice') core.openTyped(held.text);
        else core.notify('Choose a text field on the TV first, then send again');
        break;
      }
      case 'phoneOk': {
        const held = core.phoneHeld;
        if (!held || held.id !== msg.id || held.to !== wc || Date.now() - held.at > 3000) break;
        core.phoneHeld = null;
        void wc.insertText(held.text);
        break;
      }
      case 'loginSeen': {
        const at = event.senderFrame?.url ?? '';
        if (wc !== core.page || !core.loginsOn() || core.isPrivate(core.partition) || !loginPlace(at)) break;
        core.loginForms.set(wc, at);
        if (core.passwords.users(loginPlace(at)).length)
          core.notify('A sign-in is saved for this site: open the menu to fill it in');
        break;
      }
      case 'credentials': {
        // What was typed is looked at for one thing: whether to offer to keep it. It is not logged and goes nowhere else.
        const place = loginPlace(event.senderFrame?.url ?? '');
        const login = cleanCredentials(msg);
        if (wc !== core.page || !login || !place) break;
        void core.passwords.reveal(place, login.user).then((kept) => {
          const offer = shouldOffer({
            automation: core.options.automation,
            privateTab: core.isPrivate(core.partition),
            enabled: core.config.passwords !== false,
            available: core.passwords.available(),
            place,
            never: core.passwords.never(),
            alreadyKept: kept === login.password,
          });
          if (!offer || wc.isDestroyed()) return;
          core.typed.set(wc, { place, ...login, at: Date.now() });
          // After a moment: the page is usually on its way to the next one.
          setTimeout(() => {
            if (!wc.isDestroyed() && wc === core.page && core.typedNow(wc))
              core.notify('To keep that password, open the menu');
          }, 2500);
        });
        break;
      }
      case 'typeText': {
        const text = typableText(msg.text);
        if (!text) break;
        // Into a field inside an embedded frame the letters go through the
        // DevTools input channel, as pointer mode's clicks do: Electron's own
        // insertText does not return there, and its key events do not arrive
        // (seen 2026-11-20, a frame from another origin).
        if (core.frameField && wc === core.page && core.attached)
          core.page.debugger.sendCommand('Input.insertText', { text }).catch(() => undefined);
        else void wc.insertText(text);
        break;
      }
      case 'revealControls': {
        const [w, h] = viewSize(wc);
        sweep(wc, w / 2, h / 2);
        break;
      }
      case 'hover': {
        // An ordinary pointer movement to a point the layer names. Page
        // coordinates are CSS pixels; input events are in view pixels.
        const point = hoverPoint(msg, wc.getZoomFactor(), viewSize(wc));
        if (point) {
          // Two steps: a single event is not always treated as movement.
          wc.sendInputEvent({ type: 'mouseMove', x: Math.max(0, point.x - 3), y: point.y, movementX: 0, movementY: 0 });
          setTimeout(() => {
            if (!wc.isDestroyed())
              wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, movementX: 3, movementY: 0 });
          }, 40);
        }
        break;
      }
      case 'playback':
        if (wc !== core.page) break;
        if (msg.playing && core.blocker === undefined) {
          core.blocker = powerSaveBlocker.start('prevent-display-sleep');
        } else if (!msg.playing && core.blocker !== undefined) {
          powerSaveBlocker.stop(core.blocker);
          core.blocker = undefined;
        }
        break;
      case 'diagnostics': {
        if (wc !== core.page) break;
        if (core.edit?.saving) {
          // The editor asked for this outline: it is the evidence for the profile being saved.
          const text = `# Saved by Longboard's profile editor on ${new Date().toISOString().slice(0, 10)}.\n# Structure only: no text, names or addresses.\n#### page\n${String(msg.outline).slice(0, 2_000_000)}\n`;
          const file = core.deps.profiles.saveLocal(core.edit.draft, text);
          core.endEdit(true);
          core.notify(file ? `Profile saved as ${file}` : 'The profile could not be saved');
          break;
        }
        const dir = join(core.dataDir, 'diagnostics');
        mkdirSync(dir, { recursive: true });
        const name = `outline-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        writeFileSync(
          join(dir, name),
          `# ${String(msg.url).slice(0, 300)}\n${String(msg.outline).slice(0, 2_000_000)}\n`,
        );
        break;
      }
      case 'reader': {
        if (wc !== core.page || core.surface !== 'page') break;
        const article = parseArticle(msg.article);
        if (!article) {
          core.notify('No article to read was found on this page');
          break;
        }
        core.reading = { ...article, site: siteName(core.page.getURL()) };
        core.panel = 'reader';
        core.layout();
        break;
      }
      case 'icons':
        // What the page's own links say its icons are; a web-app manifest may list bigger ones.
        if (wc !== core.page) break;
        core.iconLinks.set(wc, parseIconLinks(msg.list));
        core.refreshIcons(wc);
        break;
      case 'back':
        // Only from the view in front: a page left behind must not move anything.
        if (wc === core.page && core.surface === 'page' && !core.panel) core.goBack();
        break;
      case 'menu':
        if (wc === core.active()) core.toggleMenu();
        break;
      case 'pointer':
        if (wc !== core.page || core.active() !== core.page) break;
        if (msg.x === undefined) core.setPointer(!core.pointerOn);
        else core.setPointer(true, startPoint(msg, core.page.getZoomFactor(), core.pageSize()));
        break;
      case 'frameEnter':
        if (wc === core.page && core.active() === core.page) {
          // Where the frame is, for a player inside it (frames.ts: onFrame, `reveal`).
          core.frameAt = hoverPoint({ x: msg.at?.x, y: msg.at?.y }, core.page.getZoomFactor(), viewSize(core.page));
          core.askIntoFrame(core.page.mainFrame, msg.stay === true);
        }
        break;
      case 'frameFieldDone': {
        // The person put the keyboard away: back to the pointer, where it was, if that is how they got there.
        const was = core.frameField;
        core.frameField = null;
        if (wc === core.page && was?.pointer && core.active() === core.page)
          core.setPointer(true, { x: core.pointer.x, y: core.pointer.y });
        else if (!core.pointerOn) core.detach();
        break;
      }
      case 'pointerOff':
        if (wc !== core.page) break;
        if (core.edit) core.openEditPanel();
        else core.setPointer(false);
        break;
      case 'pointerHeld':
        if (wc === core.page && core.pointerOn && core.active() === core.page && Array.isArray(msg.dirs)) {
          core.padPointer(
            msg.dirs.filter((d): d is Direction => d === 'up' || d === 'down' || d === 'left' || d === 'right'),
          );
        }
        break;
      case 'pointerClick':
        if (wc === core.page && core.pointerOn && core.active() === core.page) {
          if (core.edit) core.pickForEdit();
          else core.pressPointer();
        }
        break;
      case 'editPicked': {
        if (wc !== core.page || !core.edit) break;
        const chain = parsePicked(msg.chain);
        if (chain.length === 0) {
          core.notify('Nothing there can be marked');
          break;
        }
        core.edit.chain = chain;
        core.edit.level = 0;
        core.panel = 'edit';
        core.showEdit();
        core.layout();
        break;
      }
      case 'pointerClickOk':
        // Only the answer to the question just asked, and only while it still stands.
        if (wc === core.page && core.pointerOn && core.options.automation && msg.id === core.pointer.checkId) {
          core.pointer.checkId += 1;
          if (msg.frame === true && !core.framesGuarded())
            core.page.send('longboard:notice', 'Blocked: automation mode could not check an embedded frame');
          else core.click();
        }
        break;
      default:
        break;
    }
  };
  ipcMain.on('longboard:msg', onMessage);
  return { viewSize, onBoot, onMessage };
}
