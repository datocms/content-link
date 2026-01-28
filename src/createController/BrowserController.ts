/**
 * Browser-only implementation that orchestrates stamping and click-to-edit managers.
 * Acts as a lightweight coordinator handling shared concerns like Web Previews plugin connection and state events.
 */
import penpal, { type AsyncMethodReturns } from 'penpal';
import {
  getDocumentWindow,
  inIframe,
  isKeyboardEvent,
  isMouseEvent,
  resolveDocument,
  toCompletePath,
} from '../utils/dom.js';
import { extractInfo, extractItemIdsPerEnvironment } from '../utils/editUrl.js';
import { ClickToEditManager } from './clickToEdit/ClickToEditManager.js';
import { DomStampingManager } from './domStamping/DomStampingManager.js';
import {
  AUTOMATIC_STAMP_ATTRIBUTE,
  MANUAL_STAMP_ATTRIBUTE,
  STAMPED_ELEMENTS_SELECTOR,
} from './domStamping/constants.js';
import { EventsManager } from './events/EventsManager.js';
import { FlashAllManager } from './flash/FlashAllManager.js';
import { FlashItemManager } from './flash/FlashItemManager.js';
import type {
  Controller,
  CreateControllerOptions,
  StampSummary,
} from './types.js';
import type { WebPreviewsPluginMethods } from './webPreviewsPlugin/types.js';

export class BrowserController implements Controller {
  private readonly wrapperElement: ParentNode;
  private readonly onNavigateTo?: (path: string) => void;
  private readonly eventsManager: EventsManager;
  private readonly clickToEditManager: ClickToEditManager;
  private readonly stampingManager: DomStampingManager;
  private readonly flashAllManager: FlashAllManager;
  private flashItemManager: FlashItemManager | null = null;
  private listenerAbortController: AbortController;
  private temporaryState: undefined | { enabled: boolean };

  private webPreviewsPluginConnection: {
    parent: AsyncMethodReturns<WebPreviewsPluginMethods>;
    editUrlRegExp: RegExp;
    destroy: () => void;
  } | null = null;

  private disposed = false;

  private currentPath = toCompletePath(document.location.toString());

