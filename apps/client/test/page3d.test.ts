import { describe, expect, it, vi } from 'vitest';
import { releaseOnPageHide } from '../src/world/page3d';

/** A `pagehide` (a `PageTransitionEvent`, which Node has not): `persisted` when the page goes to the back/forward cache. */
const pageHide = (persisted: boolean): Event => Object.assign(new Event('pagehide'), { persisted });

describe('releaseOnPageHide', () => {
  it('lets the WebGL context go when the page is thrown away (a pagehide not persisted), once', () => {
    const view = new EventTarget();
    const release = vi.fn();
    releaseOnPageHide(view, release);

    view.dispatchEvent(pageHide(false));
    view.dispatchEvent(pageHide(false));

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases nothing for a page kept in the back/forward cache (persisted), which may be shown again', () => {
    const view = new EventTarget();
    const release = vi.fn();
    releaseOnPageHide(view, release);

    view.dispatchEvent(pageHide(true));

    expect(release).not.toHaveBeenCalled();
  });
});
