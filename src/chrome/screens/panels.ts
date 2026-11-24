// The smaller panels: find in page, the PIN, reader view, tabs, history, downloads, About, questions, typing from a phone.
import { aboutTitle, BACKGROUND, HELP, NOTICE, SHORTCUT_HELP } from '../../shared/about';
import { type ChromeState } from '../../shared/chrome';
import { PRODUCT } from '../../shared/product';
import { HARMFUL_WORDS } from '../../shared/harmful';
import { button, el, heading, icon, note, row } from '../parts';
import { render } from './render';
import { tell, ui } from './ui';

/** Find words on the page in front: a field, and next and previous. What was typed stays while the panel is open. */
export function findPanel(): Node[] {
  const field = el('input', { id: 'find-text' });
  field.type = 'text';
  field.value = ui.finding;
  field.placeholder = 'Words to find';
  field.setAttribute('aria-label', 'Words to find');
  field.setAttribute('enterkeyhint', 'search');
  field.autocapitalize = 'off';
  field.spellcheck = false;
  const look = (forward: boolean) => (): void => {
    if (ui.finding.trim()) tell({ kind: 'find', text: ui.finding, forward });
  };
  field.addEventListener('input', () => (ui.finding = field.value));
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    field.blur();
    look(true)();
    const next = document.getElementById('find-next');
    if (next) ui.layer?.focus(next);
  });
  return [
    heading('Find on this page', 'search'),
    field,
    el('div', { cls: 'pair' }, [
      button('find-previous', 'Previous', look(false), false, 'back'),
      button('find-next', 'Next', look(true), false, 'forward'),
    ]),
    note(
      'Each place the words are found is marked on the page. The part of the page under this panel cannot be seen until it is closed.',
    ),
    row('find-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  ];
}

/** A dot for each of the four digits, filled for those entered. The digits themselves are never drawn. */
function pinDots(): HTMLElement {
  const dots = el(
    'p',
    { id: 'pin-dots' },
    [0, 1, 2, 3].map((i) => el('i', { cls: i < ui.pinDigits.length ? 'in' : '' })),
  );
  dots.setAttribute('role', 'status');
  dots.setAttribute('aria-label', `${ui.pinDigits.length} of 4 digits entered`);
  return dots;
}

/** One press on the PIN screen: a digit or 'delete'. The fourth digit sends the PIN to the shell and empties the dots. */
export function pinKey(key: string): void {
  if (ui.state?.panel !== 'pin') return;
  if (key === 'delete') ui.pinDigits = ui.pinDigits.slice(0, -1);
  else if (/^\d$/.test(key) && ui.pinDigits.length < 4) ui.pinDigits += key;
  if (ui.pinDigits.length === 4) {
    const digits = ui.pinDigits;
    ui.pinDigits = '';
    tell({ kind: 'pin', digits });
  }
  document.getElementById('pin-dots')?.replaceWith(pinDots());
}

/** The PIN screen: ten digits to press with OK (or the number buttons of a remote), shown only as dots. */
export function pinPanel(s: ChromeState): Node[] {
  const p = s.pin;
  const word = (b: HTMLButtonElement): HTMLButtonElement => {
    b.className = 'word';
    return b;
  };
  const pad = el(
    'div',
    { cls: 'pinpad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => button(`pin-${d}`, d, () => pinKey(d))),
  );
  const last = el('div', { cls: 'pinpad' }, [
    word(button('pin-delete', 'Delete', () => pinKey('delete'))),
    button('pin-0', '0', () => pinKey('0')),
    word(button('pin-cancel', 'Cancel', () => tell({ kind: 'menu', action: 'close' }))),
  ]);
  const items: Node[] = [heading('PIN', 'lock'), el('p', { cls: 'lead', text: p?.title ?? '' }), pinDots()];
  if (p && p.waitSeconds > 0)
    items.push(
      el('p', {
        id: 'pin-wait',
        cls: 'where warn',
        text: `Too many wrong tries. Another is taken in ${p.waitSeconds} seconds.`,
      }),
    );
  items.push(pad, last);
  if (p?.note) items.push(note(p.note));
  return items;
}

/** How big the reader view's words are; kept while Longboard is open. */
const READER_SIZES = [3, 3.6, 4.4, 5.4, 6.6] as const;
let readerSize = 1;

/** Reader view: the words of the article, big, on a screen of their own. Up and Down move through it. */
export function readerPanel(s: ChromeState): Node[] {
  const r = s.reader;
  if (!r) return [heading('Reader view', 'book')];
  const size = (step: number) => (): void => {
    readerSize = Math.min(READER_SIZES.length - 1, Math.max(0, readerSize + step));
    render();
  };
  const tags = { heading: 'h2', text: 'p', item: 'li', quote: 'blockquote', code: 'pre' } as const;
  const minutes = Math.max(1, Math.round(r.blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0) / 220));
  // Items that follow one another are one list, so a screen reader says "list" and counts them.
  const body: HTMLElement[] = [];
  for (const b of r.blocks.filter((b, i) => !(i === 0 && b.kind === 'heading' && b.text.trim() === r.title.trim()))) {
    const block = el(tags[b.kind] ?? 'p', { text: b.text });
    const last = body[body.length - 1];
    if (b.kind !== 'item') body.push(block);
    else if (last?.tagName === 'UL') last.append(block);
    else body.push(el('ul', {}, [block]));
  }
  const article = el('article', { id: 'reader-text' }, [
    el('h1', { text: r.title || r.site }),
    el('p', { cls: 'where', text: `${r.site} · about ${minutes === 1 ? '1 minute' : `${minutes} minutes`} to read` }),
    ...body,
  ]);
  article.style.fontSize = `${READER_SIZES[readerSize]}vh`;
  return [
    el('div', { cls: 'pair', id: 'reader-bar' }, [
      button('reader-close', 'Close reader view', () => tell({ kind: 'menu', action: 'close' }), false, 'back'),
      el('span', { cls: 'spacer' }),
      button('reader-smaller', 'Smaller words', size(-1), readerSize === 0, 'minus'),
      button('reader-bigger', 'Bigger words', size(1), readerSize === READER_SIZES.length - 1, 'plus'),
    ]),
    article,
  ];
}

/** The open tabs: bring one in front, close one, or open another. */
export function tabsPanel(s: ChromeState): Node[] {
  const items: Node[] = [
    heading('Tabs', 'tabs'),
    el('div', { cls: 'pair' }, [
      button('tab-new', 'New tab', () => tell({ kind: 'tab', op: 'new' }), false, 'plus'),
      button('tab-private', 'New private tab', () => tell({ kind: 'tab', op: 'private' }), false, 'private'),
    ]),
  ];
  s.tabs.forEach((t, i) => {
    const what = t.site ? (t.title ? `${t.title} (${t.site})` : t.site) : 'Empty tab';
    const name = t.private ? `Private: ${what}` : what;
    const open = row(
      `tab-${i}`,
      t.site ? t.title || t.site : 'Empty tab',
      () => tell({ kind: 'tab', op: 'switch', id: t.id }),
      {
        ...(t.private ? { icon: 'private' as const } : {}),
        sub: [t.private ? 'Private' : '', t.site, t.current ? 'In front now' : ''].filter(Boolean).join(' · '),
        cls: `grow${t.current ? ' chosen' : ''}`,
        say: t.current ? `${name}: in front now` : name,
      },
    );
    if (s.tabs.length < 2) return void items.push(open);
    const close = button(`tab-close-${i}`, '', () => tell({ kind: 'tab', op: 'close', id: t.id }));
    close.append(icon('close'));
    close.setAttribute('aria-label', `Close: ${name}`);
    items.push(el('div', { cls: 'pair' }, [open, close]));
  });
  if (s.closedTabs > 0)
    items.push(
      row('tab-reopen', 'Open the tab closed last', () => tell({ kind: 'tab', op: 'reopen' }), { icon: 'history' }),
    );
  items.push(row('tabs-close', 'Close this list', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }));
  return items;
}

