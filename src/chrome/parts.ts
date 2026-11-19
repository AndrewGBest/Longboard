// What Longboard's own screens are built from: icons, rows, switches. The
// icons are drawn here, as line drawings of this project's own making (Hard
// rule 1): nothing is loaded and nothing is copied from an icon set.

/** Each icon is a few strokes on a 24 by 24 grid. */
const RING = 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z';
const ICONS = {
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z', 'M16.2 16.2L21 21'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  forward: ['M5 12h14', 'M13 6l6 6-6 6'],
  reload: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4v4.5h-4.5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  home: ['M4 11l8-7 8 7', 'M6 10v9h12v-9'],
  tabs: ['M8 8h12v12H8z', 'M4 16V4h12'],
  history: [RING, 'M12 8v4l3 2'],
  settings: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10', 'M16 5a2 2 0 1 0 0 4a2 2 0 0 0 0-4z', 'M8 15a2 2 0 1 0 0 4a2 2 0 0 0 0-4z'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  unlock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 6.6-1.6'],
  shield: ['M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6z'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9-4.3-4.1 5.9-.8z'],
  pointer: ['M5 3l14 7-6 2-2 6z'],
  book: ['M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z', 'M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z'],
  monitor: ['M3 5h18v11H3z', 'M9 20h6', 'M12 16v4'],
  apps: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  plug: ['M9 3v5', 'M15 3v5', 'M6 8h12v3a6 6 0 0 1-12 0z', 'M12 17v4'],
  info: [RING, 'M12 11v5', 'M12 7.6v.4'],
  power: ['M12 3v8', 'M6.6 6.6a8 8 0 1 0 10.8 0'],
  globe: [RING, 'M4 12h16', 'M12 4c2.5 2.6 2.5 13.4 0 16c-2.5-2.6-2.5-13.4 0-16z'],
  private: ['M3 12c2.5-4 5.5-6 9-6s6.5 2 9 6c-2.5 4-5.5 6-9 6s-6.5-2-9-6z', 'M4 4l16 16'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  chevron: ['M9 6l6 6-6 6'],
  trash: ['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  remote: ['M8 3h8v18H8z', 'M12 7v.5', 'M12 12v.5'],
  warn: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17v.4'],
  text: ['M4 18l4.5-12L13 18', 'M5.6 14h5.8', 'M15 18l3-8 3 8', 'M16 15.6h4'],
  block: [RING, 'M6.4 6.4l11.2 11.2'],
  layers: ['M12 4l8 4-8 4-8-4z', 'M4 12l8 4 8-4', 'M4 16l8 4 8-4'],
  update: [RING, 'M12 16V8', 'M8.5 11.5L12 8l3.5 3.5'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  menu: ['M5 7h14', 'M5 12h14', 'M5 17h14'],
  mic: ['M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M6 11a6 6 0 0 0 12 0', 'M12 17v4'],
} as const;
export type IconName = keyof typeof ICONS;

const SVG = 'http://www.w3.org/2000/svg';

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'ic');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Longboard's own mark: a deck seen from above inside the highlight ring, as in assets/icon.svg. */
export function logo(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'logo');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  const shape = (tag: string, attrs: Record<string, string>): void => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  };
  shape('rect', { width: '48', height: '48', rx: '11', fill: '#16323a' });
  shape('rect', { x: '6', y: '14', width: '36', height: '20', rx: '5', fill: 'none', stroke: '#fff', 'stroke-width': '2' });
  shape('rect', { x: '7', y: '20', width: '34', height: '8', rx: '4', fill: '#e08a4c', transform: 'rotate(-18 24 24)' });
  return svg;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { id?: string; cls?: string; text?: string } = {}, children: Node[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.id) node.id = props.id;
  if (props.cls) node.className = props.cls;
  if (props.text !== undefined) node.textContent = props.text;
  node.append(...children);
  return node;
}

/** A plain button: a word or two, and optionally an icon in front. */
export function button(id: string, text: string, onPress: () => void, disabled = false, pic?: IconName): HTMLButtonElement {
  const b = el('button', { id });
  b.type = 'button';
  b.disabled = disabled;
  if (pic) b.append(icon(pic), el('span', { text }));
  else b.textContent = text;
  b.addEventListener('click', onPress);
  return b;
}

export interface RowOptions {
  icon?: IconName;
  /** A line under the label that says what the row is for. */
  sub?: string;
  /** What is chosen now, at the right. */
  value?: string;
  /** Drawn as a switch. */
  on?: boolean;
  /** Leads to another page. */
  chevron?: boolean;
  /** 'danger' for what clears or removes, 'quiet' for the way back, 'chosen' for the one in use. */
  cls?: string;
  disabled?: boolean;
  /** What a screen reader says, when it should not be "label: value". */
  say?: string;
}

/**
 * A row of a list: an icon, a label with a line under it, and at the right
 * what is chosen now, a switch, or an arrow to another page. What it says in
 * full, as one sentence, is its accessible name.
 */
export function row(id: string, label: string, onPress: () => void, o: RowOptions = {}): HTMLButtonElement {
  const b = el('button', { id, cls: `row${o.cls ? ` ${o.cls}` : ''}` });
  b.type = 'button';
  b.disabled = o.disabled === true;
  if (o.icon) b.append(icon(o.icon));
  const text = el('span', { cls: 'text' }, [el('span', { cls: 'label', text: label })]);
  if (o.sub) text.append(el('span', { cls: 'sub', text: o.sub }));
  b.append(text);
  if (o.value !== undefined) b.append(el('span', { cls: 'value', text: o.value }));
  if (o.on !== undefined) {
    b.append(el('span', { cls: `switch${o.on ? ' on' : ''}` }));
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(o.on));
  }
  if (o.chevron) b.append(icon('chevron'));
  b.setAttribute('aria-label', o.say ?? (o.on !== undefined ? `${label}: ${o.on ? 'on' : 'off'}` : o.value !== undefined ? `${label}: ${o.value}` : label));
  b.addEventListener('click', onPress);
  return b;
}

/** A panel's title, with an icon in front when it has one. */
export function heading(text: string, pic?: IconName): HTMLElement {
  const h = el('h1');
  if (pic) h.append(icon(pic));
  h.append(el('span', { text }));
  return h;
}

/** A line of explanation between rows. */
export const note = (text: string, cls = ''): HTMLElement => el('p', { cls: `where${cls ? ` ${cls}` : ''}`, text });

/** The site's own icon, as the site served it; the first letter of its name when it gave none. */
export function badge(pic: string | null, name: string): HTMLElement {
  if (!pic) return el('span', { cls: 'mono', text: name.slice(0, 1) || '?' });
  const img = el('img', { cls: 'mono icon' });
  img.src = pic;
  img.alt = '';
  return img;
}
