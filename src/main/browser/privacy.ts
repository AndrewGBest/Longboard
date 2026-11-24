// What a page is told and what is refused: ad blocking, identity, privacy signals, extensions.
import { app, type WebContents } from 'electron';
import { deviceOf } from '../../shared/profile';
import { buildYear, chipName, identityFor, systemName, tvBrowserUserAgent, tvUserAgent } from '../useragent';
import { filterSession } from '../adblock';
import { privacySignals } from '../signals';
import { PRODUCT } from '../../shared/product';
import type { Core } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface PrivacyPart {
  /** Puts those settings into effect again after one was changed. */
  applyPrivacy: () => void;
}

export function createPrivacy(core: Core): PrivacyPart {
  // Requests that the public filter lists name are refused, for the views
  // that show websites, when the switch for the site in front is on. That is
  // all: nothing is redirected, rewritten or put into a page (main/adblock.ts).
  core.eachSession((web) =>
    filterSession(web, (url, kind, wc) => {
      if (!wc || wc.isDestroyed() || !core.isPageView(wc)) return false;
      const pageUrl = wc.getURL();
      if (!core.blockingAt(pageUrl)) return false;
      if (!core.deps.adBlock.filters()?.refuses(url, pageUrl, kind)) return false;
      core.refused.set(wc, (core.refused.get(wc) ?? 0) + 1);
      return true;
    }),
  );
  // The privacy settings that act on every website view: the two "do not
  // track" signals (main/signals.ts), and keeping the device's address on the
  // home network from sites that set up calls.
  // What a view says it is: Longboard's honest identity, and for a site
  // whose profile asks for its TV interface, that plus "running as a TV"
  // (main/useragent.ts; rule 3 as amended 2026-11-21).
  const honestAgent = app.userAgentFallback;
  const identity = identityFor(
    honestAgent,
    tvUserAgent(
      honestAgent,
      PRODUCT.name,
      app.getVersion(),
      systemName(honestAgent),
      chipName(process.arch),
      buildYear(),
      process.versions.v8.replace(/-.*$/, ''),
    ),
    tvBrowserUserAgent(honestAgent),
    (url) => deviceOf(core.profileFor(url)?.profile ?? null),
  );
  core.eachPage((wc) =>
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) identity.follow(wc, details.url);
    }),
  );
  const signalSession = (web: Electron.Session): void =>
    privacySignals(web, core.config.doNotTrack === true, identity.header);
  const guardAddress = (wc: WebContents): void => {
    if (!wc.isDestroyed())
      wc.setWebRTCIPHandlingPolicy(core.config.hideLocalAddress === true ? 'default_public_interface_only' : 'default');
  };
  core.eachSession(signalSession);
  core.eachPage((wc) => core.extensions.addTab(wc));
  void core.extensions.load().then(() => {
    // Newer versions of installed extensions, a minute after starting and once a day. Not in a scripted run.
    const refresh = (): void => {
      if (core.config.extensionUpdates !== false && !core.options.automation) void core.extensions.update();
    };
    setTimeout(refresh, 60_000).unref();
    setInterval(refresh, 24 * 60 * 60 * 1000).unref();
  });
  core.eachPage(guardAddress);
  /** Puts those settings into effect again after one was changed. */
  const applyPrivacy = (): void => {
    for (const web of core.wiredSessions) signalSession(web);
    for (const view of core.views.values()) guardAddress(view.webContents);
  };
  // Counted from the moment a new page is asked for: its first requests can
  // be on their way before the shell hears that the page has arrived.
  core.eachPage((wc) =>
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) core.refused.set(wc, 0);
    }),
  );
  return { applyPrivacy };
}
