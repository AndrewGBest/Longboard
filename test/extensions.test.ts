import { describe, expect, it } from 'vitest';
import { extensionFacts, extensionName, extensionOfPage, isExtensionId, storeExtensionId } from '../src/shared/extensions';
import { blockReason } from '../src/main/navigation';

const id = 'abcdefghijklmnopabcdefghijklmnop';

describe('which extension a store page is about', () => {
  it('is read from the address of its page in the store', () => {
    expect(storeExtensionId(`https://chromewebstore.google.com/detail/some-name/${id}`)).toBe(id);
    expect(storeExtensionId(`https://chromewebstore.google.com/detail/${id}?hl=en`)).toBe(id);
    expect(storeExtensionId(`https://chrome.google.com/webstore/detail/some-name/${id}`)).toBe(id);
  });
  it('is nothing for any other page, look-alikes included', () => {
    for (const url of [`https://chromewebstore.google.com/category/extensions`, `https://evil.test/detail/x/${id}`, `http://chromewebstore.google.com/detail/x/${id}`, `https://chromewebstore.google.com.evil.test/detail/x/${id}`, `https://chromewebstore.google.com/detail/x/${id.toUpperCase()}`, 'nonsense']) {
      expect(storeExtensionId(url)).toBeNull();
    }
  });
  it('knows an extension id and an extension\'s own page', () => {
    expect(isExtensionId(id)).toBe(true);
    for (const bad of ['abc', `${id}a`, id.replace('a', 'z'), 5, null]) expect(isExtensionId(bad)).toBe(false);
    expect(extensionOfPage(`chrome-extension://${id}/popup.html`)).toBe(id);
    expect(extensionOfPage(`https://${id}/popup.html`)).toBeNull();
  });
});

describe('what an extension is said to be able to do', () => {
  it('says so when it can read every page', () => {
    for (const m of [{ host_permissions: ['<all_urls>'] }, { content_scripts: [{ matches: ['*://*/*'] }] }, { permissions: ['https://*/*'] }]) {
      expect(extensionFacts(m).can[0]).toBe('Read and change every page you open');
    }
  });
  it('names the sites when it is limited to some', () => {
    expect(extensionFacts({ host_permissions: ['https://*.video.example/*', 'https://news.example/*'] }).can).toEqual(['Read and change pages on video.example, news.example']);
  });
  it('lists the other things, and says when there is nothing', () => {
    expect(extensionFacts({ permissions: ['declarativeNetRequest', 'cookies', 'tabs', 'storage'] }).can).toEqual(['See or block what pages ask the network for', 'Read and change what sites have stored about you', 'See which pages you open']);
    expect(extensionFacts({ permissions: ['storage', 'alarms'] }).can).toEqual(['Nothing on the pages you open']);
  });
  it('says when an extension is built on something this browser does not act on', () => {
    expect(extensionFacts({ permissions: ['storage'] }).cannot).toEqual([]);
    expect(extensionFacts({ permissions: ['declarativeNetRequest'] }).cannot[0]).toContain('block nothing');
    expect(extensionFacts({ declarative_net_request: { rule_resources: [] } }).cannot).toHaveLength(1);
    expect(extensionFacts(null).cannot).toEqual([]);
  });
  it('finds its pages, and only inside its own folder', () => {
    expect(extensionFacts({ action: { default_popup: 'popup.html' }, options_ui: { page: '/options/index.html' } })).toMatchObject({ popup: 'popup.html', options: 'options/index.html' });
    expect(extensionFacts({ browser_action: { default_popup: 'p.html' }, options_page: 'o.html' })).toMatchObject({ popup: 'p.html', options: 'o.html' });
    expect(extensionFacts({ action: { default_popup: 'https://evil.test/x' }, options_page: '../../etc/passwd' })).toMatchObject({ popup: null, options: null });
  });
  it('never throws on nonsense', () => {
    for (const bad of [null, 5, 'x', [], { permissions: 'all', content_scripts: [null, 5] }]) expect(extensionFacts(bad).can.length).toBe(1);
    expect(extensionName({ name: '  Dark   mode ' })).toBe('Dark mode');
    expect(extensionName({ name: '__MSG_extName__', short_name: 'Dark' })).toBe('Dark');
    expect(extensionName({ name: '__MSG_extName__' })).toBe('');
  });
});

describe('an extension\'s own pages', () => {
  it('open when the extension is installed, and not otherwise', () => {
    expect(blockReason(`chrome-extension://${id}/options.html`, { automation: false, extensions: [id] })).toBeNull();
    expect(blockReason(`chrome-extension://${id}/options.html`, { automation: false, extensions: [] })).toBe('not-web');
    expect(blockReason(`chrome-extension://${id}/options.html`, { automation: false })).toBe('not-web');
  });
  it('are not held back by the parental lock or by "only https"', () => {
    expect(blockReason(`chrome-extension://${id}/options.html`, { automation: false, extensions: [id], httpsOnly: true, onlySites: [] })).toBeNull();
  });
});
