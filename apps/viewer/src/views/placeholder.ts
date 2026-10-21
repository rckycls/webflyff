// Stands in for a route whose view is not written yet: a line of text on the dark canvas.

import type { RouteName, ViewFactory } from '../router';

const TITLES: Record<RouteName, string> = {
  character: 'Character view',
  world: 'World view',
  compare: 'Compare view',
};

export function placeholderView(name: RouteName): ViewFactory {
  return (ctx) => {
    const note = document.createElement('div');
    note.className = 'placeholder';
    note.textContent = `${TITLES[name]}: not available yet`;
    ctx.container.append(note);

    return {
      ready: Promise.resolve(),
      frame() {
        ctx.renderer.clear();
      },
      dispose() {
        note.remove();
      },
    };
  };
}
