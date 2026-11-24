// The menu panel, and its second page about the site in front.
import { type ChromeState, type MenuAction } from '../../shared/chrome';
import { PRODUCT } from '../../shared/product';
import { badge, button, el, heading, icon, note, row } from '../parts';
import { addressField } from './home';
import { render } from './render';
import { tell, ui } from './ui';

/** The site in front, at the top of the menu: its icon, the page's title, and whether the page was sent privately. */
function siteBlock(page: NonNullable<ChromeState['page']>): HTMLElement {
  const line = page.secure
    ? el('span', {}, [icon('lock'), el('span', { text: page.site })])
    : el('span', { cls: 'warn' }, [icon('warn'), el('span', { text: `${page.site}: not secure` })]);
  return el('div', { cls: 'site' }, [
    badge(page.icon, page.site),
    el('div', { cls: 'text' }, [el('b', { text: page.title || page.site }), line]),
  ]);
}

/** The menu. What it offers depends on whether a website or Home is in front; `ui.menuPage` says which of its two pages. */
export function menuPanel(s: ChromeState): Node[] {
  const act = (action: MenuAction) => (): void => tell({ kind: 'menu', action });
  const page = s.page;
  const onPage = s.surface === 'page';
  // The things about the page in front that are wanted now and then have a page of their own, to keep the menu short.
  if (ui.menuPage === 'site' && page && onPage) {
    const items: Node[] = [
      heading('This page'),
      siteBlock(page),
      page.saved
        ? row('menu-unsave', 'Take this page off Home', act('unsavePage'), { icon: 'star' })
        : row('menu-save', 'Keep this page on Home', act('savePage'), { icon: 'star' }),
      ...(page.storeExtension
        ? [row('menu-add-extension', 'Add this extension', act('addExtension'), { icon: 'plug' })]
        : []),
      row('menu-find', 'Find on this page', act('find'), { icon: 'search' }),
      row('menu-reader', 'Reader view', act('reader'), { icon: 'book', sub: 'Only the article, in large words' }),
      row('menu-desktop', 'Desktop site', act('desktop'), {
        icon: 'monitor',
        on: page.desktop,
        sub: 'The full-width layout, with smaller words',
      }),
    ];
    if (page.answers)
      items.push(
        el('h2', { text: 'This site' }),
        note(page.answers),
        row('menu-forget', 'Forget what this site may do', act('forgetAnswers'), { icon: 'shield' }),
      );
    items.push(
      el('h2', { text: 'Profile' }),
      note(
        page.profile
          ? `Profile: ${page.profile}`
          : page.profileOff
            ? "This site's profile is switched off: generic mode"
            : 'No profile for this site: generic mode',
      ),
      row(
        'menu-edit',
        page.profile ? 'Edit the profile for this site' : 'Make a profile for this site',
        act('editProfile'),
        { icon: 'layers', chevron: true },
      ),
    );
    // A profile can change a site a great deal (its own interface for TVs); the person can always have the site without it.
    if (page.profile || page.profileOff)
      items.push(
        row('menu-site-profile', "Use this site's profile", act('siteProfile'), {
          icon: 'layers',
          on: !page.profileOff,
          sub: page.profileOff ? 'Off: the site as any browser gets it' : 'On',
        }),
      );
    if (page.profile) items.push(row('menu-export', 'Export this profile', act('exportProfile'), { icon: 'download' }));
    items.push(
      row('menu-outline', 'Save page outline', act('outline'), {
        icon: 'download',
        sub: 'The structure only, for making a profile',
      }),
      row(
        'menu-site-back',
        'Back to the menu',
        () => {
          ui.menuPage = 'main';
          render();
        },
        { icon: 'back', cls: 'quiet' },
      ),
    );
    return items;
  }
  const items: Node[] = [heading('Menu')];
  if (page && onPage) items.push(siteBlock(page));
  if (page && onPage && !page.secure) {
    const warn = note(
      'Not secure: this page is sent over plain http, where anyone on the way can read or change it.',
      'warn',
    );
    warn.id = 'not-secure';
    items.push(warn);
  }
  items.push(addressField('menu-address'));
  // A saved sign-in for the form on this page, or a password just typed that can be kept: first, so one press does it.
  if (page && onPage) {
    page.logins
      .slice(0, 3)
      .forEach((user, i) =>
        items.push(
          row(
            `menu-fill-${i}`,
            user ? `Sign in as ${user}` : 'Fill in the saved password',
            () => tell({ kind: 'fillLogin', user }),
            { icon: 'lock', sub: "Fills in the form; you press the site's own button" },
          ),
        ),
      );
    if (page.keepPassword !== null)
      items.push(
        row(
          'menu-save-password',
          page.keepPassword ? `Keep the password for ${page.keepPassword}` : 'Keep the password you typed',
          act('savePassword'),
          { icon: 'lock', chevron: true },
        ),
      );
  }
  if (onPage) items.push(row('menu-home', 'Home', act('home'), { icon: 'home' }));
  else if (page) items.push(row('menu-resume', `Back to ${page.site}`, act('resume'), { icon: 'back' }));
  if (!onPage && ui.menuFor) {
    const tileFor = ui.menuFor;
    items.push(
      tileFor.kind === 'recent'
        ? row(
            'menu-remove-tile',
            `Remove ${tileFor.name} from Home`,
            () => tell({ kind: 'removeRecent', url: tileFor.url }),
            { icon: 'trash' },
          )
        : tileFor.kind === 'saved'
          ? row(
              'menu-remove-tile',
              `Take "${tileFor.name}" off Home`,
              () => tell({ kind: 'removeSaved', url: tileFor.url }),
              { icon: 'trash' },
            )
          : row(
              'menu-remove-tile',
              `Remove the app "${tileFor.name}"`,
              () => tell({ kind: 'removeApp', id: tileFor.id }),
              { icon: 'trash' },
            ),
    );
  }
  if (page && onPage) {
    items.push(
      el('div', { cls: 'pair nav' }, [
        button('menu-back', 'Back', act('back'), !page.canGoBack, 'back'),
        button('menu-forward', 'Forward', act('forward'), !page.canGoForward, 'forward'),
        page.loading
          ? button('menu-reload', 'Stop', act('stop'), false, 'close')
          : button('menu-reload', 'Reload', act('reload'), false, 'reload'),
      ]),
      el('div', { cls: 'pair' }, [
        button('menu-zoom-out', 'Smaller', act('zoomOut')),
        button('menu-zoom-reset', `${page.zoomPercent}%`, act('zoomReset')),
        button('menu-zoom-in', 'Bigger', act('zoomIn')),
      ]),
      row('menu-pointer', 'Pointer mode', act('pointer'), { icon: 'pointer', on: page.pointer }),
    );
    if (page.adBlocking)
      items.push(
        row('menu-adblock', 'Ad blocking', act('adBlocking'), {
          icon: 'block',
          on: page.adBlocking.on,
          sub: page.adBlocking.note,
          disabled: page.adBlocking.locked,
        }),
      );
    // On the first page: making an app of a site is one of the main things the menu is for (DECISIONS.md, 2026-11-19).
    items.push(
      page.app
        ? row('menu-remove-app', `Remove the app "${page.app.name}"`, act('removeApp'), { icon: 'trash' })
        : row('menu-add-app', 'Add this site as an app', act('addApp'), {
            icon: 'apps',
            chevron: true,
            sub: 'A tile on Home that opens it directly',
          }),
      row(
        'menu-site',
        'This page',
        () => {
          ui.menuPage = 'site';
          render();
        },
        { icon: 'globe', chevron: true, sub: 'Keep, find, reader view, profile' },
      ),
    );
  }
  items.push(
    el('div', { cls: 'pair' }, [
      button('menu-tabs', s.tabs.length > 1 ? `Tabs (${s.tabs.length})` : 'Tabs', act('tabs'), false, 'tabs'),
      button('menu-history', 'History', act('history'), false, 'history'),
    ]),
  );
  items.push(row('menu-voice', 'Speak', act('voice'), { icon: 'mic', sub: 'Say an address or what to search for' }));
  items.push(
    row('menu-phone', 'Type from a phone', act('phone'), {
      icon: 'remote',
      chevron: true,
      ...(s.phoneOn ? { value: 'On' } : {}),
    }),
  );
  if (s.downloads.length > 0) {
    const going = s.downloads.filter((d) => d.state === 'going').length;
    items.push(
      row('menu-downloads', 'Downloads', act('downloads'), {
        icon: 'download',
        chevron: true,
        ...(going ? { value: `${going} under way` } : {}),
        say: going ? `Downloads (${going} under way)` : 'Downloads',
      }),
    );
  }
  if (s.lock?.homeOnly)
    items.push(
      row(
        'menu-lock',
        s.lock.unlocked ? 'Lock again: only the sites on Home' : 'Unlock every site (PIN)',
        act('lock'),
        { icon: s.lock.unlocked ? 'lock' : 'unlock' },
      ),
    );
  items.push(
    row('menu-settings', 'Settings', act('settings'), { icon: 'settings', chevron: true }),
    el('div', { cls: 'pair' }, [
      button('menu-about', 'About and help', act('about'), false, 'info'),
      button('menu-quit', `Quit ${PRODUCT.name}`, act('quit'), false, 'power'),
    ]),
  );
  return items;
}
