/**
 * Entry point for enabling DatoCMS visual editing overlays in the browser.
 * Orchestrates DOM observation, overlay rendering, optional dev tooling, and
 * exposes a controller so hosts can toggle the experience on and off.
 */
import { inBrowser } from '../utils/dom.js';
import { BrowserController } from './BrowserController.js';
import { NoopController } from './NoopController.js';
import type { CreateOverlaysControllerOptions, OverlaysController } from './types.js';

/**
 * Boot the visual-editing runtime. When executed in a browser it returns a live
 * controller; on the server we hand back a no-op implementation so callers
 * don't have to guard their usage.
 */
export function createOverlaysController(
  options: CreateOverlaysControllerOptions = {}
): OverlaysController {
  const autoEnable = options.autoEnable ?? true;

  const controller = inBrowser() ? new BrowserController(options) : new NoopController(autoEnable);

  if (autoEnable) {
    controller.enable();
  }

  return controller;
}
