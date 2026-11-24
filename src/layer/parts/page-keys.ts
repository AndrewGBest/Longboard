// Keys given to the page itself: the site's own shortcuts and its player's.
import { type PlayerKeyName } from '../../shared/profile';
import { type Mode } from '../input/keys';
import { deepActiveElement } from '../spatial/deep';
import { InjectedKeys, playerKeyInfo, type PlayerKey, type TextKey } from '../../shared/player-keys';

import type { LayerCore } from './core';
import { isTextEntry } from './core';

/** What this part adds for the other parts to use. */
export interface PageKeysPart {
  mode: () => Mode;
  injected: InjectedKeys;
  pressKey: (key: PlayerKey | TextKey | PlayerKeyName) => void;
  /** The ordinary key this site's player uses for an action: the usual one, unless the profile names another. */
  siteKey: (key: PlayerKey) => PlayerKey | PlayerKeyName;
  pressPlayerKey: (key: PlayerKey) => void;
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
  /** The ordinary key this site's player uses for an action: the usual one, unless the profile names another. */
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
