import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_ATTRIBUTE } from '../src/createController/domStamping/constants.js';
import { HighlightOverlay } from '../src/utils/HighlightOverlay.js';

// jsdom does not compute a layout. Give the element a size and a position
// in the viewport, thus the overlay is shown.
function giveLayout(el: HTMLElement) {
  Object.defineProperty(el, 'offsetWidth', { value: 100 });
  Object.defineProperty(el, 'offsetHeight', { value: 20 });
  el.getBoundingClientRect = () =>
    ({ top: 10, left: 10, width: 100, height: 20, bottom: 30, right: 110 }) as DOMRect;
}

function overlayElements() {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${OVERLAY_ATTRIBUTE}]`));
}

beforeEach(() => {
  // jsdom gives an empty string for a z-index that is not set. A browser gives `auto`.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el) =>
      ({
        zIndex: (el as HTMLElement).style.zIndex || 'auto',
        display: 'block',
        visibility: 'visible',
        opacity: '1'
      }) as CSSStyleDeclaration
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('HighlightOverlay z-index', () => {
  it('uses the z-index of the outermost ancestor that has one', () => {
    document.body.innerHTML = `
      <div style="z-index: 5">
        <div>
          <div style="z-index: 9"><span id="target" style="z-index: 2">Text</span></div>
        </div>
      </div>
    `;
    const target = document.getElementById('target') as HTMLElement;
    giveLayout(target);

    const overlay = new HighlightOverlay(target);
    overlay.show();

    expect(overlayElements()[0].style.zIndex).toBe('5');
    overlay.dispose();
  });

  it('uses the z-index of the element when no ancestor has one', () => {
    document.body.innerHTML = `<div><span id="target" style="z-index: 7">Text</span></div>`;
    const target = document.getElementById('target') as HTMLElement;
    giveLayout(target);

    const overlay = new HighlightOverlay(target);
    overlay.show();

    expect(overlayElements()[0].style.zIndex).toBe('7');
    overlay.dispose();
  });

  it('uses 0 when no element in the chain has a z-index', () => {
    document.body.innerHTML = `<div><span id="target">Text</span></div>`;
    const target = document.getElementById('target') as HTMLElement;
    giveLayout(target);

    const overlay = new HighlightOverlay(target);
    overlay.show();

    expect(overlayElements()[0].style.zIndex).toBe('0');
    overlay.dispose();
  });

  it('gives each overlay its own z-index when many overlays are shown together', () => {
    document.body.innerHTML = `
      <div style="z-index: 3"><span id="a">A</span></div>
      <div style="z-index: 8"><span id="b">B</span></div>
    `;
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    giveLayout(a);
    giveLayout(b);

    const overlays = [new HighlightOverlay(a), new HighlightOverlay(b)];
    HighlightOverlay.showAll(overlays);

    expect(overlayElements().map((el) => el.style.zIndex)).toEqual(['3', '8']);
    for (const overlay of overlays) {
      overlay.dispose();
    }
  });
});
