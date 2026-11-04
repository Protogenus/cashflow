import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Privacy gate (PRODUCT_SPEC.md §5, DECISIONS.md): the engine is a pure,
 * local-only module. No engine source file may reference fetch,
 * XMLHttpRequest, WebSocket, EventSource, or navigator.sendBeacon — user
 * data must never leave the machine.
 */
describe('no-network gate', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
  );
  const banned = [/fetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /navigator\.onLine/];

  it('engine sources contain zero network references', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const re of banned) {
        expect(src, `${f} matches banned pattern ${re}`).not.toMatch(re);
      }
    }
  });

  it('engine entry imports nothing outside the engine (no React, no DOM libs)', () => {
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const imp of imports) {
        expect(imp.startsWith('.') || imp === './types' || !imp.includes('/')).toBe(true);
        expect(imp).not.toMatch(/react/i);
      }
    }
  });
});
