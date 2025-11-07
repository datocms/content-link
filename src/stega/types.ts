/**
 * Canonical metadata extracted from a stega payload. Most properties are
 * optional because the upstream string might not provide them, but we always
 * surface the raw payload for debugging purposes.
 */
export type DecodedInfo = {
  origin: string;
  href: string;
};

export function isDecodedInfo(value: unknown): value is DecodedInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'origin' in value &&
    typeof value.origin === 'string' &&
    'href' in value &&
    typeof value.href === 'string'
  );
}
