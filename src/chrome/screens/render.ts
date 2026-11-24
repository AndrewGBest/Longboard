// Draws whichever screen the state calls for.
import { el } from '../parts';
import { home } from './home';
import { menuPanel } from './menu';
import {
  aboutPanel,
  downloadsPanel,
  historyPanel,
  tabsPanel,
  findPanel,
  readerPanel,
  pinPanel,
  phonePanel,
  promptPanel,
} from './panels';
import { addAppPanel, editPanel } from './site-panels';
import { settingsPanel } from './settings';
import { ui } from './ui';

/** The panel last drawn: one that is already open does not slide in again each time something on it changes. */
let drawnPanel: string | null = null;

export function render(): void {
  const s = ui.state;
  if (!s) return;
  const keep = document.querySelector('[data-longboard-focus]')?.id;
  // A site arriving in place of another: the whole window, with its name and a moving line, and nothing to choose.
  if (s.cover !== null && s.surface === 'page' && !s.panel) {
    document.body.classList.remove('strip');
    drawnPanel = null;
    const name = el('p', { id: 'cover-site' });
    name.textContent = s.cover;
    const cover = el('div', { id: 'cover' }, [name, el('div', { cls: 'cover-line' }, [el('i', {})])]);
    cover.setAttribute('role', 'status');
    cover.setAttribute('aria-label', `Opening ${s.cover}`);
    document.body.replaceChildren(cover, ...document.querySelectorAll('longboard-overlay'));
    return;
  }
  const reader = s.panel === 'reader';
  const strip = s.surface === 'page' && !reader;
  document.body.classList.toggle('strip', strip);
  const parts: Node[] = [];
  // Behind a website the view is only as wide as the panel; Home is not drawn.
  if (!strip && !reader) parts.push(home(s));
  let panel: HTMLElement | null = null;
  if (s.panel) {
    panel = el(
      'aside',
      { id: 'panel' },
      s.panel === 'menu'
        ? menuPanel(s)
        : s.panel === 'about'
          ? aboutPanel(s)
          : s.panel === 'addApp'
            ? addAppPanel(s)
            : s.panel === 'edit'
              ? editPanel(s)
              : s.panel === 'downloads'
                ? downloadsPanel(s)
                : s.panel === 'settings'
                  ? settingsPanel(s)
                  : s.panel === 'history'
                    ? historyPanel(s)
                    : s.panel === 'tabs'
                      ? tabsPanel(s)
                      : s.panel === 'find'
                        ? findPanel()
                        : s.panel === 'reader'
                          ? readerPanel(s)
                          : s.panel === 'pin'
                            ? pinPanel(s)
                            : s.panel === 'phone'
                              ? phonePanel(s)
                              : promptPanel(s),
    );
    if (reader) panel.classList.add('reader');
    if (drawnPanel === s.panel) panel.classList.add('still');
    // The layer keeps the highlight inside an open modal dialog.
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    parts.push(panel);
  }
  drawnPanel = s.panel;
  // Where a long list had been scrolled to is kept when it is drawn again.
  const scrolled = document.getElementById('panel')?.scrollTop ?? 0;
  const homeScrolled = document.getElementById('home')?.scrollTop ?? 0;
  document.body.replaceChildren(...parts, ...document.querySelectorAll('longboard-overlay'));
  if (panel && panel.classList.contains('still')) panel.scrollTop = scrolled;
  const homeNow = document.getElementById('home');
  if (homeNow) homeNow.scrollTop = homeScrolled;
  if (!ui.layer || ui.typing) return;
  const same = keep ? document.getElementById(keep) : null;
  const inScope = same && (!panel || panel.contains(same)) && !(same as HTMLButtonElement).disabled;
  if (inScope) ui.layer.focus(same);
  else if (panel) {
    // Not the text field: landing on it would put the keyboard up before anything was asked for.
    // A question starts on the answer that changes nothing: a page can time
    // its request for when OK is about to be pressed for something else.
    const first =
      document.getElementById('prompt-deny') ?? [...panel.querySelectorAll('button')].find((b) => !b.disabled);
    if (first) ui.layer.focus(first);
  } else {
    const first = document.querySelector('.tiles button') ?? document.getElementById('go');
    if (first) ui.layer.focus(first);
  }
}
