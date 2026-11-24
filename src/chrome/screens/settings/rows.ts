// What the pages of Settings are built from: rows that change a setting, lead
// to another page, or ask twice before clearing something. Every change is
// sent to the shell; nothing is decided here.
import { type ChromeState, type SettingsAction } from '../../../shared/chrome';
import { row, type IconName } from '../../parts';
import { render } from '../render';
import { tell, ui, type SettingsPage } from '../ui';

/** What the shell says about the settings, once it has sent them. */
export type Settings = NonNullable<ChromeState['settings']>;

/** A press that asks the shell to change one setting. Null puts it back to the usual. */
export const set = (name: string, value: unknown) => (): void => tell({ kind: 'setting', name, value });

/** A press that leads to another page of Settings. */
export const go = (page: SettingsPage) => (): void => {
  ui.settingsPage = page;
  ui.confirming = null;
  render();
};

/** A press that opens one of the lists to choose one thing from. */
export const pick = (what: NonNullable<typeof ui.choosing>) => (): void => {
  ui.choosing = what;
  ui.confirming = null;
  render();
};

/** The way back, at the foot of a page. */
export const backTo = (text: string, page: SettingsPage): HTMLButtonElement =>
  row('settings-back', text, go(page), { icon: 'back', cls: 'quiet' });
export const back = (): HTMLButtonElement => backTo('Back to Settings', 'main');

/** A switch. Its accessible name answers the label with yes or no, where a plain row's would say on or off. */
export const flip = (id: string, label: string, on: boolean, press: () => void, sub?: string): HTMLButtonElement =>
  row(id, label, press, { on, ...(sub ? { sub } : {}), say: `${label}: ${on ? 'yes' : 'no'}` });

/** A row that clears or removes something: the first press asks, the second does it. */
export const sure = (
  id: string,
  text: string,
  again: string,
  press: () => void,
  pic: IconName = 'trash',
): HTMLButtonElement =>
  row(
    id,
    ui.confirming === id ? again : text,
    () => {
      if (ui.confirming === id) {
        ui.confirming = null;
        press();
      } else {
        ui.confirming = id;
        render();
      }
    },
    { icon: ui.confirming === id ? 'warn' : pic, cls: 'danger' },
  );

/** A row that asks twice, then has the shell do one of its named actions. */
export const twice = (id: string, text: string, again: string, action: SettingsAction): HTMLButtonElement =>
  sure(id, text, again, () => tell({ kind: 'settingsAction', action }));

/** A row that has the shell do one of its named actions at the first press. */
export const once = (id: string, text: string, action: SettingsAction, pic?: IconName): HTMLButtonElement =>
  row(id, text, () => tell({ kind: 'settingsAction', action }), pic ? { icon: pic } : {});
