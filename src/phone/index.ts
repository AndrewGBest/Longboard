// The page a phone shows to type on the TV (shared/phone.ts has the page
// itself and says how what is sent is sealed). This is its script, served
// by Longboard from this machine. It runs in the phone's own browser and has
// nothing to do with Longboard's own screens.
import { sealPhoneMessage, type PhoneKey, type PhoneMessage } from '../shared/phone';

const key = location.hash.slice(1);
const state = document.getElementById('state') as HTMLElement;
const field = document.getElementById('text') as HTMLTextAreaElement;
// A number that only goes up, across reloads too.
let n = Date.now() * 1000;

const say = (text: string, bad = false): void => {
  state.textContent = text;
  state.className = bad ? 'bad' : '';
};

async function send(message: PhoneMessage): Promise<boolean> {
  const sealed = sealPhoneMessage(key, ++n, message);
  if (!sealed) {
    say('This address has no key. Scan the code on the TV again.', true);
    return false;
  }
  try {
    const answer = await fetch('/send', {
      method: 'POST',
      body: sealed,
      headers: { 'content-type': 'text/plain' },
      cache: 'no-store',
    });
    if (answer.status === 204) {
      say('Connected to the TV');
      return true;
    }
    say(
      answer.status === 403 ? 'The TV did not accept that. Scan the code on the TV again.' : 'The TV did not answer.',
      true,
    );
  } catch {
    say('Cannot reach the TV. Is typing from a phone still on, and is this phone on the same network?', true);
  }
  return false;
}

document.getElementById('send')?.addEventListener('click', () => {
  const text = field.value;
  if (!text) return;
  void send({ t: 'text', v: text.slice(0, 2000) }).then((ok) => {
    if (ok) field.value = '';
  });
});
for (const button of document.querySelectorAll<HTMLElement>('[data-key]')) {
  button.addEventListener('click', () => void send({ t: 'key', v: button.dataset['key'] as PhoneKey }));
}
void send({ t: 'hello' });
