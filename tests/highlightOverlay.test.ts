import { afterEach, describe, expect, it } from 'vitest';
import { HighlightOverlay } from '../src/utils/HighlightOverlay.js';

function createTarget(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      x: 100,
      y: 100,
      top: 100,
      left: 100,
      width,
      height,
      right: 100 + width,
      bottom: 100 + height,
      toJSON: () => ({})
    }) as DOMRect;
  // jsdom has no layout: make the element count as visible
  Object.defineProperty(el, 'offsetWidth', { value: width });
  Object.defineProperty(el, 'offsetHeight', { value: height });
  document.body.appendChild(el);
  return el;
}

function label(): HTMLElement {
  const overlayElement = document.body.querySelector<HTMLElement>(
    ':scope > div[aria-hidden="true"]'
  );
  const element = overlayElement?.firstElementChild as HTMLElement | null;
  if (!element) {
    throw new Error('overlay label not found');
  }
  return element;
}

describe('HighlightOverlay label', () => {
  const overlays: HighlightOverlay[] = [];

  afterEach(() => {
    for (const overlay of overlays.splice(0)) {
      overlay.dispose();
    }
    document.body.innerHTML = '';
  });

  it('sits inside the box, in the top-right corner', () => {
    const overlay = new HighlightOverlay(createTarget(300, 40), { showLabel: true });
    overlays.push(overlay);
    overlay.show();

    expect(label().textContent).toBe('Open in DatoCMS ↗');
    expect(label().style.top).toBe('0px');
    expect(label().style.right).toBe('0px');
    expect(label().style.bottom).toBe('auto');
    expect(label().style.transform).toBe('none');
  });

  it('stays centered above narrow targets, where it would cover them', () => {
    const overlay = new HighlightOverlay(createTarget(60, 20), { showLabel: true });
    overlays.push(overlay);
    overlay.show();

    expect(label().style.top).toBe('auto');
    expect(label().style.bottom).toBe('calc(100% + 10px)');
    expect(label().style.left).toBe('50%');
    expect(label().style.transform).toBe('translateX(-50%)');
  });

  it('switches between the two when the target is resized', () => {
    let width = 60;
    const target = createTarget(width, 20);
    const measureRect = target.getBoundingClientRect;
    target.getBoundingClientRect = () => ({ ...measureRect(), width }) as DOMRect;
    const overlay = new HighlightOverlay(target, { showLabel: true });
    overlays.push(overlay);
    overlay.show();

    width = 300;
    overlay.show();

    expect(label().style.top).toBe('0px');
    expect(label().style.bottom).toBe('auto');
    expect(label().style.left).toBe('auto');
  });
});
