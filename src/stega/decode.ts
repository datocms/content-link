/**
 * Steganography helpers built on top of @vercel/stega.
 * These utilities decode the zero-width encoded metadata that DatoCMS embeds
 * into strings (text content, alt attributes, etc.) and normalize the result
 * into the strongly typed structure consumed by the rest of the SDK.
 */
import { vercelStegaDecode, vercelStegaSplit } from '@vercel/stega';
import { type DecodedInfo, isDecodedInfo } from './types.js';

export function splitStega(input: string): ReturnType<typeof vercelStegaSplit> {
  return vercelStegaSplit(input);
}

/**
 * Decode the stega payload embedded inside `input`, returning the core metadata
 * the overlay system understands. If the string does not contain an encoded
 * segment (or if decoding fails) we return null so callers can skip stamping.
 */
export function decodeStega(
  input: string,
  split?: ReturnType<typeof vercelStegaSplit>
): DecodedInfo | null {
  if (!input) {
    return null;
  }

  const resolvedSplit = split ?? vercelStegaSplit(input);
  if (!resolvedSplit.encoded) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = vercelStegaDecode(resolvedSplit.encoded);
  } catch {
    return null;
  }

  if (!isDecodedInfo(decoded)) {
    return null;
  }

  return decoded;
}

/**
 * Remove stega metadata from a string while preserving the human-visible content.
 * Useful when rendering text back to end users or performing comparisons.
 */
export function stripStega(input: string, split?: ReturnType<typeof vercelStegaSplit>): string {
  if (!input) {
    return '';
  }

  const resolvedSplit = split ?? vercelStegaSplit(input);
  return resolvedSplit.cleaned ?? input;
}