/** The history's rows that have the words searched for, under the day each was opened. At most 80 are drawn. */
function historyRows(s: ChromeState): Node[] {
  const words = ui.historyWords.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = s.history ?? [];
  const items: Node[] = [];
  let day = '';
  let shown = 0;
  all.forEach((v, i) => {
    const hay = `${v.title} ${v.site} ${v.url}`.toLowerCase();
    if (!words.every((w) => hay.includes(w)) || shown >= 80) return;
    shown += 1;
    if (v.day !== day) items.push(el('h2', { text: (day = v.day) }));
    const open = row(`visit-${i}`, v.title || v.site, () => tell({ kind: 'openVisit', url: v.url }), {
      sub: v.site,
      value: v.time,
      cls: 'grow',
      say: v.text,
    });
    const forget = button(`visit-forget-${i}`, '', () => tell({ kind: 'forgetVisit', url: v.url }));
    forget.append(icon('close'));
    forget.setAttribute('aria-label', `Take out of the history: ${v.title || v.site}`);
    items.push(el('div', { cls: 'pair' }, [open, forget]));
  });
  if (!shown && all.length) items.push(note('No page in the history has those words.'));
  return items;
}

/** The pages opened lately. Pressing one opens it; the cross beside it takes it out of the history. */
export function historyPanel(s: ChromeState): Node[] {
  const items: Node[] = [heading('History', 'history')];
  const list = s.history ?? [];
  if (!list.length)
    items.push(
      el('p', { cls: 'lead', text: 'No pages yet.' }),
      note('Settings, under Privacy, says whether a history is kept.'),
    );
  else {
    const field = el('input', { id: 'history-find' });
    field.type = 'text';
    field.value = ui.historyWords;
    field.placeholder = 'Search the history';
    field.setAttribute('aria-label', 'Search the history');
    field.setAttribute('enterkeyhint', 'search');
    field.autocapitalize = 'off';
    field.spellcheck = false;
    // Only the list is drawn again as words are typed, so the field keeps what is in it.
    field.addEventListener('input', () => {
      ui.historyWords = field.value;
      document.getElementById('visits')?.replaceChildren(...historyRows(s));
    });
    items.push(field, el('div', { id: 'visits', cls: 'list' }, historyRows(s)));
  }
  items.push(row('history-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }));
  return items;
}

/** What was downloaded in this run and how each one went. Longboard does not open the files. */
export function downloadsPanel(s: ChromeState): Node[] {
  const said = { saved: 'Saved', cancelled: 'Cancelled', failed: 'Failed' } as const;
  const items: Node[] = [heading('Downloads', 'download')];
  for (const d of s.downloads) {
    items.push(note(`${d.name}: ${d.state === 'going' ? d.progress : said[d.state]}`));
    if (d.state === 'going')
      items.push(
        row(`dl-cancel-${d.id}`, `Cancel ${d.name}`, () => tell({ kind: 'cancelDownload', id: d.id }), {
          icon: 'close',
        }),
      );
  }
  if (s.pastDownloads.length) {
    items.push(el('h2', { text: 'Saved earlier' }));
    for (const name of s.pastDownloads) items.push(note(name));
  }
  items.push(row('downloads-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }));
  return items;
}

/** About and help: the notice, what each button does, and what is fetched in the background (Hard rule 12). */
export function aboutPanel(s: ChromeState): Node[] {
  const list = el('dl');
  for (const [keys, what] of HELP) list.append(el('dt', { text: what }), el('dd', { text: keys }));
  const more = el('dl');
  for (const [keys, what] of SHORTCUT_HELP) more.append(el('dt', { text: what }), el('dd', { text: keys }));
  return [
    heading(aboutTitle(s.version)),
    el('p', { text: NOTICE }),
    el('h2', { text: 'Buttons' }),
    list,
    el('h2', { text: 'With a keyboard plugged in' }),
    more,
    el('h2', { text: `What ${PRODUCT.name} fetches by itself` }),
    el('p', { text: BACKGROUND }),
    row('about-close', 'Close', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  ];
}

/**
 * A question from the shell that needs a yes or a no. The no always has the
 * id 'prompt-deny', which is where render() puts the highlight first.
 */
export function promptPanel(s: ChromeState): Node[] {
  const answer = (allow: boolean) => (): void => tell({ kind: 'answer', allow });
  const lead = (text: string): HTMLElement => el('p', { cls: 'lead', text });
  const yes = (text: string): HTMLButtonElement => row('prompt-allow', text, answer(true), { icon: 'check' });
  const no = (text: string): HTMLButtonElement => row('prompt-deny', text, answer(false), { icon: 'close' });
  if (s.prompt?.what === 'profile') {
    return [
      heading('Use this profile?', 'layers'),
      lead(`"${s.prompt.name}" (version ${s.prompt.version}) is a profile someone gave you. Nobody has reviewed it.`),
      el('p', { text: `It applies to: ${s.prompt.hosts.join(', ')}` }),
      el('p', {
        text: `A profile is settings, not a program: it tells ${PRODUCT.name} where things are on a site and cannot run anything. Your answer is remembered.`,
      }),
      yes('Use it'),
      no('Do not use it'),
    ];
  }
  if (s.prompt?.what === 'extension') {
    return [
      heading('Add this extension?', 'plug'),
      note(`${s.prompt.name} (version ${s.prompt.version})`),
      lead('It will be able to:'),
      ...s.prompt.can.map((c) => el('p', { text: `• ${c}` })),
      ...s.prompt.cannot.map((c) => el('p', { cls: 'warn', text: c })),
      el('p', {
        text: `An extension is a program written by someone else. ${PRODUCT.name} has not looked at it. Add it only if you trust who made it.`,
      }),
      yes('Add it'),
      no('Do not add it'),
    ];
  }
  if (s.prompt?.what === 'harmful') {
    return [
      heading(HARMFUL_WORDS.title, 'warn'),
      lead(HARMFUL_WORDS.lead(s.prompt.site)),
      el('p', { text: HARMFUL_WORDS.more }),
      no(HARMFUL_WORDS.no),
      yes(HARMFUL_WORDS.yes),
    ];
  }
  if (s.prompt?.what === 'voiceModel') {
    return [
      heading('Fetch the speech model?', 'mic'),
      lead(
        `To understand speech, ${PRODUCT.name} needs a model of ${s.prompt.size}. It is fetched once, from its makers at download.moonshine.ai.`,
      ),
      el('p', {
        text: 'After that, what you say is worked out on this machine and is never sent anywhere. English only for now. Settings, under Remote and keyboard buttons, removes the model.',
      }),
      yes('Fetch it'),
      no('Not now'),
    ];
  }
  if (s.prompt?.what === 'password') {
    return [
      heading('Keep this password?', 'lock'),
      lead(s.prompt.user ? `For ${s.prompt.user} at ${s.prompt.site}.` : `For ${s.prompt.site}.`),
      el('p', {
        text: `It is kept on this machine only, encrypted by the system's keyring, and offered back on that site's sign-in page. Settings, under Passwords, removes it.`,
      }),
      yes('Keep it'),
      no('Not now'),
      row('prompt-never', 'Never for this site', () => tell({ kind: 'answer', allow: false, never: true }), {
        cls: 'quiet',
      }),
    ];
  }
  if (s.prompt?.what === 'handBack') {
    return [
      heading('Share this?', 'shield'),
      lead(`The program that opened ${PRODUCT.name} is asking for ${s.prompt.wants}.`),
      el('p', {
        text: `Only that list is shared, once, with that program on this device. Your password and your sign-in to ${s.prompt.site} are not.`,
      }),
      // Longboard cannot know which program asked. Where the answer goes is what it does know, and it says so.
      note(`${PRODUCT.name} cannot tell which program that is. The list would be written to this file: ${s.prompt.to}`),
      yes('Share the list'),
      no('Do not share'),
    ];
  }
  if (s.prompt?.what === 'download') {
    return [
      heading('Download this file?', 'download'),
      // The name is the site's to choose, so it stands apart from what Longboard says about it.
      note(s.prompt.name),
      lead(`${s.prompt.size ? `${s.prompt.size}, from` : 'From'} ${s.prompt.site}.`),
      el('p', { text: `It will be saved in ${s.prompt.folder}. ${PRODUCT.name} does not open downloaded files.` }),
      yes('Download'),
      no('Cancel'),
    ];
  }
  const site = s.prompt?.what === 'permission' ? s.prompt.site : 'This site';
  const wants = s.prompt?.what === 'permission' ? s.prompt.wants : 'do something';
  return [
    heading('Allow this?', 'shield'),
    lead(`${site} wants to ${wants}.`),
    el('p', { text: 'Your answer is remembered for this site. The menu can forget it. Back asks again next time.' }),
    yes('Allow'),
    no('Do not allow'),
  ];
}

/** A square code for a phone's camera, drawn as one path of little squares, dark on white with a clear border. */
function scanCode(rows: string[]): SVGSVGElement {
  const SVG = 'http://www.w3.org/2000/svg';
  const size = rows.length;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('id', 'scan-code');
  svg.setAttribute('viewBox', `-4 -4 ${size + 8} ${size + 8}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'A code for a phone camera to scan');
  const back = document.createElementNS(SVG, 'rect');
  for (const [k, v] of Object.entries({
    x: '-4',
    y: '-4',
    width: String(size + 8),
    height: String(size + 8),
    fill: '#fff',
  }))
    back.setAttribute(k, v);
  const dots = document.createElementNS(SVG, 'path');
  let d = '';
  rows.forEach((line, y) => [...line].forEach((bit, x) => (d += bit === '1' ? `M${x} ${y}h1v1h-1z` : '')));
  dots.setAttribute('d', d);
  dots.setAttribute('fill', '#000');
  svg.append(back, dots);
  return svg;
}

/** Typing from a phone: the code to scan, the address, and how to turn it off. */
export function phonePanel(s: ChromeState): Node[] {
  const p = s.phone;
  const items: Node[] = [heading('Type from a phone', 'remote')];
  if (!p) return items;
  items.push(
    el('p', {
      cls: 'lead',
      id: 'phone-state',
      text: p.connected ? 'A phone is connected.' : "Point your phone's camera at this code.",
    }),
    scanCode(p.code),
    note(
      `The phone must be on the same home network as this TV. The code opens a page at ${p.url} with a key that is only in the code.`,
    ),
    note(
      'On the phone: type or dictate and press Send, and the words go into the text field selected here. It also has arrows, OK, Back and Menu.',
    ),
    row('phone-close', 'Done', () => tell({ kind: 'menu', action: 'close' }), { icon: 'check' }),
    row('phone-off', 'Turn typing from a phone off', () => tell({ kind: 'menu', action: 'phoneOff' }), {
      icon: 'close',
      cls: 'quiet',
    }),
    note(
      `While it is on, ${PRODUCT.name} answers on your home network at that address. What a phone sends is sealed, so others on the network cannot read it; someone able to change traffic on your network could still interfere. It goes off when ${PRODUCT.name} closes.`,
    ),
  );
  return items;
}
