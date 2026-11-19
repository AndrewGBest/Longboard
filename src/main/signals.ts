// "Ask sites not to track" (shared/privacy.ts). The only module that may add
// to what Longboard sends a site, and the two fixed signals are all it adds:
// it removes nothing, changes nothing else, and never sees a reply.
import { withSignals } from '../shared/privacy';

/** Sends the signals with every web request of a session, or stops sending them. */
export function privacySignals(ses: Electron.Session, on: boolean): void {
  if (!on) {
    ses.webRequest.onBeforeSendHeaders(null);
    return;
  }
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    callback({ requestHeaders: withSignals(details.requestHeaders) });
  });
}
