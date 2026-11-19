// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fillLogin, findLogin, readLogin, watchLogins } from '../src/layer/logins';

const page = (html: string): Document => {
  document.body.innerHTML = html;
  return document;
};

describe('finding a sign-in form', () => {
  it('finds the password field and the name before it', () => {
    const doc = page('<form><input type="search" id="q"><input type="email" id="who"><input type="password" id="pw"><input type="text" id="after"></form>');
    const found = findLogin(doc);
    expect([found?.user?.id, found?.pass.id]).toEqual(['who', 'pw']);
  });
  it('prefers the field that says it is the user name', () => {
    const doc = page('<form><input type="text" name="username" id="u"><input type="text" id="code"><input type="password" id="pw"></form>');
    expect(findLogin(doc)?.user?.id).toBe('u');
  });
  it('works with no form element, as many sites are built', () => {
    const doc = page('<div><input id="who"><input type="password" id="pw"></div>');
    expect(findLogin(doc)?.user?.id).toBe('who');
  });
  it('leaves alone a page that is making or changing a password, and one with none', () => {
    expect(findLogin(page('<form><input type="password"><input type="password"></form>'))).toBeNull();
    expect(findLogin(page('<form><input type="text"></form>'))).toBeNull();
  });
  it('does not count fields that are hidden or cannot be typed in', () => {
    const doc = page('<form><input id="who"><input type="password" id="trap" hidden><input type="password" id="off" disabled><input type="password" id="pw"></form>');
    expect(findLogin(doc)?.pass.id).toBe('pw');
  });
});

describe('reading and filling', () => {
  it('reads what was typed, and nothing when no password is in', () => {
    const doc = page('<form><input id="who" value=" me@a.example "><input type="password" id="pw"></form>');
    expect(readLogin(doc)).toBeNull();
    (doc.getElementById('pw') as HTMLInputElement).value = 'secret words';
    expect(readLogin(doc)).toEqual({ user: 'me@a.example', password: 'secret words' });
  });
  it('fills the form the way typing does, and sends nothing', () => {
    const doc = page('<form><input id="who"><input type="password" id="pw"></form>');
    const heard: string[] = [];
    let submitted = false;
    doc.addEventListener('input', (e) => heard.push((e.target as HTMLElement).id));
    doc.querySelector('form')!.addEventListener('submit', () => (submitted = true));
    expect(fillLogin(doc, 'me', 'pw words')).toBe(true);
    expect([(doc.getElementById('who') as HTMLInputElement).value, (doc.getElementById('pw') as HTMLInputElement).value]).toEqual(['me', 'pw words']);
    expect(heard).toEqual(['who', 'pw']);
    expect(submitted).toBe(false);
    expect(fillLogin(page('<p>nothing</p>'), 'me', 'x')).toBe(false);
  });
});

describe('watching a page', () => {
  it('says once that there is a form, and what was typed when it is sent', () => {
    const doc = page('<form onsubmit="return false"><input id="who" value="me"><input type="password" id="pw"><button id="go" type="button">Sign in</button></form>');
    let seen = 0;
    const sent: Array<{ user: string; password: string }> = [];
    watchLogins(doc, { seen: () => (seen += 1), sent: (l) => sent.push(l) });
    expect(seen).toBe(1);
    doc.getElementById('go')!.click();
    expect(sent).toEqual([]);
    (doc.getElementById('pw') as HTMLInputElement).value = 'one';
    doc.getElementById('go')!.click();
    doc.getElementById('go')!.click();
    expect(sent).toEqual([{ user: 'me', password: 'one' }]);
    doc.getElementById('who')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(seen).toBe(1);
  });
});
