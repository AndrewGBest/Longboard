// Automation safety net (Hard rule 11). When the app is being driven by a
// test harness or an AI agent, no click may reach a control that could spend
// money or start a subscription. Ordinary users are never affected: this is
// only installed in automation mode. It errs toward blocking, and must never
// be weakened to get a test through.
import { deepClosest } from '../spatial/deep';

/**
 * Account matters an agent or script has no business in: leaving the account,
 * or changing who is on it. The words are here so the guard does not rest on
 * the site keeping its markup.
 */
const ACCOUNT_WORDS =
  /\b(log ?out|sign ?out|(add|edit|delete|manage) profiles?|account( settings)?|billing|payment (method|details)|cancel (subscription|membership|plan))\b/i;

/** Words on a control that buys, rents, subscribes or signs up. */
const SPEND_WORDS =
  /\b(buy|rent|rentals?|purchase|pre-?order|subscribe|subscription|free trial|start (your )?trial|try (it |for )?free|join (prime|now|today|free)|sign[- ]?up|register|get started|upgrade|(go )?ad[- ]free|add to (cart|basket)|place (your )?order|order now|pay|checkout|1-click)\b/i;
/** A price on a button: "$3.99", "€ 5", "3,99 €". */
const PRICE = /[$£€¥]\s?\d|\d\s?[$£€¥]/;
/** What counts as a control in its own right, whatever is inside it. */
const CONTROL =
  'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], input[type="image"]';

/**
 * URL fragments that indicate a payment or sign-up flow. A heuristic, not
 * something confirmed on any one site. Not "offers" (see DECISIONS.md,
 * 2026-11-21): one service's signed-out front page lives at such an
 * address, and looking at a page of offers spends nothing. The buttons on
 * it are still never pressed (SPEND_WORDS, PRICE), and where they lead is
 * still never opened (the rest of this list).
 */
const SPEND_URL = /(checkout|\/buy\b|\/gp\/buy|purchase|signup|sign-up|subscribe|payment)/i;
/** The same for the first part of a host name: checkout.example.com. */
const SPEND_HOST = /^(checkout|pay|payments?|billing|buy|subscribe|signup)\./i;

/** True when an address looks like part of paying or signing up. One that cannot be read counts as one. */
export function looksLikeSpendUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://invalid.example');
    return SPEND_URL.test(u.pathname + u.search) || SPEND_HOST.test(u.hostname);
  } catch {
    return true; // Unparseable target: refuse rather than guess.
  }
}

/** Everything a control says about itself: its words, and the names given to it and to the pictures in it. */
function describe(el: Element): string {
  const parts = [
    el.textContent ?? '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('title') ?? '',
    el.getAttribute('value') ?? '',
    el.getAttribute('alt') ?? '',
    // A button that is only a picture says what it is in the picture's description.
    ...[...el.querySelectorAll('img[alt], svg[aria-label], [aria-label]')]
      .slice(0, 8)
      .map((n) => n.getAttribute('alt') ?? n.getAttribute('aria-label') ?? ''),
  ];
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** True when pressing `control` would send the form it is in. */
function submits(control: Element): boolean {
  const type = (control.getAttribute('type') ?? '').toLowerCase();
  if (control.matches('input')) return type === 'submit' || type === 'image';
  return control.matches('button') && type !== 'button' && type !== 'reset';
}

/**
 * True when activating `target` could plausibly spend money. Errs toward
 * blocking. `pageUrl` is the address of the page the control is on: a form
 * that names nowhere to go sends to its own page. Looks out through shadow
 * roots, so a button inside a web component is judged as the button it is.
 */
export function isSpendControl(target: Element, extraSelectors: readonly string[] = [], pageUrl = ''): boolean {
  const found = deepClosest(target, CONTROL);
  const control = found ?? target;
  for (const sel of extraSelectors) {
    try {
      if (deepClosest(control, sel)) return true;
    } catch {
      // A selector this browser cannot parse names nothing.
    }
  }
  const text = describe(control);
  // Outside a real control, long text means a container was reached, not a button.
  if (
    (found || text.length <= 80) &&
    (SPEND_WORDS.test(text) || ACCOUNT_WORDS.test(text) || (text.length <= 80 && PRICE.test(text)))
  )
    return true;
  const href = control.getAttribute('href');
  if (href && looksLikeSpendUrl(href)) return true;
  const form = deepClosest(control, 'form');
  if (form && (submits(control) || form.hasAttribute('action'))) {
    if (looksLikeSpendUrl(form.getAttribute('action') || pageUrl)) return true;
  }
  return false;
}

/**
 * Stops every click, press of Enter or Space, and form submission that
 * isSpendControl refuses, before the page hears of it. `onBlocked` is told
 * each time. Returns the function that takes the guard away.
 */
export function installPurchaseGuard(
  doc: Document,
  extraSelectors: readonly string[],
  onBlocked: (el: Element) => void,
): () => void {
  const here = (): string => doc.defaultView?.location.href ?? '';
  const handler = (e: Event): void => {
    // Seen from the window, something inside a web component looks like the
    // component itself; the path says what was really pressed.
    const first = typeof e.composedPath === 'function' ? e.composedPath()[0] : null;
    const t = first instanceof Element ? first : e.target;
    if (!(t instanceof Element)) return;
    if (isSpendControl(t, extraSelectors, here())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      onBlocked(t);
    }
  };
  const submit = (e: Event): void => {
    const form = e.target;
    if (form instanceof HTMLFormElement && looksLikeSpendUrl(form.getAttribute('action') || here())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      onBlocked(form);
    }
  };
  // Capture phase on the window, so this runs before any handler of the page's.
  const view = doc.defaultView;
  const events = ['click', 'pointerdown', 'mousedown', 'mouseup', 'pointerup', 'keydown'] as const;
  const keyFilter = (e: Event): void => {
    if (e.type === 'keydown') {
      const k = (e as KeyboardEvent).key;
      if (k !== 'Enter' && k !== ' ') return;
    }
    handler(e);
  };
  for (const name of events) view?.addEventListener(name, keyFilter, true);
  view?.addEventListener('submit', submit, true);
  return () => {
    for (const name of events) view?.removeEventListener(name, keyFilter, true);
    view?.removeEventListener('submit', submit, true);
  };
}
