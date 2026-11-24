// A second opinion on what can be selected, for testing only. The engine's
// own Tab order is the list of everything a page declares as a control. A
// script presses Tab through a page and this compares where Tab stopped
// with what the highlight can reach. A stop the highlight cannot reach is a
// fault: on a search engine's results, each result's title was a Tab stop
// and was not a target (see DECISIONS.md, 2026-11-19, "the Tab order is a
// referee").
//
// What it reports is structure only: kinds of element, sizes and counts.
// Never a page's words or addresses.
import { boxOf } from '../spatial/box';
import { deepActiveElement, deepContains } from '../spatial/deep';
import { isVisible, onScreenish } from '../spatial/visibility';

/** What the comparison found, as counts and kinds only. */
export interface RefereeReport {
  /** Different places Tab stopped. */
  stops: number;
  /** Of those, the ones a person could see and aim at when the count was made. */
  seen: number;
  /** Of those, the ones the highlight reaches: itself, something inside it, something holding it, or something in the same place. */
  reached: number;
  /** The rest, described by kind and size. */
  missed: Array<{ what: string; size: string }>;
  /** Targets of the highlight that Tab never stopped at (things that only look clickable, mostly). */
  beyond: number;
}

/** A stop smaller than this either way is not a target by design (`candidates` in spatial/navigator.ts). */
const SMALLEST = 10;

/** A stop by its kind only: tag, input type and role. */
function describe(el: Element): string {
  const role = el.getAttribute('role');
  const type = el instanceof HTMLInputElement ? `[type=${el.type}]` : '';
  return `${el.tagName.toLowerCase()}${type}${role ? `[role=${role.slice(0, 20)}]` : ''}`;
}

/** True when the two occupy about the same box. */
function sameSpot(a: Element, b: Element): boolean {
  const p = boxOf(a);
  const q = boxOf(b);
  return (
    Math.abs(p.left - q.left) <= 6 &&
    Math.abs(p.top - q.top) <= 6 &&
    Math.abs(p.right - q.right) <= 6 &&
    Math.abs(p.bottom - q.bottom) <= 6
  );
}

/** Compares the places Tab stopped with the highlight's targets. */
export function compareWithTabStops(
  stops: readonly Element[],
  candidates: readonly Element[],
  view: Window,
  ignoreWithin?: string,
): RefereeReport {
  const report: RefereeReport = { stops: stops.length, seen: 0, reached: 0, missed: [], beyond: 0 };
  const related = new Set<Element>();
  for (const stop of stops) {
    if (!stop.isConnected || (ignoreWithin && stop.closest(ignoreWithin))) continue;
    const r = stop.getBoundingClientRect();
    const hiddenToggle = stop instanceof HTMLInputElement && (stop.type === 'checkbox' || stop.type === 'radio');
    // A toggle hidden behind its label is reached through the label.
    const stands = hiddenToggle ? [...(stop.labels ?? [])] : [];
    // Far off to one side (a slide of a carousel not yet turned to) is not seen either.
    const visible = Math.min(r.width, r.height) >= SMALLEST && isVisible(stop, view) && onScreenish(stop, view);
    if (!visible && !stands.some((label) => candidates.includes(label))) continue;
    report.seen += 1;
    const hits = candidates.filter(
      (c) =>
        c === stop ||
        stands.includes(c as HTMLLabelElement) ||
        deepContains(stop, c) ||
        deepContains(c, stop) ||
        sameSpot(c, stop),
    );
    if (hits.length) {
      report.reached += 1;
      for (const c of hits) related.add(c);
    } else if (report.missed.length < 40) {
      report.missed.push({ what: describe(stop), size: `${Math.round(r.width)}x${Math.round(r.height)}` });
    }
  }
  report.beyond = candidates.filter((c) => !related.has(c)).length;
  return report;
}

/** Remembers where Tab stops, one call after each press, and compares at the end. */
export class Referee {
  private readonly stops: Element[] = [];

  constructor(
    private readonly doc: Document,
    private readonly candidates: () => Element[],
    private readonly ignoreWithin?: string,
  ) {}

  /** Call after a press of Tab. Says whether it stopped somewhere new, somewhere already seen, or nowhere. */
  note(): 'new' | 'again' | 'nowhere' {
    const at = deepActiveElement(this.doc);
    if (!at || at === this.doc.body || at === this.doc.documentElement) return 'nowhere';
    if (this.stops.includes(at)) return 'again';
    this.stops.push(at);
    return 'new';
  }

  /** The comparison of every stop noted so far with what the highlight can reach now. */
  report(): RefereeReport {
    const view = this.doc.defaultView;
    if (!view) return { stops: this.stops.length, seen: 0, reached: 0, missed: [], beyond: 0 };
    return compareWithTabStops(this.stops, this.candidates(), view, this.ignoreWithin);
  }
}
