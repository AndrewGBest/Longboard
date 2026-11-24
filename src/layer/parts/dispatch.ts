// What each action from the remote does.
import { type Action } from '../../shared/actions';
import { rulesReport } from '../profile/rules';
import { buildOutline, sanitizeUrl } from '../diagnostics/outline';
import { isEmptyField } from '../search-field';
import { activeOption, openCombo } from '../combobox';
import { deepActiveElement } from '../spatial/deep';
import { playerKeyFor } from '../../shared/player-keys';
import { pageVideo } from '../player';
import { coveredByScreen, MENU_ENTRY, openDialog } from '../spatial/navigator';
import type { LayerCore } from './core';
import { isTextEntry } from './core';

/** What this part adds for the other parts to use. */
export interface DispatchPart {
  dispatch: (a: Action) => void;
}

export function createDispatch(core: LayerCore): DispatchPart {
  const dispatch = (a: Action): void => {
    if (!core.inPlayer()) {
      core.browseUrl = core.view.location.href;
      core.playerMenuSeen = false;
    }
    // A key, after the mouse was last moved (or the page's first key): the
    // pointer is hidden, and the page is told it has left. An idle pointer
    // nobody can see still "hovers" what lies under it, and sites open
    // things on that. (Seen on a film service at a TV: its whole list of
    // categories opened over the page, with nothing pointing at it.)
    if (!core.doc.documentElement.classList.contains('longboard-no-pointer') && !core.pointerOn)
      core.send({ kind: 'pointerAway' });
    core.doc.documentElement.classList.add('longboard-no-pointer');
    // (Saving an outline is asked for by the shell, pointer or no pointer.)
    if (core.pointerOn && a.type !== 'diagnostics') {
      // From a game controller (the shell takes a remote's keys itself). The
      // directions arrive as held buttons, not as moves.
      if (a.type === 'select') core.send({ kind: 'pointerClick' });
      else if (a.type === 'back') core.send({ kind: 'pointerOff' });
      else if (a.type === 'pointer') core.send({ kind: 'pointer' });
      else if (a.type === 'menu') core.send({ kind: 'menu' });
      else if (a.type === 'exit') core.send({ kind: 'exit' });
      return;
    }
    if (core.listOpen()) {
      // From a game controller: its buttons become the list's own keys.
      if (a.type === 'move' && (a.dir === 'up' || a.dir === 'down')) core.pressKey(a.dir);
      else if (a.type === 'select') {
        core.nativeList = null;
        core.pressKey('enter');
      } else if (a.type === 'back') {
        core.nativeList = null;
        core.pressKey('close');
      }
      if (a.type === 'move' || a.type === 'select' || a.type === 'back') return;
    }
    core.view.clearTimeout(core.scrollTimer);
    // A pending "pick focus up again" belongs to the previous key; a new key
    // overrides it (Back right after Enter must not have focus put back).
    core.view.clearTimeout(core.refocusTimer);
    core.view.clearTimeout(core.followTimer);
    core.view.clearInterval(core.coverTimer);
    if (core.oskOpen) {
      if (a.type === 'move') {
        // Up from the top row leaves the keyboard for the page.
        if (!core.osk.move(a.dir) && a.dir === 'up') {
          // (A field inside a frame keeps the cursor: the keys go back to the frame.)
          const inFrame = core.frameTyping;
          core.closeOsk();
          if (!inFrame) {
            (core.doc.activeElement as HTMLElement | null)?.blur();
            core.nav.move('up');
          }
        }
        core.drawOsk();
        return;
      }
      if (a.type === 'select') {
        core.pressOsk();
        return;
      }
      if (a.type === 'back') {
        // Back out of a search box with nothing typed is "not searching
        // after all". The site is told so with its own Escape key, while the
        // cursor is still in the box: a search box that has spread over the
        // page's menu closes on that, and on nothing Longboard does
        // otherwise. (Seen on a film service: left open, the box covered
        // half the menu for good; moving the highlight away did not close
        // it, Escape with the cursor in it did.) Not inside a pop-up, where
        // Escape would close the pop-up, and not for a field in a frame.
        const field = deepActiveElement(core.doc);
        const dropSearch =
          !core.frameTyping &&
          !!field &&
          isTextEntry(field) &&
          core.isSearchField(field) &&
          isEmptyField(field) &&
          !openDialog(core.doc);
        core.closeOsk();
        if (dropSearch) core.pressKey('close');
        return;
      }
      core.closeOsk();
    }
    // A field with its list of suggestions open: Up and Down go to the
    // field as the keys they are, the page marks a suggestion, and OK
    // chooses the marked one. The cursor stays in the field throughout.
    const combo = core.inPlayer() ? null : openCombo(core.doc);
    if (combo) {
      const before = activeOption(combo);
      if (a.type === 'move' && (a.dir === 'down' || (a.dir === 'up' && before))) {
        const dir = a.dir;
        core.pressKey(dir);
        core.view.setTimeout(() => {
          if (deepActiveElement(core.doc) !== combo) return;
          const now = activeOption(combo);
          core.overlay.track(now ?? core.nav.focused);
          // A page that does nothing with the key: move as on any page.
          // (Seen on a video site: its search field says its list is open
          // and one entry is always marked; the keys change nothing, and
          // the highlight could not leave the field.)
          if (now === before) {
            core.overlay.track(core.nav.focused);
            core.moveInPage(dir);
          }
        }, 150);
        return;
      }
      if (a.type === 'select' && before) {
        core.pressKey('enter');
        core.overlay.track(core.nav.focused);
        return;
      }
      if (before) core.overlay.track(core.nav.focused);
    }
    switch (a.type) {
      case 'move':
        if (core.inPlayer()) core.moveInPlayer(a.dir);
        else core.moveInPage(a.dir);
        break;
      case 'select': {
        core.lastControlKeyAt = Date.now();
        core.lastPressAt = Date.now();
        const target = core.nav.focused;
        const box = target?.getBoundingClientRect();
        if (target && !core.inPlayer() && core.opensMenuFirst(target)) {
          core.hoverOn(target);
          break;
        }
        // OK on a text field brings up the keyboard.
        if (target && isTextEntry(target) && !core.inPlayer()) {
          if (deepActiveElement(core.doc) !== target) core.nav.focus(target);
          if (!core.keyboardBarred(target)) core.openOsk(target);
          break;
        }
        // An embedded frame: the highlight goes into it (the pointer, on it, when that cannot be).
        if (target instanceof HTMLIFrameElement && box) {
          core.enterFrame(target, false);
          break;
        }
        // A drop-down opens as the browser's own list, with the key that opens it.
        if (target instanceof HTMLSelectElement && !target.multiple) {
          target.focus({ preventScroll: true });
          core.nativeList = target;
          core.pressKey('space');
          break;
        }
        if (!core.nav.activate()) {
          core.nav.move('down');
          break;
        }
        core.overlay.feedback('press');
        // A label that opens a list by ticking a hidden checkbox: remember it, so Back can close the list.
        if (
          target instanceof HTMLLabelElement &&
          target.control instanceof HTMLInputElement &&
          target.control.type === 'checkbox'
        ) {
          core.openToggle = target.control.checked ? { label: target, input: target.control } : null;
        }
        if (target && !core.inPlayer()) {
          core.hoverIfStillCollapsed(target);
          // Some controls scroll the page to another section (tabs that are
          // really jump links). Focus follows to what is now on screen.
          // What was selected may open something over the whole screen (the
          // player, while its video is still loading). The ring goes as soon
          // as that is in front, not when the video finally starts.
          let looks = 0;
          core.view.clearInterval(core.coverTimer);
          core.coverTimer = core.view.setInterval(() => {
            if (++looks > 60 || core.nav.focused !== target || openDialog(core.doc))
              core.view.clearInterval(core.coverTimer);
            else if (coveredByScreen(target, core.view)) {
              core.view.clearInterval(core.coverTimer);
              core.nav.clear();
            }
          }, 150);
          core.view.clearTimeout(core.followTimer);
          core.followTimer = core.view.setTimeout(() => {
            if (core.enterDialog()) return;
            if (core.inPlayer() || core.nav.focused !== target || !core.nav.focusIsOffScreen()) return;
            // On a long page with a big player in it, a press that left the
            // pressed thing off screen with the picture now in view has
            // chosen what to watch (a channel in the row below the player,
            // and the page went back up to the picture). The picture is the
            // place to be: nothing highlighted, the keys the player's.
            const picture = core.playerInPage() ? pageVideo(core.doc) : null;
            const box = picture?.getBoundingClientRect();
            if (
              picture &&
              box &&
              Math.min(box.bottom, core.view.innerHeight) - Math.max(box.top, 0) >= box.height / 2
            ) {
              core.nav.clear();
              picture.scrollIntoView({ block: 'center', behavior: 'instant' });
              return;
            }
            core.nav.focusFirstOnScreen();
          }, 900);
        }
        // Activating a player control can replace it (a menu opens, a list
        // changes). Pick focus up again next to where it was.
        if (box && core.inPlayer()) {
          const before = new Set(core.nav.candidates());
          core.view.clearTimeout(core.refocusTimer);
          core.refocusTimer = core.view.setTimeout(() => {
            if (!core.inPlayer()) return;
            const point = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
            // A menu opened: go into it, rather than leave the user to find it.
            const opened = core.nav.candidates().filter((el) => !before.has(el) && el.matches(MENU_ENTRY));
            if (opened.length > 0) core.playerMenuSeen = true;
            if (opened.length > 0 && core.nav.focused === target) core.nav.focusNearest(point, opened);
            else if (!core.onPlayerControl()) core.nav.focusNearest(point);
          }, 500);
        }
        break;
      }
      case 'back':
        core.back();
        break;
      case 'playPause':
      case 'seek': {
        const key = playerKeyFor(a);
        if (key) core.pressPlayerKey(key);
        // A player may not answer its keys until it has been clicked (seen
        // on an open-source player a video site embeds, and on a sports
        // network's live player: their shortcuts work only once the player
        // has "focus", which a click gives). OK that changed nothing is
        // followed by one ordinary click on the picture, which every player
        // takes as play or pause. Whether it changed is only looked at; the
        // video is not touched. Not on a site with a profile, which names
        // its player's own key.
        const v = (core.frame || core.rules.generic) && a.type === 'playPause' ? core.mainVideo() : null;
        if (v) {
          const was = v.paused;
          let answered = false;
          const heard = (): void => {
            answered = true;
          };
          v.addEventListener('pause', heard, { once: true });
          v.addEventListener('play', heard, { once: true });
          core.view.setTimeout(() => {
            v.removeEventListener('pause', heard);
            v.removeEventListener('play', heard);
            if (answered || !v.isConnected || v.paused !== was || !core.inPlayer() || core.onPlayerControl()) return;
            const box = v.getBoundingClientRect();
            core.send({
              kind: 'pictureClick',
              x: (Math.max(box.left, 0) + Math.min(box.right, core.view.innerWidth)) / 2,
              y: (Math.max(box.top, 0) + Math.min(box.bottom, core.view.innerHeight)) / 2,
            });
          }, 600);
        }
        break;
      }
      case 'search':
        core.openSearch();
        break;
      case 'voice':
        core.send({ kind: 'voice' });
        break;
      case 'diagnostics':
        // The first line says how much of the adapter still matches this page:
        // a zero where there used to be matches is the site having changed.
        core.send({
          kind: 'diagnostics',
          outline: `# ${rulesReport(core.rules, core.doc)}\n${buildOutline(core.doc.documentElement)}`,
          url: sanitizeUrl(core.view.location.href),
        });
        core.overlay.toast('Page outline saved (structure only, no text)');
        break;
      case 'menu':
        core.closeOsk();
        core.send({ kind: 'menu' });
        break;
      case 'pointer':
        core.closeOsk();
        core.send({ kind: 'pointer' });
        break;
      case 'exit':
        core.send({ kind: 'exit' });
        break;
    }
  };
  return { dispatch };
}
