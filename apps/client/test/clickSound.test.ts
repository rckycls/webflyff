// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { installClickSound } from '../src/audio/clickSound';

describe('installClickSound (CWndButton::OnLButtonDown, WndControl.cpp:692-694)', () => {
  function setup() {
    const root = document.createElement('div');
    root.innerHTML = '<button id="b"><span id="inner">OK</span></button><button id="s" data-silent></button><div id="d"></div>';
    document.body.append(root);
    const played: number[] = [];
    const remove = installClickSound(root, (id) => played.push(id));
    const press = (id: string) => root.querySelector(`#${id}`)!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    return { root, played, remove, press };
  }

  it('plays SND_INF_CLICK on a press of a button, or of what is inside one', () => {
    const { played, press, root } = setup();
    press('b');
    press('inner');
    expect(played).toEqual([1, 1]);
    root.remove();
  });

  it('stays silent for a data-silent button and anything that is not a button', () => {
    const { played, press, root } = setup();
    press('s');
    press('d');
    expect(played).toEqual([]);
    root.remove();
  });

  it('removes its listener', () => {
    const { played, press, remove, root } = setup();
    remove();
    press('b');
    expect(played).toEqual([]);
    root.remove();
  });
});
