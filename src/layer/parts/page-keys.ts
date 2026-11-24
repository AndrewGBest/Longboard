// Whose the keys are at any moment (the mode), and the keys handed on to
// the page: the site's own shortcuts and its player's. The player is only
// ever sent ordinary key presses (Hard rule 2).
import { InjectedKeys, playerKeyInfo, type PlayerKey, type TextKey } from '../../shared/player-keys';
import type { PlayerKeyName } from '../../shared/profile';
import type { Mode } from '../input/keys';
import { deepActiveElement } from '../spatial/deep';
import type { LayerCore } from './core';
import { isTextEntry } from './core';

/** What this part adds for the other parts to use. */
export interface PageKeysPart {
  /** What the keys mean now: moving the highlight, a player's keys, or typing in a field. */
  mode: () => Mode;
  /** Keys the shell has been asked to press, so that onKey knows them when they arrive and leaves them to the site. */
  injected: InjectedKeys;
  /** Asks the shell to press an ordinary key on the page. */
  pressKey: (key: PlayerKey | TextKey | PlayerKeyName) => void;
  /** The ordinary key this site's player uses for an action: the usual one, unless the profile names another. */
  siteKey: (key: PlayerKey) => PlayerKey | PlayerKeyName;
  /** Presses the site's key for a player action. Does nothing unless a video is being watched. */
  pressPlayerKey: (key: PlayerKey) => void;
  /** Gives keyboard focus to a video that has the browser's own controls, so that it hears its keys. */
  watchNativeVideo: () => void;
}

export function createPageKeys(core: LayerCore): PageKeysPart {
  const mode = (): Mode => {
    if (core.oskOpen) {
      // The keyboard only makes sense while its field still has focus, and is one it may type in.
      const into = deepActiveElement(core.doc);
      if (core.frameTyping || (isTextEntry(into) && !(into && core.keyboardBarred(into)))) return 'browse';
      core.closeOsk();
    }
    // A text field under the highlight is only that until someone types in
    // it: the arrows still move on, and OK brings the keyboard up.
    const active = deepActiveElement(core.doc);
    if (isTextEntry(active)) return core.typedInto === active ? 'text' : 'browse';
    if (!core.inPlayer()) return 'browse';
    return core.onPlayerControl() ? 'browse' : 'player';
  };

  // Player control is a real key press made by the shell, so the site's own
  // player decides what it does (it may refuse a seek during an advertisement).
  const injected = new InjectedKeys();
  const pressKey = (key: PlayerKey | TextKey | PlayerKeyName): void => {
    const info = playerKeyInfo(key);
    if (!info) return;
    injected.expect(info.domKey, Date.now());
    core.send({ kind: 'playerKey', key });
  };
  const siteKey = (key: PlayerKey): PlayerKey | PlayerKeyName =>
    key === 'playPause'
      ? core.rules.playerKeys.playPause
      : key === 'seekBack'
        ? core.rules.playerKeys.back
        : key === 'seekForward'
          ? core.rules.playerKeys.forward
          : key;
  const pressPlayerKey = (key: PlayerKey): void => {
    if (!core.inPlayer()) return;
    watchNativeVideo();
    pressKey(siteKey(key));
  };
  // A video with the browser's own controls answers keys only while it has
  // keyboard focus. Giving it focus is all that is done; the keys are still
  // ordinary key presses and the browser's player decides what they do.
  const watchNativeVideo = (): void => {
    const v = core.mainVideo();
    if (v?.controls && deepActiveElement(core.doc) !== v && !isTextEntry(deepActiveElement(core.doc)))
      v.focus({ preventScroll: true });
  };
  return { mode, injected, pressKey, siteKey, pressPlayerKey, watchNativeVideo };
}
