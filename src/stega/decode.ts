/**
 * Steganography helpers built on top of @vercel/stega.
 * These utilities decode the zero-width encoded metadata that DatoCMS embeds
 * into strings (text content, alt attributes, etc.) and normalize the result
 * into the strongly typed structure consumed by the rest of the SDK.
 */
import {
  VERCEL_STEGA_REGEX,
  vercelStegaClean,
  vercelStegaDecode,
  vercelStegaSplit
} from '@vercel/stega';
import { type DecodedInfo, isDecodedInfo } from './types.js';

export const STEGA_REGEXP = VERCEL_STEGA_REGEX;

/**
 * Splits a string into its cleaned content and encoded stega data.
 *
 * This function separates the visible content from invisible stega-encoded metadata
 * using the VERCEL_STEGA_REGEX pattern. It removes ALL stega encodings found in the
 * input string (due to the global regex flag).
 *
 * @param {string} input - The string potentially containing stega-encoded data
 * @returns {{ cleaned: string, encoded: string }} An object containing:
 *   - `cleaned`: The input string with all stega encodings removed
 *   - `encoded`: The first stega-encoded segment found (empty string if none found)
 *
 * @example
 * const result = splitStega("Hello[U+200E]World");
 * // result.cleaned: "HelloWorld"
 * // result.encoded: "[U+200E]" (invisible characters)
 *
 * @example
 * // Multiple stega encodings - all removed from cleaned, only first captured in encoded
 * const result = splitStega("Part1[U+200E]Part2[U+200E]Part3");
 * // result.cleaned: "Part1Part2Part3" (all stega removed)
 * // result.encoded: "[U+200E]" (only first encoding captured)
 */
export function splitStega(input: string): ReturnType<typeof vercelStegaSplit> {
  return vercelStegaSplit(input);
}

/**
 * Decodes stega-encoded metadata from a string and returns structured information.
 *
 * This function extracts and decodes the FIRST stega-encoded segment found in the input,
 * returning a structured DecodedInfo object containing origin and href information.
 * If the input contains multiple stega encodings, only the first one is decoded.
 *
 * @param {string} input - The string potentially containing stega-encoded data
 * @param {ReturnType<typeof vercelStegaSplit>} [split] - Optional pre-split result from splitStega.
 *   If provided, avoids re-splitting the input. Useful for performance when you've already
 *   called splitStega on the same input.
 * @returns {DecodedInfo | null} The decoded metadata object with `origin` and `href` properties,
 *   or null if:
 *   - Input is empty/falsy
 *   - No stega encoding found
 *   - Decoding fails (invalid encoding)
 *   - Decoded data doesn't match DecodedInfo structure
 *
 * @example
 * // Decode stega from a string
 * const info = decodeStega("Hello[U+200E]World");
 * if (info) {
 *   console.log(info.origin); // e.g., "https://example.com"
 *   console.log(info.href);   // e.g., "/path/to/content"
 * }
 */
export function decodeStega(input: string): DecodedInfo | null {
  if (!input) {
    return null;
  }

  const resolvedSplit = vercelStegaSplit(input);
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
 * Completely removes ALL stega encodings from any JavaScript value.
 *
 * This function works with any data type (strings, objects, arrays, primitives) by:
 * 1. Converting the input to a JSON string
 * 2. Removing all stega-encoded segments using the global VERCEL_STEGA_REGEX
 * 3. Parsing the cleaned JSON back to its original type
 *
 * Unlike splitStega which only works with strings, stripStega handles complex nested
 * structures and removes ALL stega encodings throughout the entire value.
 *
 * @template T - The type of the input value
 * @param {T} input - Any JavaScript value (string, object, array, number, etc.)
 * @returns {T} The same value with all stega encodings removed
 *
 * @example
 * // Works with strings
 * stripStega("Hello[U+200E]World") // "HelloWorld"
 *
 * @example
 * // Works with objects
 * stripStega({ name: "John[U+200E]", age: 30 })
 *
 * @example
 * // Works with nested structures - removes ALL stega encodings
 * stripStega({
 *   users: [
 *     { name: "Alice[U+200E]", email: "alice[U+200E]@example.com" },
 *     { name: "Bob[U+200E]", email: "bob[U+200E]@example.com" }
 *   ]
 * })
 *
 * @example
 * // Works with arrays
 * stripStega(["First[U+200E]", "Second[U+200E]", "Third[U+200E]"])
 */
export function stripStega<T>(input: T): T {
  return vercelStegaClean(input);
}
