import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_ATTRIBUTE } from '../src/createController/domStamping/constants.js';
import { HighlightOverlay } from '../src/utils/HighlightOverlay.js';

// jsdom does not compute a layout. Give the element a size and a position
// in the viewport, thus the overlay is shown.
function giveLayout(el: HTMLElement, width = 100, height = 20, top = 100) {
  el.getBoundingClientRect = () =>
    ({
      x: 100,
      y: top,
      top,
      left: 100,
      width,
      height,
      right: 100 + width,
      bottom: top + height,
      toJSON: () => ({})
    }) as DOMRect;
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
}

function createTarget(width: number, height: number, top = 100): HTMLElement {
  const el = document.createElement('div');
  giveLayout(el, width, height, top);
  document.body.appendChild(el);
  return el;
}

function overlayElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${OVERLAY_ATTRIBUTE}]`));
}

function label(): HTMLElement {
  const element = overlayElements()[0]?.firstElementChild as HTMLElement | null;
  if (!element) {
    throw new Error('overlay label not found');
  }
  return element;
}

describe('HighlightOverlay', () => {
  const overlays: HighlightOverlay[] = [];

  function createOverlay(target: HTMLElement, showLabel = false): HighlightOverlay {
    const overlay = new HighlightOverlay(target, { showLabel });
    overlays.push(overlay);
    return overlay;
  }

  afterEach(() => {
    for (const overlay of overlays.splice(0)) {
      overlay.dispose();
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('label', () => {
    // jsdom does not compute a layout. Give the text of the targets a box:
    // it starts at the left of the target and has the given width.
    function giveTextWidth(textWidth: () => number) {
      vi.spyOn(document, 'createRange').mockImplementation(() => {
        let node: Node | null = null;
        return {
          selectNodeContents(selected: Node) {
            node = selected;
          },
          getClientRects() {
            const rect = (node?.parentElement as HTMLElement).getBoundingClientRect();
            return [{ ...rect, right: rect.left + textWidth() }];
          }
        } as unknown as Range;
      });
    }

    function createTextTarget(width: number, height: number): HTMLElement {
      const target = createTarget(width, height);
      target.textContent = 'Some text';
      return target;
    }

    it('is in the top-right corner of the box and ignores the pointer', () => {
      giveTextWidth(() => 80);
      createOverlay(createTextTarget(400, 40), true).show();

      expect(label().textContent).toBe('Open in DatoCMS ↗');
      expect(label().style.display).not.toBe('none');
      expect(label().style.top).toBe('0px');
      expect(label().style.right).toBe('0px');
      expect(overlayElements()[0].style.pointerEvents).toBe('none');
      expect(label().style.pointerEvents).toBe('');
    });

    it('is hidden when it covers the text of the target', () => {
      giveTextWidth(() => 390);
      createOverlay(createTextTarget(400, 40), true).show();

      expect(label().style.display).toBe('none');
    });

    it('is hidden when it is too near to the text of the target', () => {
      // The label uses the last 150px of the box: it starts 256px after the
      // start of the target. The text stops 4px before the label.
      giveTextWidth(() => 252);
      createOverlay(createTextTarget(400, 40), true).show();

      expect(label().style.display).toBe('none');
    });

    it('is hidden when it uses more than half of the width of the box', () => {
      // The text is not below the label, but the box is only 216px wide.
      giveTextWidth(() => 10);
      createOverlay(createTextTarget(200, 60), true).show();

      expect(label().style.display).toBe('none');
    });

    it('is shown on a wide target that has no text', () => {
      createOverlay(createTarget(400, 200), true).show();

      expect(label().style.display).not.toBe('none');
    });

    it('changes when the target is resized', () => {
      giveTextWidth(() => 50);
      const target = createTextTarget(60, 20);
      const overlay = createOverlay(target, true);
      overlay.show();
      expect(label().style.display).toBe('none');

      giveLayout(target, 400, 20);
      overlay.show();
      expect(label().style.display).toBe('block');

      giveLayout(target, 60, 20);
      overlay.show();
      expect(label().style.display).toBe('none');
    });
  });

  describe('z-index', () => {
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

    function targetById(id: string): HTMLElement {
      const target = document.getElementById(id) as HTMLElement;
      giveLayout(target);
      return target;
    }

    it('uses the z-index of the outermost ancestor that has one', () => {
      document.body.innerHTML = `
        <div style="z-index: 5">
          <div>
            <div style="z-index: 9"><span id="target" style="z-index: 2">Text</span></div>
          </div>
        </div>
      `;

      createOverlay(targetById('target')).show();

      expect(overlayElements()[0].style.zIndex).toBe('5');
    });

    it('uses the z-index of the element when no ancestor has one', () => {
      document.body.innerHTML = `<div><span id="target" style="z-index: 7">Text</span></div>`;

      createOverlay(targetById('target')).show();

      expect(overlayElements()[0].style.zIndex).toBe('7');
    });

    it('uses 0 when no element in the chain has a z-index', () => {
      document.body.innerHTML = `<div><span id="target">Text</span></div>`;

      createOverlay(targetById('target')).show();

      expect(overlayElements()[0].style.zIndex).toBe('0');
    });

    it('gives each overlay its own z-index when many overlays are shown together', () => {
      document.body.innerHTML = `
        <div style="z-index: 3"><span id="a">A</span></div>
        <div style="z-index: 8"><span id="b">B</span></div>
      `;

      HighlightOverlay.showAll([createOverlay(targetById('a')), createOverlay(targetById('b'))]);

      expect(overlayElements().map((el) => el.style.zIndex)).toEqual(['3', '8']);
    });
  });
});
