/**
 * React hook that wires a subscription (typically to a CMS client) into the
 * visual-editing controller. Whenever the subscriber emits, we refresh overlays.
 */
import { type RefObject, useEffect, useRef } from 'react';
import { createOverlaysController } from '../../createOverlaysController/index.js';
import type {
  CreateOverlaysControllerOptions,
  OverlaysController
} from '../../createOverlaysController/types.js';
import { inBrowser } from '../../utils/dom.js';

export type ListenSubscribe = (handlers: {
  onUpdate: () => void;
  onError?: (err: unknown) => void;
}) => () => void;

export type UseDatoVisualEditingListenOptions = {
  controller?: OverlaysController;
  controllerOptions?: CreateOverlaysControllerOptions;
  scopeRef?: RefObject<ParentNode | null>;
  initialRefresh?: boolean;
  onError?: (err: unknown) => void;
};

/**
 * Connect a data subscription to the visual-editing controller. Creates a
 * controller on demand when one isn't provided and disposes it on unmount.
 */
export function useDatoVisualEditingListen(
  subscribe: ListenSubscribe,
  options?: UseDatoVisualEditingListenOptions
): void {
  const internalControllerRef = useRef<OverlaysController | null>(null);
  const warnedMissingOptionsRef = useRef(false);

  const externalController = options?.controller ?? null;
  const scopeRef = options?.scopeRef;
  const initialRefresh = options?.initialRefresh ?? true;
  const onError = options?.onError;
  const controllerOptions = options?.controllerOptions;

  useEffect(() => {
    if (!inBrowser()) {
      return;
    }

    const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV !== 'production' : true;

    let controller = externalController ?? internalControllerRef.current;
    let disposeController: (() => void) | null = null;

    if (!controller) {
      if (!controllerOptions) {
        if (!warnedMissingOptionsRef.current && isDev) {
          console.warn(
            '[datocms-visual-editing] useDatoVisualEditingListen: controllerOptions are required when controller is not provided.'
          );
          warnedMissingOptionsRef.current = true;
        }
        return;
      }
      controller = createOverlaysController(controllerOptions);
      internalControllerRef.current = controller;
      disposeController = () => {
        internalControllerRef.current?.dispose();
        internalControllerRef.current = null;
      };
    } else {
      internalControllerRef.current = externalController ?? internalControllerRef.current;
    }

    const refreshScope = () => scopeRef?.current ?? undefined;

    if (initialRefresh) {
      try {
        controller.refresh(refreshScope());
      } catch (err) {
        onError?.(err);
      }
    }

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribe({
        onUpdate: () => {
          try {
            if (controller?.isDisposed()) {
              return;
            }
            controller?.refresh(refreshScope());
          } catch (err) {
            onError?.(err);
          }
        },
        onError: onError
      });
    } catch (err) {
      onError?.(err);
    }

    return () => {
      unsubscribe?.();
      if (!externalController) {
        disposeController?.();
      }
    };
  }, [externalController, controllerOptions, initialRefresh, onError, scopeRef, subscribe]);
}
