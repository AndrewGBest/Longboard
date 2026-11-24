// "Ask sites not to track" (shared/privacy.ts). The only module that may add
// to what Longboard sends a site. The two fixed signals are all it adds of
// its own; it also carries main/useragent.ts's word on what a TV page's
// requests call themselves. It never sees a reply.
import { withSignals } from '../shared/privacy';

type Details = {
  url: string;
  resourceType: string;
  webContents?: Electron.WebContents | undefined;
  requestHeaders: Record<string, string>;
};

/**
 * Sends the signals with every web request of a session, or stops sending
 * them. `identity`, when given, is main/useragent.ts's say on what a request
 * for a TV page calls itself; a session has one such hook, so it passes through here.
 */
export function privacySignals(
  ses: Electron.Session,
  on: boolean,
  identity?: (details: Details) => Record<string, string>,
): void {
  if (!on && !identity) {
    ses.webRequest.onBeforeSendHeaders(null);
    return;
  }
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const headers = identity ? identity(details) : details.requestHeaders;
    callback({ requestHeaders: on ? withSignals(headers) : headers });
  });
}
