import { describe, expect, it } from 'vitest';
import { attr, decodeEntities, parseCount, squash } from '../html.js';

describe('attr', () => {
  it('extracts attributes regardless of order', () => {
    const tag = '<td data-level="2" id="c-0-1" data-date="2024-03-02">';
    expect(attr(tag, 'data-date')).toBe('2024-03-02');
    expect(attr(tag, 'data-level')).toBe('2');
    expect(attr(tag, 'id')).toBe('c-0-1');
    expect(attr(tag, 'missing')).toBe(null);
  });
  it('does not match a bare name inside a hyphenated attribute', () => {
    const tag = '<td data-level="2" data-date="2024-03-02">';
    expect(attr(tag, 'level')).toBe(null);
    expect(attr(tag, 'date')).toBe(null);
    expect(attr(tag, 'data-level')).toBe('2');
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x2764;')).toBe('a & b <c> "d" \'e\' ❤');
  });
});

describe('squash', () => {
  it('collapses whitespace runs', () => {
    expect(squash('a \n\t  b')).toBe('a b');
  });
});

describe('parseCount', () => {
  it('parses plain, comma and abbreviated counts', () => {
    expect(parseCount(' 42 ')).toBe(42);
    expect(parseCount('1,024')).toBe(1024);
    expect(parseCount('1.2k')).toBe(1200);
    expect(parseCount('3m')).toBe(3_000_000);
  });
  it('throws on garbage', () => {
    expect(() => parseCount('abc')).toThrow();
  });
});
