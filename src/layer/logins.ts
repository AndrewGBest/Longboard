// Sign-in forms: finding one on a page, reading what was typed into it when
// it is sent, and filling one in. This runs in the isolated world of the
// page's preload and is only ever used when the shell says saved sign-ins
// are on and the run is not a scripted one (Hard rule 10). Nothing here
// keeps or logs what it reads.

const visible = (el: HTMLElement): boolean => {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  // A field with no size is a trap for programs, not something a person signs in with.
  // Without a layout engine (the unit tests) nothing has a size, and what is not hidden counts as seen.
  const root = el.ownerDocument.documentElement.getBoundingClientRect();
  if (root.width === 0 && root.height === 0) return true;
  const box = el.getBoundingClientRect();
  return box.width > 2 && box.height > 2;
};

const usable = (el: HTMLInputElement): boolean => !el.disabled && !el.readOnly && visible(el);

const NAME_TYPES = new Set(['text', 'email', 'tel', '']);

export interface LoginFields {
  user: HTMLInputElement | null;
  pass: HTMLInputElement;
}

/**
 * The sign-in form of a page: its one password field that can be seen, and
 * the field for the name before it. A page with two or more password fields
 * showing is making or changing a password, not signing in, and is left alone.
 */
export function findLogin(doc: Document): LoginFields | null {
  const passwords = [...doc.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(usable);
  if (passwords.length !== 1) return null;
  const pass = passwords[0]!;
  const scope: ParentNode = pass.form ?? doc;
  const fields = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(
    (i) => i !== pass && NAME_TYPES.has((i.getAttribute('type') ?? '').toLowerCase()) && usable(i),
  );
  const before = fields.filter((i) => (i.compareDocumentPosition(pass) & 4) !== 0);
  const named = before.find((i) => /user|email|login/i.test(`${i.autocomplete} ${i.name} ${i.id}`));
  return { user: named ?? before[before.length - 1] ?? null, pass };
}

/** What is typed into the page's sign-in form now, or null when there is no form or no password in it. */
export function readLogin(doc: Document): { user: string; password: string } | null {
  const found = findLogin(doc);
  if (!found || !found.pass.value) return null;
  return { user: found.user?.value.trim() ?? '', password: found.pass.value };
}

/** Puts text in a field the way typing does, so a page that watches its fields hears of it. */
function setValue(field: HTMLInputElement, text: string): void {
  const view = field.ownerDocument.defaultView;
  const setter = view ? Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set : undefined;
  if (setter) setter.call(field, text);
  else field.value = text;
  const Ev = view?.Event ?? Event;
  field.dispatchEvent(new Ev('input', { bubbles: true }));
  field.dispatchEvent(new Ev('change', { bubbles: true }));
}

/** Fills the page's sign-in form. Nothing is sent: the person presses the site's own button. False when there is no form. */
export function fillLogin(doc: Document, user: string, password: string): boolean {
  const found = findLogin(doc);
  if (!found) return false;
  if (found.user && user) setValue(found.user, user);
  setValue(found.pass, password);
  return true;
}

/**
 * Watches for the sign-in form being sent: the form's own submit, Enter in
 * one of its fields, or a press on a button while a password is typed in.
 * Many sites send the form from script and never submit it, so all three are
 * watched. `seen` is told that there is a form, once; `sent` what was typed.
 */
export function watchLogins(
  doc: Document,
  tell: { seen: () => void; sent: (login: { user: string; password: string }) => void },
): void {
  let said = false;
  let last = '';
  const look = (): void => {
    if (!said && findLogin(doc)) {
      said = true;
      tell.seen();
    }
  };
  const send = (): void => {
    const login = readLogin(doc);
    if (!login) return;
    const key = `${login.user}\n${login.password}`;
    if (key === last) return;
    last = key;
    tell.sent(login);
  };
  doc.addEventListener('submit', send, true);
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && e.target instanceof (doc.defaultView?.HTMLInputElement ?? HTMLInputElement)) send();
    },
    true,
  );
  doc.addEventListener(
    'click',
    (e) => {
      const el = e.target as Element | null;
      if (el?.closest?.('button, input[type="submit"], input[type="button"], [role="button"], a')) send();
    },
    true,
  );
  doc.addEventListener('focusin', look, true);
  look();
  const view = doc.defaultView;
  view?.addEventListener('load', () => view.setTimeout(look, 1200), { once: true });
}
