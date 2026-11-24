// The on-TV profile editor's bookkeeping: the draft profile and what each
// choice does to it. Pure, so it is unit-tested. The editor only ever writes
// selectors into the same format every profile uses (shared/profile.ts), and
// what it produces is validated like any other profile before it is saved.
import { siteKey } from './address';
import { validateProfile, type Profile } from './profile';

/** What an element can be marked as. Choosing a mark again takes it off. */
export const EDIT_MARKS = ['include', 'exclude', 'row', 'player'] as const;
export type EditMark = (typeof EDIT_MARKS)[number];

/** One step of the chain from the element that was pointed at up through its containers. */
export interface PickedStep {
  selector: string;
  /** How many elements on the page the selector matches. */
  matches: number;
}

const MAX_STEPS = 8;

/** Validates what the layer says was picked. Anything unusable is dropped. */
export function parsePicked(raw: unknown): PickedStep[] {
  if (!Array.isArray(raw)) return [];
  const out: PickedStep[] = [];
  for (const item of raw.slice(0, MAX_STEPS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r['selector'] !== 'string' || !r['selector'].trim() || r['selector'].length > 300) continue;
    const matches =
      typeof r['matches'] === 'number' && Number.isFinite(r['matches'])
        ? Math.max(0, Math.min(100000, Math.round(r['matches'])))
        : 0;
    out.push({ selector: r['selector'], matches });
  }
  return out;
}

/** An id for the person's own profile of a site. */
export function localProfileId(url: string): string | null {
  const site = siteKey(url);
  if (!site) return null;
  return (
    site
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || null
  );
}

/** "1.2.3" -> "1.2.4". Anything else starts again at 1.0.0. */
export function nextVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '1.0.0';
}

/**
 * The profile the editor starts from for the site at `url`: a copy of the one
 * already in use there with its version raised, or a new, empty one. Null
 * when the address is not one a profile can name (a bare network address).
 */
export function startDraft(url: string, current: Profile | null): Profile | null {
  const site = siteKey(url);
  const id = localProfileId(url);
  if (!site || !id) return null;
  const draft: Profile = current
    ? { ...structuredClone(current), version: nextVersion(current.version) }
    : {
        longboard: 1,
        id,
        name: site,
        version: '1.0.0',
        authors: ['made on this TV'],
        licence: 'CC0-1.0',
        match: { hosts: [site, `*.${site}`] },
        evidence: { outline: `${id}.outline.txt` },
      };
  draft.evidence = { outline: `${draft.id}.outline.txt` };
  // A profile names sites by domain; a host it cannot name cannot have one.
  return validateProfile(draft).profile;
}

const without = (list: readonly string[] | undefined, selector: string): string[] =>
  (list ?? []).filter((s) => s !== selector);

/** Whether `selector` carries `mark` in the draft. */
export function hasMark(draft: Profile, mark: EditMark, selector: string): boolean {
  if (mark === 'include') return (draft.focus?.include ?? []).includes(selector);
  if (mark === 'exclude') return (draft.focus?.exclude ?? []).includes(selector);
  if (mark === 'row') return (draft.focus?.groups ?? []).some((g) => g.selector === selector);
  return draft.player?.container === selector;
}

/**
 * The draft with `mark` put on `selector`, or taken off when it was on.
 * "Can be selected" and "never select" cannot both hold for one selector.
 * Returns the draft unchanged when the result would not be a valid profile.
 */
export function toggleMark(draft: Profile, mark: EditMark, selector: string): Profile {
  const next = structuredClone(draft);
  const on = !hasMark(draft, mark, selector);
  const focus = { ...next.focus };
  if (mark === 'include' || mark === 'exclude') {
    focus.include = without(focus.include, selector);
    focus.exclude = without(focus.exclude, selector);
    if (on) focus[mark] = [...(focus[mark] ?? []), selector];
  } else if (mark === 'row') {
    const groups = (focus.groups ?? []).filter((g) => g.selector !== selector);
    if (on) {
      const taken = new Set(groups.map((g) => g.name));
      let n = groups.length + 1;
      while (taken.has(`row-${n}`)) n += 1;
      groups.push({ name: `row-${n}`, selector, axis: 'horizontal', remember: true });
    }
    focus.groups = groups;
  } else {
    const player = { ...next.player };
    if (on) player.container = selector;
    else delete player.container;
    if (Object.keys(player).length) next.player = player;
    else delete next.player;
  }
  for (const key of ['include', 'exclude', 'groups'] as const) if (focus[key]?.length === 0) delete focus[key];
  if (Object.keys(focus).length) next.focus = focus;
  else delete next.focus;
  return validateProfile(next).profile ?? draft;
}

/** What the editor has marked, for drawing on the page. */
export function marksOf(draft: Profile): Record<EditMark, string[]> {
  return {
    include: [...(draft.focus?.include ?? [])],
    exclude: [...(draft.focus?.exclude ?? [])],
    row: (draft.focus?.groups ?? []).map((g) => g.selector),
    player: draft.player?.container ? [draft.player.container] : [],
  };
}

/** True when the draft says anything a profile is for. */
export function hasContent(draft: Profile): boolean {
  const m = marksOf(draft);
  return (
    EDIT_MARKS.some((mark) => m[mark].length > 0) ||
    Object.keys(draft).some((k) => ['text', 'dismiss', 'guard', 'view'].includes(k))
  );
}
