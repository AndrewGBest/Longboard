import { describe, expect, it } from 'vitest';
import { addApp, appFor, appPartition, launcherEntry, launcherFileName, MAX_APPS, newAppId, parseApps, removeApp, type WebApp } from '../src/shared/apps';

const app = (extra: Partial<WebApp> = {}): WebApp => ({ id: 'example-com', url: 'https://example.com/', name: 'Example', ownSession: false, launcher: false, ...extra });

describe('web apps', () => {
  it('makes an id from the site that is unlike the others', () => {
    expect(newAppId('https://www.example.com/watch', [])).toBe('example-com');
    expect(newAppId('https://example.com/', ['example-com'])).toBe('example-com-2');
    expect(newAppId('https://example.com/', ['example-com', 'example-com-2'])).toBe('example-com-3');
    expect(newAppId('http://127.0.0.1:8080/', [])).toBe('127-0-0-1');
  });

  it('adds an app, with a tidy name', () => {
    const added = addApp([], { url: 'https://example.com/tv', name: '  My\nExample   Site ', ownSession: true, launcher: true });
    expect(added?.app).toEqual({ id: 'example-com', url: 'https://example.com/tv', name: 'My Example Site', ownSession: true, launcher: true });
    expect(addApp([], { url: 'https://example.com/', name: '', ownSession: false, launcher: false })?.app.name).toBe('example.com');
  });

  it('refuses what is not a web address, and stops at the limit', () => {
    expect(addApp([], { url: 'file:///etc/passwd', name: 'x', ownSession: false, launcher: false })).toBeNull();
    const full = Array.from({ length: MAX_APPS }, (_, i) => app({ id: `a${i}`, url: `https://s${i}.example/` }));
    expect(addApp(full, { url: 'https://new.example/', name: 'x', ownSession: false, launcher: false })).toBeNull();
  });

  it('finds the app a page belongs to by its site, and removes by id', () => {
    const list = [app(), app({ id: 'other', url: 'https://other.test/' })];
    expect(appFor(list, 'https://www.example.com/deep/page')?.id).toBe('example-com');
    expect(appFor(list, 'https://unknown.test/')).toBeNull();
    expect(removeApp(list, 'example-com').map((a) => a.id)).toEqual(['other']);
  });

  it("gives an app its own session only when asked, and a different one for each app", () => {
    expect(appPartition(app())).toBe('');
    expect(appPartition(app({ ownSession: true }))).toBe('persist:app-example-com');
    expect(appPartition(app({ id: 'other', ownSession: true }))).not.toBe(appPartition(app({ ownSession: true })));
  });

  it('reads a saved file and drops what it cannot use', () => {
    expect(
      parseApps({
        apps: [
          app(),
          app(),
          { id: 'Bad Id', url: 'https://x.test/' },
          { id: 'script', url: 'javascript:alert(1)' },
          { id: 'named', url: 'https://named.test/', name: 7, ownSession: 'yes' },
          'text',
        ],
      }),
    ).toEqual([app(), { id: 'named', url: 'https://named.test/', name: 'named.test', ownSession: false, launcher: false }]);
    expect(parseApps(null)).toEqual([]);
  });
});

describe('the entry in the app list', () => {
  it('is a desktop entry that starts this copy of Longboard with the app', () => {
    const text = launcherEntry(app({ name: 'Example TV' }), ['/opt/Longboard/longboard'], '/home/me/.config/Longboard/icons/example-com.png');
    expect(text.split('\n')).toEqual([
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=Example TV',
      'Comment=Opens example.com in Longboard',
      'Exec=/opt/Longboard/longboard --app=example-com',
      'Icon=/home/me/.config/Longboard/icons/example-com.png',
      'Categories=Network;',
      'Terminal=false',
      '',
    ]);
    expect(launcherFileName('example-com')).toBe('io.github.andrewgbest.Longboard.app-example-com.desktop');
  });

  it('quotes the command so that nothing in a path or a name can become a second command', () => {
    const text = launcherEntry(app({ name: 'Evil\nExec=rm -rf ~' }), ['/home/a b/Long board', '/srv/$HOME/`x`/100%'], 'icon');
    const lines = text.split('\n');
    expect(lines.filter((l) => l.startsWith('Exec='))).toEqual(['Exec="/home/a b/Long board" "/srv/\\$HOME/\\`x\\`/100%%" --app=example-com']);
    expect(lines.filter((l) => l.startsWith('Name='))).toEqual(['Name=Evil Exec=rm -rf ~']);
  });
});
