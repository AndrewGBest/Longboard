// Per-site settings the person has chosen: answers to permission questions
// and a zoom adjustment. Pure; the shell reads and writes the file.
import { ASKABLE_NAMES, type SitePermissions } from '../main/permissions';

export interface SiteSettings extends SitePermissions {
  /** Zoom relative to the automatic TV scale: 1 is unchanged. */
  zoom?: number;
  /** The person's own choice for the ad-blocking switch on this site. Absent until they make one. */
  adBlocking?: boolean;
  /** True when the person asked for this site at the width of a desk screen (main/zoom.ts, DESKTOP_VIEWPORT). */
  desktop?: boolean;
  /** False when the person switched this site's profile off: the site is then driven in generic mode, as if there were none. */
  profile?: false;
}

/** The sizes "bigger" and "smaller" in a site's menu step through. */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

/** The next step up or down from `current`; stays put at either end. */
export function zoomStep(current: number, direction: 1 | -1): number {
  const at = ZOOM_STEPS.reduce(
    (best, step, i) => (Math.abs(step - current) < Math.abs(ZOOM_STEPS[best]! - current) ? i : best),
    0,
  );
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + direction))]!;
}

const HOST = /^[a-z0-9.[\]:-]{1,253}$/;

/** Validates the saved file. Anything unusable is dropped. */
export function parseSites(raw: unknown): Record<string, SiteSettings> {
  const out: Record<string, SiteSettings> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [host, value] of Object.entries(raw as Record<string, unknown>).slice(0, 5000)) {
    if (!HOST.test(host) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const site: SiteSettings = {};
    const answers: NonNullable<SitePermissions['answers']> = {};
    if (v['answers'] && typeof v['answers'] === 'object') {
      for (const name of ASKABLE_NAMES) {
        const answer = (v['answers'] as Record<string, unknown>)[name];
        if (answer === 'granted' || answer === 'denied') answers[name] = answer;
      }
    }
    if (Object.keys(answers).length) site.answers = answers;
    if (typeof v['zoom'] === 'number' && v['zoom'] >= ZOOM_STEPS[0] && v['zoom'] <= ZOOM_STEPS[ZOOM_STEPS.length - 1]!)
      site.zoom = v['zoom'];
    if (typeof v['adBlocking'] === 'boolean') site.adBlocking = v['adBlocking'];
    if (v['desktop'] === true) site.desktop = true;
    if (v['profile'] === false) site.profile = false;
    if (Object.keys(site).length) out[host] = site;
  }
  return out;
}
