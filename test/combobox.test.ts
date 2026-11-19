// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { activeOption, openCombo } from '../src/layer/combobox';

const page = (html: string): void => {
  document.body.innerHTML = html;
};

describe('a text field with a list of suggestions', () => {
  it('is known when it has the cursor, says it is a combobox, and its list is open', () => {
    page('<input id="q" role="combobox" aria-expanded="true" aria-controls="list"><div id="list" role="listbox"></div>');
    expect(openCombo(document)).toBeNull();
    document.getElementById('q')!.focus();
    expect(openCombo(document)?.id).toBe('q');
  });

  it('is not one while its list is closed, or when it is not a text field', () => {
    page('<input id="q" role="combobox" aria-expanded="false"><button id="b" role="combobox" aria-expanded="true">Pick</button>');
    document.getElementById('q')!.focus();
    expect(openCombo(document)).toBeNull();
    document.getElementById('b')!.focus();
    expect(openCombo(document)).toBeNull();
  });

  it('finds the current suggestion by aria-activedescendant', () => {
    page('<input id="q" role="combobox" aria-expanded="true" aria-controls="list" aria-activedescendant="o2"><div id="list" role="listbox"><div id="o1" role="option"></div><div id="o2" role="option"></div></div>');
    expect(activeOption(document.getElementById('q')!)?.id).toBe('o2');
  });

  it('or by the option marked selected in the list it controls', () => {
    page('<input id="q" role="combobox" aria-expanded="true" aria-controls="list"><div id="list" role="listbox"><div id="o1" role="option"></div><div id="o2" role="option" aria-selected="true"></div></div><div role="option" aria-selected="true" id="elsewhere"></div>');
    expect(activeOption(document.getElementById('q')!)?.id).toBe('o2');
  });

  it('and says there is none when nothing is marked', () => {
    page('<input id="q" role="combobox" aria-expanded="true" aria-controls="list"><div id="list" role="listbox"><div id="o1" role="option" aria-selected="false"></div></div>');
    expect(activeOption(document.getElementById('q')!)).toBeNull();
  });
});
