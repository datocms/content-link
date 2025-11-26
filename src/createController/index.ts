/**
 * Entry point for enabling DatoCMS click-to-edit in the browser.
 * Orchestrates DOM observation, highlight rendering, optional dev tooling, and
 * exposes a controller so hosts can manage the experience.
 */
import { inBrowser } from '../utils/dom.js';
import { BrowserController } from './BrowserController.js';
import { NoopController } from './NoopController.js';
import type { Controller, CreateControllerOptions } from './types.js';

/**
 * Boot the click-to-edit runtime. When executed in a browser it returns a live
 * controller; on the server we hand back a no-op implementation so callers
 * don't have to guard their usage.
 */
export function createController(options: CreateControllerOptions = {}): Controller {
  return inBrowser() ? new BrowserController(options) : new NoopController();
}
