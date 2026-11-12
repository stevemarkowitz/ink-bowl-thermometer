import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRedirect } from '../src/host.js';

test('www redirects to the bare domain, keeping path and query', () => {
  assert.equal(canonicalRedirect(new URL('https://www.inkbowl.giving/')), 'https://inkbowl.giving/');
  assert.equal(canonicalRedirect(new URL('https://www.inkbowl.giving/png?x=1')), 'https://inkbowl.giving/png?x=1');
});
test('the bare domain and localhost are left alone', () => {
  assert.equal(canonicalRedirect(new URL('https://inkbowl.giving/')), null);
  assert.equal(canonicalRedirect(new URL('http://127.0.0.1:8787/')), null);
});