  constructor(options: CreateControllerOptions) {
    this.wrapperElement = options.root ?? document;
    this.onNavigateTo = options.onNavigateTo;

    this.eventsManager = new EventsManager({
      doc: this.document,
    });

    this.clickToEditManager = new ClickToEditManager(
      this.document,
      (editUrl) => this.handleEditClick(editUrl),
      () => this.webPreviewsPluginConnection === null,
    );

    this.initializeWebPreviewsPluginConnection();

    this.stampingManager = new DomStampingManager(
      this.wrapperElement,
      (summary) => this.handleStampResult(summary),
      options.stripStega ?? false,
    );

    this.flashAllManager = new FlashAllManager(this.wrapperElement);

    this.listenerAbortController = new AbortController();

    this.document.addEventListener(
      'keydown',
      (event) => this.onKeyDown(event),
      {
        capture: true,
        signal: this.listenerAbortController.signal,
      },
    );

    this.document.addEventListener('keyup', (event) => this.onKeyUp(event), {
      capture: true,
      signal: this.listenerAbortController.signal,
    });

    this.document.addEventListener('click', (event) => this.onClick(event), {
      capture: true,
      signal: this.listenerAbortController.signal,
    });

    this.document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.disableTemporaryClickToEditState();
        }
      },
      { signal: this.listenerAbortController.signal },
    );

    getDocumentWindow(this.document)?.addEventListener(
      'blur',
      () => {
        this.disableTemporaryClickToEditState();
      },
      { signal: this.listenerAbortController.signal },
    );
  }

  get document() {
    return resolveDocument(this.wrapperElement);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.clickToEditManager.deactivate();
    this.stampingManager.dispose();
    this.flashAllManager.dispose();
    this.flashItemManager?.dispose();
    this.webPreviewsPluginConnection?.destroy();
    this.listenerAbortController.abort();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  setCurrentPath(urlOrPath: string): void {
    this.currentPath = toCompletePath(urlOrPath);
  }

  enableClickToEdit(flashAll?: { scrollToNearestTarget: boolean }): void {
    if (this.disposed) {
      return;
    }

    if (!this.clickToEditManager.isActive()) {
      this.clickToEditManager.activate();
      this.eventsManager.emitClickToEditToggle(true);
      this.notifyStateChangeToWebPreviewsPlugin();
    }

    if (flashAll) {
      this.flashAllManager.flash(flashAll.scrollToNearestTarget);
    }
  }

  disableClickToEdit(): void {
    if (!this.clickToEditManager.isActive() || this.disposed) {
      return;
    }
    this.clickToEditManager.deactivate();
    this.eventsManager.emitClickToEditToggle(false);
    this.notifyStateChangeToWebPreviewsPlugin();
  }

  isClickToEditEnabled(): boolean {
    return this.clickToEditManager.isActive() && !this.disposed;
  }

  flashAll(scrollToNearestTarget = false): void {
    if (this.disposed) {
      return;
    }

    this.flashAllManager.flash(scrollToNearestTarget);
  }

  async flashItem(itemId: string, scrollToNearestTarget = false) {
    if (this.disposed || !this.webPreviewsPluginConnection) {
      return;
    }

    this.flashItemManager?.dispose();

    const flashSingleManager = new FlashItemManager(
      this.wrapperElement,
      itemId,
      this.webPreviewsPluginConnection.editUrlRegExp,
    );
    const flashed = flashSingleManager.flash(scrollToNearestTarget);
    this.flashItemManager = flashSingleManager;

    await flashed;

    flashSingleManager.dispose();
  }

  private handleStampResult(summary: StampSummary): void {
    this.eventsManager.emitStamped(summary);
    this.notifyStateChangeToWebPreviewsPlugin();
  }

  private async notifyStateChangeToWebPreviewsPlugin() {
    if (!this.webPreviewsPluginConnection) {
      return;
    }

    const stampedElements = this.wrapperElement.querySelectorAll(
      STAMPED_ELEMENTS_SELECTOR,
    );

    // Collect all edit URLs from stamped elements
    const editUrls = new Set<string>();
    for (const element of stampedElements) {
      const url =
        element.getAttribute(MANUAL_STAMP_ATTRIBUTE) ||
        element.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE);
      if (url) {
        editUrls.add(url);
      }
    }

    await this.webPreviewsPluginConnection.parent.onStateChange({
      clickToEditEnabled: this.clickToEditManager.isActive(),
      path: this.currentPath,
      itemIdsPerEnvironment: extractItemIdsPerEnvironment(
        Array.from(editUrls),
        this.webPreviewsPluginConnection.editUrlRegExp,
      ),
    });
  }

  private handleEditClick(editUrl: string): void {
    if (this.webPreviewsPluginConnection) {
      const info = extractInfo(
        editUrl,
        this.webPreviewsPluginConnection.editUrlRegExp,
      );

      if (info) {
        this.webPreviewsPluginConnection.parent.openItem(info);
      }
    } else {
      // Fallback: open in new tab
      const opener =
        this.document.defaultView ??
        (typeof window !== 'undefined' ? window : null);

      opener?.open(editUrl, '_blank', 'noopener,noreferrer');
    }
  }

  private async initializeWebPreviewsPluginConnection() {
    if (!inIframe()) {
      return;
    }

    const connection = penpal.connectToParent<WebPreviewsPluginMethods>({
      timeout: 20000,
      methods: {
        navigateTo: (payload: { path: string }) => {
          this.onNavigateTo?.(payload.path);
        },
        flashAll: (payload: { scrollToNearestTarget: boolean }) => {
          this.flashAll(payload.scrollToNearestTarget);
        },
        flashItem: (payload: {
          itemId: string;
          scrollToNearestTarget: boolean;
        }) => {
          this.flashItem(payload.itemId, payload.scrollToNearestTarget);
        },
        setClickToEditEnabled: (
          payload:
            | { enabled: true; flash: { scrollToNearestTarget: boolean } }
            | { enabled: false },
        ) => {
          if (payload.enabled) {
            this.enableClickToEdit(payload.flash);
          } else {
            this.disableClickToEdit();
          }
        },
      },
    });

    const parent = await connection.promise;

    if (this.disposed) {
      connection.destroy();
      return;
    }

    let pingInterval: NodeJS.Timeout;

    const { editUrlRegExp } = await parent.onInit();

    pingInterval = setInterval(() => parent.onPing(), 1000);

    this.webPreviewsPluginConnection = {
      parent,
      destroy: () => {
        clearInterval(pingInterval);
        connection.destroy();
      },
      editUrlRegExp: new RegExp(editUrlRegExp.source, editUrlRegExp.flags),
    };

    await this.notifyStateChangeToWebPreviewsPlugin();
  }

  private onKeyDown(event: Event) {
    if (!isKeyboardEvent(event) || event.key !== 'Alt') {
      return;
    }

    if (!this.isTopLevelWindowOrInWebPreviewsIframe) {
      return;
    }

    this.enableTemporaryClickToEditState();
  }

  private onKeyUp(event: Event) {
    if (!isKeyboardEvent(event) || event.key !== 'Alt') {
      return;
    }

    if (!this.isTopLevelWindowOrInWebPreviewsIframe) {
      return;
    }

    this.disableTemporaryClickToEditState();
  }

  private onClick(event: Event) {
    if (!isMouseEvent(event) || event.button !== 0) {
      return;
    }

    // Pressing "alt" during a click often means something for the browser
    // (ie. download the link instead of opening). If click-to-edit is
    // temporarly disabled, it means we're pressing "alt". So here we
    // prevent the click, and generate a new one with no "alt".

    if (this.temporaryState && !this.temporaryState.enabled && event.altKey) {
      event.preventDefault();

      const newClick = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      (event.target as HTMLElement).dispatchEvent(newClick);
    }
  }

  private enableTemporaryClickToEditState() {
    if (this.clickToEditManager.isActive()) {
      this.temporaryState = { enabled: false };
      this.disableClickToEdit();
      this.flashAllManager.fadeOut();
    } else {
      this.temporaryState = { enabled: true };
      this.enableClickToEdit();
      this.flashAllManager.fadeIn(true);
    }
  }

  private disableTemporaryClickToEditState() {
    if (!this.temporaryState) {
      return;
    }

    if (this.temporaryState.enabled) {
      this.disableClickToEdit();
      this.flashAllManager.fadeOut();
    } else {
      this.enableClickToEdit();
      this.flashAllManager.flash(true);
    }

    this.temporaryState = undefined;
  }

  private get isTopLevelWindowOrInWebPreviewsIframe() {
    const opener =
      this.document.defaultView ??
      (typeof window !== 'undefined' ? window : null);

    return (
      this.webPreviewsPluginConnection || (opener && opener.parent === opener)
    );
  }
}
