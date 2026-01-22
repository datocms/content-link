import * as stega from '@vercel/stega';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATIC_STAMP_ATTRIBUTE } from '../src/createController/domStamping/constants.js';
import { createController } from '../src/index.js';

const { vercelStegaCombine } = stega;

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Controller lifecycle', () => {
  it('should find stega elements after dispose and recreate', () => {
    // Initial HTML with stega-encoded content
    const encodedText = vercelStegaCombine('Hero headline', {
      origin: 'datocms.com',
      href: 'hero123#fieldPath=hero.title.en'
    });

    const encodedAlt = vercelStegaCombine('Hero image alt', {
      origin: 'datocms.com',
      href: 'hero123#fieldPath=hero.image'
    });

    document.body.innerHTML = `
      <main>
        <p id="hero-text">${encodedText}</p>
        <img id="hero-image" alt="${encodedAlt}" src="hero.jpg">
      </main>
    `;

    // Create first controller
    const controller1 = createController();

    const heroText = document.getElementById('hero-text') as HTMLElement;
    const heroImage = document.getElementById('hero-image') as HTMLImageElement;

    // Verify first controller found and stamped the elements
    expect(heroText.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(
      'hero123#fieldPath=hero.title.en'
    );
    // By default, stega encoding is preserved (contains invisible characters)
    expect(heroText.textContent).toContain('Hero headline');

    const imageWrapper1 = heroImage.closest(`[${AUTOMATIC_STAMP_ATTRIBUTE}]`) as HTMLElement;
    expect(imageWrapper1).not.toBeNull();
    expect(imageWrapper1.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(
      'hero123#fieldPath=hero.image'
    );
    // By default, stega encoding is preserved (contains invisible characters)
    expect(heroImage.getAttribute('alt')).toContain('Hero image alt');

    // Dispose the first controller
    controller1.dispose();

    // Verify attributes are removed
    expect(heroText.hasAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(false);
    const imageWrapper1After = heroImage.closest(`[${AUTOMATIC_STAMP_ATTRIBUTE}]`);
    expect(imageWrapper1After).toBeNull();

    // Create second controller on the same page
    const controller2 = createController();

    // SUCCESS! The second controller finds the stega-encoded elements
    // because by default (stripStega: false), stega encoding is preserved
    expect(heroText.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(
      'hero123#fieldPath=hero.title.en'
    );

    const imageWrapper2 = heroImage.closest(`[${AUTOMATIC_STAMP_ATTRIBUTE}]`) as HTMLElement;
    expect(imageWrapper2).not.toBeNull();
    expect(imageWrapper2.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(
      'hero123#fieldPath=hero.image'
    );

    controller2.dispose();
  });

  it('demonstrates that stega content is preserved by default', () => {
    const originalEncodedText = vercelStegaCombine('Content', {
      origin: 'datocms.com',
      href: 'item-1#fieldPath=text'
    });

    document.body.innerHTML = `<p id="text">${originalEncodedText}</p>`;

    const textElement = document.getElementById('text') as HTMLElement;

    // Save the original encoded content
    const contentBeforeController = textElement.textContent;
    expect(contentBeforeController).toContain('Content');
    expect(contentBeforeController).not.toBe('Content'); // Has invisible stega characters

    // Create and dispose controller
    const controller = createController();
    controller.dispose();

    // After disposal, stega encoding is still present (default behavior)
    const contentAfterDisposal = textElement.textContent;
    expect(contentAfterDisposal).toContain('Content');
    expect(contentAfterDisposal).not.toBe('Content'); // Still has stega characters

    // The stega-encoded characters are preserved
    expect(contentAfterDisposal).toBe(contentBeforeController);
  });

  it('strips stega when stripStega option is true', () => {
    const originalEncodedText = vercelStegaCombine('Clean Content', {
      origin: 'datocms.com',
      href: 'item-2#fieldPath=text'
    });

    document.body.innerHTML = `<p id="text">${originalEncodedText}</p>`;

    const textElement = document.getElementById('text') as HTMLElement;

    // Save the original encoded content
    const contentBeforeController = textElement.textContent;
    expect(contentBeforeController).toContain('Clean Content');
    expect(contentBeforeController).not.toBe('Clean Content'); // Has invisible stega characters

    // Create controller with stripStega: true
    const controller = createController({ stripStega: true });

    // With stripStega: true, content is cleaned
    expect(textElement.textContent).toBe('Clean Content');
    expect(textElement.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe('item-2#fieldPath=text');

    controller.dispose();

    // After disposal, the cleaned text remains
    expect(textElement.textContent).toBe('Clean Content');

    // But the second controller won't find stega because it was stripped
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller2 = createController({ stripStega: true });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No editable elements were detected after initialization')
    );

    // Element is not stamped because stega was permanently removed
    expect(textElement.hasAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(false);

    controller2.dispose();
  });

  it('allows multiple controllers with different stripStega settings', () => {
    const encodedText = vercelStegaCombine('Test Content', {
      origin: 'datocms.com',
      href: 'item-3#fieldPath=text'
    });

    document.body.innerHTML = `<p id="text">${encodedText}</p>`;
    const textElement = document.getElementById('text') as HTMLElement;

    // First controller with default (stripStega: false)
    const controller1 = createController();
    expect(textElement.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe('item-3#fieldPath=text');
    expect(textElement.textContent).toContain('Test Content');
    expect(textElement.textContent).not.toBe('Test Content'); // Has stega
    controller1.dispose();

    // Second controller can still find elements because stega is preserved
    const controller2 = createController();
    expect(textElement.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe('item-3#fieldPath=text');
    controller2.dispose();

    // Third controller with stripStega: true - won't find anything now
    // because the stega is still there but we're not stripping to verify
    const controller3 = createController({ stripStega: true });
    // It still finds it because stega is in the DOM
    expect(textElement.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe('item-3#fieldPath=text');
    // But now content is cleaned
    expect(textElement.textContent).toBe('Test Content');
    controller3.dispose();

    // Fourth controller won't find anything because stega was stripped
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller4 = createController({ stripStega: true });
    expect(warnSpy).toHaveBeenCalled();
    expect(textElement.hasAttribute(AUTOMATIC_STAMP_ATTRIBUTE)).toBe(false);
    controller4.dispose();
  });

  it('shows that manual stamping still works after controller recreation', () => {
    // Manual stamping doesn't rely on stega encoding
    document.body.innerHTML = `
      <div id="manual" data-datocms-edit-url="manual-1#fieldPath=title">
        <p>Manually stamped content</p>
      </div>
    `;

    const manualElement = document.getElementById('manual') as HTMLElement;

    // First controller
    const controller1 = createController();
    controller1.dispose();

    // Second controller - manual stamping should still work
    const controller2 = createController();

    // Manual stamps persist because they're regular attributes
    expect(manualElement.getAttribute('data-datocms-edit-url')).toBe(
      'manual-1#fieldPath=title'
    );

    controller2.dispose();
  });
});
