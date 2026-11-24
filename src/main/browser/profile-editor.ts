// The profile editor: pointing at parts of a page to make a profile for its site.
import { siteName } from '../../shared/address';
import { type EditAction } from '../../shared/chrome';
import { marksOf, startDraft, toggleMark } from '../../shared/editor';
import type { Core } from './core';
import { isNotice } from './core';

/** What this part adds to the browser for the other parts to use. */
export interface ProfileEditorPart {
  showEdit: () => void;
  startEdit: () => void;
  /** Ends the editing. Unless it was saved, the page goes back to the rules it had. */
  endEdit: (saved: boolean) => void;
  pickForEdit: () => void;
  openEditPanel: () => void;
  editAction: (action: EditAction) => void;
}

export function createProfileEditor(core: Core): ProfileEditorPart {
  // A first, small editor (DESIGN.md 4.5): point at something, press OK, and
  // say what it is. Every choice goes into a draft profile in the ordinary
  // format, the page is driven by the draft at once, and saving writes it to
  // the person's own profiles with an outline of the page as its evidence.
  const showEdit = (): void => {
    if (core.page.isDestroyed()) return;
    core.page.send(
      'longboard:edit-show',
      core.edit
        ? {
            picked: core.panel === 'edit' ? (core.edit.chain[core.edit.level]?.selector ?? null) : null,
            marks: marksOf(core.edit.draft),
          }
        : null,
    );
  };
  const startEdit = (): void => {
    const url = core.page.getURL();
    const draft =
      core.surface === 'page' && !isNotice(url) ? startDraft(url, core.profileFor(url)?.profile ?? null) : null;
    core.panel = null;
    if (!draft) {
      core.layout();
      core.notify('A profile cannot be made for this address');
      return;
    }
    core.edit = { site: siteName(url), draft, chain: [], level: 0, saving: false };
    core.setPointer(true);
    core.layout();
    showEdit();
    core.notify('Profile editor: move the pointer onto something and press OK. Back to finish.');
  };
  /** Ends the editing. Unless it was saved, the page goes back to the rules it had. */
  const endEdit = (saved: boolean): void => {
    if (!core.edit) return;
    core.edit = null;
    if (core.panel === 'edit') core.panel = null;
    core.setPointer(false);
    if (!core.page.isDestroyed()) {
      core.page.send('longboard:edit-show', null);
      if (!saved) core.page.send('longboard:rules', core.profileFor(core.page.getURL())?.profile ?? null);
    }
    core.layout();
  };
  const pickForEdit = (): void => {
    const zoom = core.page.getZoomFactor() || 1;
    core.page.send('longboard:edit-pick', { x: core.pointer.x / zoom, y: core.pointer.y / zoom });
  };
  const openEditPanel = (): void => {
    core.stopGlide();
    core.panel = 'edit';
    showEdit();
    core.layout();
  };
  const editAction = (action: EditAction): void => {
    if (!core.edit) return;
    const step = core.edit.chain[core.edit.level];
    switch (action) {
      case 'include':
      case 'exclude':
      case 'row':
      case 'player':
        if (!step) break;
        core.edit.draft = toggleMark(core.edit.draft, action, step.selector);
        // Seen at once: the page is driven by the draft from here on.
        core.page.send('longboard:rules', core.edit.draft);
        break;
      case 'wider':
        core.edit.level = Math.min(core.edit.chain.length - 1, core.edit.level + 1);
        break;
      case 'narrower':
        core.edit.level = Math.max(0, core.edit.level - 1);
        break;
      case 'pickAgain':
        core.edit.chain = [];
        core.edit.level = 0;
        core.panel = null;
        core.setPointer(true);
        break;
      case 'save':
        // The outline comes back as a message from the layer; the saving is done there.
        core.edit.saving = true;
        core.page.send('longboard:action', 'diagnostics');
        return;
      case 'discard':
        endEdit(false);
        return;
    }
    showEdit();
    core.layout();
  };
  // A new page of the same site carries on with the draft; another site ends the editing.
  core.eachPage((wc) =>
    wc.on('dom-ready', () => {
      if (wc !== core.page || !core.edit) return;
      if (siteName(core.page.getURL()) !== core.edit.site) {
        endEdit(false);
        return;
      }
      core.page.send('longboard:rules', core.edit.draft);
      showEdit();
    }),
  );
  return { showEdit, startEdit, endEdit, pickForEdit, openEditPanel, editAction };
}
