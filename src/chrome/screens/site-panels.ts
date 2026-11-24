// Panels about one site: adding it as an app, and the profile editor's controls.
import { PRODUCT } from '../../shared/product';
import { type ChromeState, type EditAction } from '../../shared/chrome';
import { button, el, heading, note, row } from '../parts';
import { render } from './render';
import { tell, ui } from './ui';

/** "Add as an app": a name, two choices, and Add. The choices are kept here until Add is pressed. */
export function addAppPanel(s: ChromeState): Node[] {
  const name = el('input', { id: 'app-name' });
  name.type = 'text';
  name.value = ui.draft.name;
  name.setAttribute('aria-label', 'Name');
  name.setAttribute('enterkeyhint', 'done');
  name.addEventListener('input', () => (ui.draft.name = name.value));
  const flip = (change: () => void) => (): void => {
    change();
    render();
  };
  const items: Node[] = [
    heading('Add as an app', 'apps'),
    note(`${s.page?.site ?? 'This site'} will get a tile on Home that opens it directly.`),
    name,
    row(
      'app-session',
      'Its own sign-ins',
      flip(() => (ui.draft.ownSession = !ui.draft.ownSession)),
      {
        on: ui.draft.ownSession,
        sub: ui.draft.ownSession ? 'Kept apart from the rest' : `Shared with the rest of ${PRODUCT.name}`,
        say: ui.draft.ownSession
          ? 'Sign-ins: its own, apart from the rest'
          : `Sign-ins: shared with the rest of ${PRODUCT.name}`,
      },
    ),
  ];
  if (s.page?.canAddToAppList) {
    items.push(
      row(
        'app-launcher',
        "Also in the TV's app list",
        flip(() => (ui.draft.launcher = !ui.draft.launcher)),
        {
          on: ui.draft.launcher,
          say: ui.draft.launcher ? "Also in the TV's app list: yes" : "Also in the TV's app list: no",
        },
      ),
    );
  }
  items.push(
    row(
      'app-add',
      'Add',
      () =>
        tell({
          kind: 'addApp',
          name: ui.draft.name,
          ownSession: ui.draft.ownSession,
          launcher: ui.draft.launcher && s.page?.canAddToAppList === true,
        }),
      { icon: 'plus' },
    ),
    row('app-cancel', 'Cancel', () => tell({ kind: 'menu', action: 'close' }), { cls: 'quiet' }),
  );
  return items;
}

/** The profile editor: what was pointed at, what it can be marked as, and Save. */
export function editPanel(s: ChromeState): Node[] {
  const edit = s.edit;
  const press = (action: EditAction) => (): void => tell({ kind: 'edit', action });
  const items: Node[] = [heading('Profile editor', 'layers')];
  if (!edit) return items;
  const picked = edit.picked;
  if (!picked) {
    items.push(
      el('p', {
        cls: 'lead',
        text: `Making a profile for ${edit.site}. Move the pointer onto something and press OK to mark it.`,
      }),
    );
    items.push(row('edit-pick', 'Point at something', press('pickAgain'), { icon: 'pointer' }));
  } else {
    const mark = (id: string, label: string, on: boolean, action: EditAction): HTMLButtonElement =>
      row(id, label, press(action), { on, say: `${label}: ${on ? 'yes' : 'no'}` });
    items.push(
      note(`${picked.selector}: ${picked.matches} on this page, shown with a dashed box`),
      mark('edit-include', 'Can be selected', picked.marks.include, 'include'),
      mark('edit-exclude', 'Never select', picked.marks.exclude, 'exclude'),
      mark('edit-row', 'This is a row', picked.marks.row, 'row'),
      mark('edit-player', 'This is the player', picked.marks.player, 'player'),
      el('div', { cls: 'pair' }, [
        button('edit-narrower', 'Narrower', press('narrower'), !picked.canNarrow),
        button('edit-wider', 'Wider', press('wider'), !picked.canWiden),
      ]),
      row('edit-pick', 'Point at something else', press('pickAgain'), { icon: 'pointer' }),
    );
  }
  items.push(
    note(edit.marked === 1 ? '1 thing marked so far.' : `${edit.marked} things marked so far.`),
    row('edit-save', 'Save and finish', press('save'), { icon: 'check', disabled: edit.marked === 0 }),
    row('edit-discard', 'Finish without saving', press('discard'), { cls: 'quiet' }),
  );
  return items;
}
