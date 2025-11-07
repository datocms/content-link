import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../src/utils/dom';

describe('dom utils', () => {
  it('resolves documents from various roots', () => {
    expect(resolveDocument(document)).toBe(document);
    expect(resolveDocument(document.body)).toBe(document);
  });
});
