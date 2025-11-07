/**
 * Entry point for enabling DatoCMS visual editing overlays in the browser.
 * Orchestrates DOM observation, overlay rendering, optional dev tooling, and
 * exposes a controller so hosts can toggle the experience on and off.
 */
import { inBrowser } from '../utils/dom.js';
import { BrowserController } from './BrowserController.js';
import { createNoopController } from './createNoopController.js';
import type { Controller, EnableDatoVisualEditingOptions } from './types.js';

/**
 * Boot the visual-editing runtime. When executed in a browser it returns a live
 * controller; on the server we hand back a no-op implementation so callers
 * don't have to guard their usage.
 */
export function enableDatoVisualEditing(options: EnableDatoVisualEditingOptions = {}): Controller {
  const autoEnable = options.autoEnable ?? true;

  if (!inBrowser()) {
    return createNoopController(autoEnable);
  }

  const controller = new BrowserController(options);
  if (autoEnable) {
    controller.enable();
  }
  return controller;
}
