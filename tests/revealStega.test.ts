import * as stega from '@vercel/stega';
import { describe, expect, it } from 'vitest';
import { revealStega } from '../src/stega/decode.js';

const { vercelStegaCombine } = stega;

const payload = {
  origin: 'https://acme.admin.datocms.com',
  href: '/editor/item_types/123/items/456',
};

describe('revealStega', () => {
  it('replaces stega in a plain string', () => {
    const encoded = vercelStegaCombine('Hello world', payload);
    const result = revealStega(encoded);
    expect(result).toBe('Hello world[STEGA:/editor/item_types/123/items/456]');
  });

  it('returns a plain string unchanged', () => {
    expect(revealStega('no stega here')).toBe('no stega here');
  });

  it('works with objects', () => {
    const obj = {
      title: vercelStegaCombine('My Title', payload),
      count: 42,
    };
    const result = revealStega(obj);
    expect(result.title).toBe('My Title[STEGA:/editor/item_types/123/items/456]');
    expect(result.count).toBe(42);
  });

  it('works with nested structures', () => {
    const data = {
      blog: {
        title: vercelStegaCombine('Hello', payload),
        author: {
          name: vercelStegaCombine('Alice', {
            origin: 'https://acme.admin.datocms.com',
            href: '/editor/item_types/789/items/012',
          }),
        },
      },
    };
    const result = revealStega(data);
    expect(result.blog.title).toBe('Hello[STEGA:/editor/item_types/123/items/456]');
    expect(result.blog.author.name).toBe('Alice[STEGA:/editor/item_types/789/items/012]');
  });

  it('works with arrays', () => {
    const arr = [
      vercelStegaCombine('First', payload),
      vercelStegaCombine('Second', payload),
    ];
    const result = revealStega(arr);
    expect(result[0]).toBe('First[STEGA:/editor/item_types/123/items/456]');
    expect(result[1]).toBe('Second[STEGA:/editor/item_types/123/items/456]');
  });

  it('passes through non-string primitives', () => {
    expect(revealStega(42)).toBe(42);
    expect(revealStega(null)).toBe(null);
    expect(revealStega(true)).toBe(true);
  });
});
