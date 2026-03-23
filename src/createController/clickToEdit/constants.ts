/**
 * Overlay-specific constants for styling and behavior.
 */
export const DEFAULT_OVERLAY_PADDING = 8;
export const OVERLAY_Z_INDEX = '2147483646';
export const DEFAULT_BORDER_WIDTH = '2px';
export const DEFAULT_BORDER_RADIUS = '6px';
export const DEFAULT_HUE = 17;

export type OverlayColors = {
  borderColor: string;
  backgroundColor: string;
};

// HSL→RGB with S fixed at 100%, used only for luminance calculation.
function hslToRgb(h: number, l: number): [number, number, number] {
  const a = Math.min(l, 1 - l); // s=1, so a = s * min(l, 1-l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
}

// Binary search: highest HSL lightness (S=100%) that achieves ≥3.5:1 contrast against white.
function contrastSafeLightness(hue: number): number {
  let lo = 0,
    hi = 0.5,
    lightness = 0;
  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2;
    const [r, g, b] = hslToRgb(hue, mid);
    const contrast = 1.05 / (relativeLuminance(r, g, b) + 0.05);
    if (contrast >= 3.5) {
      lightness = mid;
      lo = mid + 0.001;
    } else {
      hi = mid - 0.001;
    }
  }
  return lightness;
}

export function buildOverlayColors(hue: number): OverlayColors {
  const l = Math.round(contrastSafeLightness(hue) * 100);
  return {
    borderColor: `hsl(${hue}, 100%, ${l}%)`,
    backgroundColor: `hsla(${hue}, 100%, ${l}%, 0.15)`
  };
}
