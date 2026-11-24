// Permissions: a site gets nothing until the person says yes for that site
// (Hard rule 13). Also answerPrompt, which carries out the answer to every
// kind of question on screen: a permission, a profile, an extension, a
// download, a password, the speech model, an account to hand back.
import { rmSync } from 'node:fs';
import { voiceModelSize } from '../../shared/voice';
import { DECLINED, HAND_BACKS, steamAnswer } from '../handback';
import { siteKey } from '../../shared/address';
import { hasPermission, mayAsk, permissionDecision, withAnswers } from '../permissions';
import { type Profile } from '../../shared/profile';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface PermissionsPart {
  /** Carries out the answer to the question on screen. `remember` keeps the answer, for the kinds of question that can be remembered. */
  answerPrompt: (allow: boolean, remember: boolean) => void;
  /** Asks, once, whether to use a profile someone gave the person (docs/PROFILES.md section 3). */
  askAboutProfile: (profile: Profile) => void;
}

export function createPermissions(core: Core): PermissionsPart {
  core.eachSession((web) =>
    web.setPermissionRequestHandler((wc, permission, callback, details) => {
      const url = details.requestingUrl || wc.getURL();
      const key = siteKey(url);
      const mediaTypes = 'mediaTypes' in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      // An answer given to a site counts only for its pages loaded securely.
      const decision = permissionDecision(
        permission,
        key && mayAsk(url) ? core.sites[key] : undefined,
        mediaTypes,
        core.config.neverAsk,
      );
      if (decision.kind !== 'ask') {
        callback(decision.kind === 'grant');
        return;
      }
      // Only the page in front is asked about, only when it was loaded securely,
      // and one question at a time: anything else is refused for now, unremembered.
      const same =
        core.pending?.what === 'permission' &&
        core.pending.site === key &&
        core.pending.names.join() === decision.names.join();
      if (wc !== core.page || core.surface !== 'page' || !key || !mayAsk(url) || (core.pending && !same)) {
        callback(false);
        return;
      }
      if (core.pending?.what === 'permission') core.pending.answer.push(callback);
      else {
        core.pending = { what: 'permission', site: key, names: decision.names, answer: [callback] };
        core.panel = 'prompt';
        core.layout();
      }
    }),
  );
  core.eachSession((web) =>
    web.setPermissionCheckHandler((_wc, permission, origin, details) => {
      const key = siteKey(origin);
      const mediaType = details.mediaType === 'video' || details.mediaType === 'audio' ? [details.mediaType] : [];
      return hasPermission(
        permission,
        key && mayAsk(origin) ? core.sites[key] : undefined,
        mediaType,
        core.config.neverAsk,
      );
    }),
  );
  const answerPrompt = (allow: boolean, remember: boolean): void => {
    const asked = core.pending;
    if (!asked) return;
    core.pending = null;
    core.panel = null;
    if (asked.what === 'extension') {
      core.layout();
      if (!allow) {
        core.extensions.discard(asked.extension);
        return;
      }
      void core.extensions.enable(asked.extension).then(
        () => {
          core.layout();
          core.notify(`"${asked.extension.name}" is added. Settings, under Extensions, opens or removes it`);
        },
        (err) => {
          console.error(`[longboard] extension could not be switched on: ${String(err).slice(0, 200)}`);
          core.extensions.discard(asked.extension);
          core.notify(`"${asked.extension.name}" could not be added: this browser cannot run it`);
        },
      );
      return;
    }
    if (asked.what === 'handBack') {
      core.layout();
      if (!allow) {
        core.writeHandBack(asked.ask, DECLINED);
        return;
      }
      void asked.from
        .fetch(`${asked.ask.at.owned}?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((said: unknown) => {
          const line = steamAnswer(asked.steamid, said);
          if (!line) throw new Error('not a list');
          core.writeHandBack(asked.ask, line);
          core.notify(`The list was shared. Go back to the program that asked for it`);
        })
        .catch(() => {
          core.writeHandBack(asked.ask, DECLINED);
          core.notify(`The list could not be fetched from ${HAND_BACKS[asked.ask.what].site}, so nothing was shared`);
        });
      return;
    }
    if (asked.what === 'voiceModel') {
      core.layout();
      if (!allow) return;
      core.notify(`Fetching the speech model, ${voiceModelSize()}. This is done once`);
      void core.voice
        .fetchModel(() => undefined)
        .then((ok) => {
          if (core.win.isDestroyed()) return;
          if (ok) core.speak();
          else core.notify('The speech model could not be fetched. Is this machine online?');
        });
      return;
    }
    if (asked.what === 'password') {
      // Back is "not now" and leaves it to be asked for again from the menu; an answer settles it.
      if (remember) core.typed.delete(core.page);
      core.layout();
      if (allow)
        void core.passwords
          .save(asked.place, asked.user, asked.password, Date.now())
          .then((kept) =>
            core.notify(
              kept
                ? 'That password is kept. Settings, under Passwords, lists and removes them'
                : 'That password could not be kept: the keyring did not take it',
            ),
          );
      return;
    }
    if (asked.what === 'profile') {
      core.deps.profiles.answer(asked.profile, allow, remember);
      core.layout();
      // The page starts again so the profile applies from its first moment.
      if (allow && core.surface === 'page') core.page.reload();
      return;
    }
    if (asked.what === 'download') {
      const d = asked.download;
      core.layout();
      if (!allow) {
        // What arrived while the question was up is thrown away.
        if (!d.arrived) d.item.cancel();
        rmSync(d.temp, { force: true });
        return;
      }
      d.agreed = true;
      core.downloads.unshift(d);
      // The list is of this run only, and not endless: the oldest finished ones go first.
      while (core.downloads.length > core.MAX_LISTED) {
        let old = core.downloads.length - 1;
        while (old >= 0 && core.downloads[old]?.state === 'going') old -= 1;
        if (old < 0) break;
        core.downloads.splice(old, 1);
      }
      if (d.arrived) core.keep(d);
      else {
        d.state = 'going';
        core.notify(`Downloading ${d.name}`);
      }
      return;
    }
    if (remember && !core.isPrivate(core.partition)) {
      core.sites[asked.site] = {
        ...core.sites[asked.site],
        ...withAnswers(core.sites[asked.site], asked.names, allow),
      };
      core.saveSites();
    }
    for (const answer of asked.answer) answer(allow);
    core.layout();
  };
  const askAboutProfile = (profile: Profile): void => {
    if (core.pending || core.surface !== 'page') return;
    core.pending = { what: 'profile', profile };
    core.panel = 'prompt';
    core.layout();
  };
  // A question belongs to the page that asked it.
  core.eachPage((wc) =>
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (wc === core.page && isMainFrame && !isInPlace && core.pending?.what === 'permission')
        answerPrompt(false, false);
    }),
  );
  return { answerPrompt, askAboutProfile };
}
