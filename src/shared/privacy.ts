// "Ask sites not to track": the two standard signals a browser can send with
// its requests. Pure, so what is sent is unit-tested.
//
// These are the only headers Longboard adds to what it sends a site
// (docs/DECISIONS.md, 2026-11-18). Both are fixed values defined by public
// specifications for exactly this purpose, they say nothing about the person
// or the device, and they are sent to every site alike or to none. Nothing a
// site sends back is touched, and no other header is added or removed.

/** The headers added when the person turns the setting on. */
export const SIGNAL_HEADERS: Readonly<Record<string, string>> = {
  // "Do Not Track" (W3C Tracking Preference Expression).
  DNT: '1',
  // "Global Privacy Control" (W3C Privacy CG): do not sell or share my data.
  'Sec-GPC': '1',
};

/** A request's headers with the two signals added. Every other header is passed on exactly as it was. */
export function withSignals(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  const ours = Object.keys(SIGNAL_HEADERS).map((n) => n.toLowerCase());
  for (const [name, value] of Object.entries(headers)) if (!ours.includes(name.toLowerCase())) out[name] = value;
  return { ...out, ...SIGNAL_HEADERS };
}

/** The public list of trackers used when the person asks for trackers to be refused as well as ads. */
export const TRACKER_LIST = 'https://easylist.to/easylist/easyprivacy.txt';

/** The filter lists in use: the person's own or the usual one, with the tracker list when asked for. */
export function listsInUse(usual: readonly string[], own: readonly string[] | undefined, trackers: boolean): string[] {
  const out = [...(own ?? usual)];
  if (trackers && !out.includes(TRACKER_LIST)) out.push(TRACKER_LIST);
  return out;
}
