import { describe, expect, it } from 'vitest';
import { homeForRole, safeNext } from './navigation';
import { withQuery } from './search-params';

describe('safeNext (open-redirect protection)', () => {
  it('accepts same-site paths', () => {
    expect(safeNext('/books/1?x=2')).toBe('/books/1?x=2');
  });

  it('rejects absolute, protocol-relative and backslash URLs', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});

describe('helpers', () => {
  it('maps roles to home pages', () => {
    expect(homeForRole('STUDENT')).toBe('/dashboard');
    expect(homeForRole('TRAINER')).toBe('/trainer');
    expect(homeForRole('ADMIN')).toBe('/admin');
  });

  it('builds query strings without empty values', () => {
    expect(withQuery('/books', { search: 'a b', status: undefined, page: 2, x: '' })).toBe(
      '/books?search=a+b&page=2',
    );
    expect(withQuery('/books', {})).toBe('/books');
  });
});
