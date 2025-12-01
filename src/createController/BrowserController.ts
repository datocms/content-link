/**
 * Browser-only implementation that orchestrates stamping and click-to-edit managers.
 * Acts as a lightweight coordinator handling shared concerns like Web Previews plugin connection and state events.
 */
import penpal, { type AsyncMethodReturns } from 'penpal';
import {
  getDocumentWindow,
  inIframe,
  isKeyboardEvent,
  resolveDocument,
  toCompletePath
} from '../utils/dom.js';
import { extractInfo, extractItemIdsPerEnvironment } from '../utils/editUrl.js';
import { ClickToEditManager } from './clickToEdit/ClickToEditManager.js';
import { findEditableTarget } from './clickToEdit/findEditableTarget.js';
import { DomStampingManager } from './domStamping/DomStampingManager.js';
import { STAMPED_ELEMENTS_SELECTOR } from './domStamping/constants.js';
import { EventsManager } from './events/EventsManager.js';
import { FlashAllManager } from './flashAll/FlashAllManager.js';
import type { Controller, CreateControllerOptions, StampSummary } from './types.js';
import type { WebPreviewsPluginMethods } from './webPreviewsPlugin/types.js';

export class BrowserController implements Controller {
  private readonly wrapperElement: ParentNode;
  private readonly onNavigateTo?: (path: string) => void;
  private readonly eventsManager: EventsManager;
  private readonly clickToEditManager: ClickToEditManager;
  private readonly stampingManager: DomStampingManager;
  private readonly flashAllManager: FlashAllManager;
  private listenerAbortController: AbortController;
  private temporaryState: undefined | { enabled: boolean };

  private webPreviewsPluginConnection: {
    parent: AsyncMethodReturns<WebPreviewsPluginMethods>;
    destroy: () => void;
  } | null = null;

  private disposed = false;

  private currentPath = toCompletePath(document.location.toString());

  constructor(options: CreateControllerOptions) {
    this.wrapperElement = options.root ?? document;
    this.onNavigateTo = options.onNavigateTo;

    this.eventsManager = new EventsManager({
      doc: this.document
    });

    this.clickToEditManager = new ClickToEditManager(this.document, (editUrl) =>
      this.handleEditClick(editUrl)
    );

    this.initializeWebPreviewsPluginConnection();

    this.stampingManager = new DomStampingManager(this.wrapperElement, (summary) =>
      this.handleStampResult(summary)
    );

    this.flashAllManager = new FlashAllManager(this.wrapperElement);

    this.listenerAbortController = new AbortController();

    this.document.addEventListener('keydown', (event) => this.onKeyDown(event), {
      capture: true,
      signal: this.listenerAbortController.signal
    });

    this.document.addEventListener('keyup', (event) => this.onKeyUp(event), {
      capture: true,
      signal: this.listenerAbortController.signal
    });

    this.document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.disableTemporaryClickToEditState();
        }
      },
      { signal: this.listenerAbortController.signal }
    );

    getDocumentWindow(this.document)?.addEventListener(
      'blur',
      () => {
        this.disableTemporaryClickToEditState();
      },
      { signal: this.listenerAbortController.signal }
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

  private handleStampResult(summary: StampSummary): void {
    this.eventsManager.emitStamped(summary);
    this.notifyStateChangeToWebPreviewsPlugin();
  }

  private notifyStateChangeToWebPreviewsPlugin() {
    const stampedElements = this.wrapperElement.querySelectorAll(STAMPED_ELEMENTS_SELECTOR);

    // Collect all edit URLs
    const editUrls = new Set<string>();
    for (const element of stampedElements) {
      const target = findEditableTarget(element as Element)!;
      editUrls.add(target.editUrl);
    }

    this.webPreviewsPluginConnection?.parent.onStateChange({
      clickToEditEnabled: this.clickToEditManager.isActive(),
      path: this.currentPath,
      itemIdsPerEnvironment: extractItemIdsPerEnvironment(Array.from(editUrls))
    });
  }

  private handleEditClick(editUrl: string): void {
    if (this.webPreviewsPluginConnection) {
      const info = extractInfo(editUrl);

      if (info) {
        this.webPreviewsPluginConnection.parent.openItem(info);
      }
    } else {
      // Fallback: open in new tab
      const opener = this.document.defaultView ?? (typeof window !== 'undefined' ? window : null);

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
        flash: (payload: { scrollToNearestTarget: boolean }) => {
          this.flashAll(payload.scrollToNearestTarget);
        },
        setClickToEditEnabled: (
          payload: { enabled: true; flash: { scrollToNearestTarget: boolean } } | { enabled: false }
        ) => {
          if (payload.enabled) {
            this.enableClickToEdit(payload.flash);
          } else {
            this.disableClickToEdit();
          }
        }
      }
    });

    const parent = await connection.promise;

    if (this.disposed) {
      connection.destroy();
      return;
    }

    this.webPreviewsPluginConnection = {
      parent,
      destroy: () => {
        connection.destroy;
      }
    };

    this.notifyStateChangeToWebPreviewsPlugin();
  }

  private onKeyDown(event: Event) {
    if (!isKeyboardEvent(event) || event.key !== 'Alt') {
      return;
    }

    this.enableTemporaryClickToEditState();
  }

  private onKeyUp(event: Event) {
    if (!isKeyboardEvent(event) || event.key !== 'Alt') {
      return;
    }

    this.disableTemporaryClickToEditState();
  }

  private enableTemporaryClickToEditState() {
    if (this.clickToEditManager.isActive()) {
      this.temporaryState = { enabled: false };
      this.disableClickToEdit();
    } else {
      this.temporaryState = { enabled: true };
      this.enableClickToEdit({ scrollToNearestTarget: true });
    }
  }

  private disableTemporaryClickToEditState() {
    if (!this.temporaryState) {
      return;
    }

    if (this.temporaryState.enabled) {
      this.disableClickToEdit();
    } else {
      this.enableClickToEdit({ scrollToNearestTarget: true });
    }

    this.temporaryState = undefined;
  }
}
