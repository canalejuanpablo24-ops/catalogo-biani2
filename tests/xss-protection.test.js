import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const legacyAppSource = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../visor_galeria.html', import.meta.url), 'utf8');
const defaultEdits = JSON.parse(readFileSync(new URL('../src/data/defaultEdits.json', import.meta.url), 'utf8'));

function extractFunction(name) {
  const start = indexSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in the active catalog`);
  const bodyStart = indexSource.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < indexSource.length; i++) {
    if (indexSource[i] === '{') depth++;
    if (indexSource[i] === '}') {
      depth--;
      if (depth === 0) return indexSource.slice(start, i + 1);
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

test('active catalog has no HTML parsing sinks for editable data', () => {
  for (const source of [indexSource, legacyAppSource, gallerySource]) {
    assert.doesNotMatch(source, /\.innerHTML\s*=/);
    assert.doesNotMatch(source, /\.outerHTML\s*=/);
    assert.doesNotMatch(source, /insertAdjacentHTML\s*\(/);
    assert.doesNotMatch(source, /document\.write\s*\(/);
  }
  for (const source of [indexSource, gallerySource]) {
    assert.doesNotMatch(source, /<[^>]+\son[a-z]+\s*=/i);
  }
});

test('malicious product text is assigned literally through textContent', () => {
  const createTextElementSource = extractFunction('createTextElement');
  const fakeDocument = {
    createElement(tagName) {
      return { tagName, className: '', textContent: '', children: [] };
    }
  };
  const createTextElement = new Function(
    'document',
    `${createTextElementSource}; return createTextElement;`
  )(fakeDocument);

  globalThis.__bianiXssExecuted = false;
  const payloads = [
    '<img src=x onerror="globalThis.__bianiXssExecuted=true">',
    '</div><script>globalThis.__bianiXssExecuted=true</script>',
    '\"><svg onload="globalThis.__bianiXssExecuted=true">'
  ];

  for (const payload of payloads) {
    const element = createTextElement('div', 'product-name', payload);
    assert.equal(element.textContent, payload);
    assert.equal(element.className, 'product-name');
    assert.deepEqual(element.children, []);
  }
  assert.equal(globalThis.__bianiXssExecuted, false);
  delete globalThis.__bianiXssExecuted;
});

test('image URL validation rejects executable and SVG payloads', () => {
  const safeImageSourceSource = extractFunction('safeImageSource');
  const safeImageSource = new Function(
    `${safeImageSourceSource}; return safeImageSource;`
  )();

  assert.equal(safeImageSource('javascript:alert(1)'), '');
  assert.equal(safeImageSource('JaVaScRiPt:alert(1)'), '');
  assert.equal(safeImageSource('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeImageSource('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(safeImageSource('vbscript:msgbox(1)'), '');
  assert.equal(safeImageSource('imagenes\\producto.jpg'), '');
  assert.equal(safeImageSource('https://example.com/producto.jpg'), 'https://example.com/producto.jpg');
  assert.equal(safeImageSource('imagenes/producto.jpg'), 'imagenes/producto.jpg');
  assert.equal(safeImageSource('data:image/webp;base64,QUJDRA=='), 'data:image/webp;base64,QUJDRA==');
});

test('dynamic script loading is restricted to the explicit CDN allowlist', () => {
  assert.match(indexSource, /const TRUSTED_SCRIPT_URLS = new Map\(\[/);
  assert.match(indexSource, /const integrity = TRUSTED_SCRIPT_URLS\.get\(src\)/);
  assert.match(indexSource, /URL de script no autorizada/);
  assert.match(indexSource, /script\.integrity = integrity/);
  assert.match(indexSource, /script\.crossOrigin = 'anonymous'/);
  assert.match(indexSource, /sha384-\/1qUCSGwTur9vjf\/z9lmu\/eCUYbpOTgSjmpbMQZ1\/CtX2v\/WcAIKqRv\+U1DUCG6e/);
  assert.match(indexSource, /sha384-BSxuMLxX\+FCbTdYec3TbXlnMGEEM2QXTFdtDaveen71o\+jswm2J36\+xFqp8k4VHM/);
});

test('CSP authorizes every inline script by its exact SHA-256 hash', () => {
  for (const source of [indexSource, gallerySource]) {
    const csp = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/i)?.[1];
    assert.ok(csp, 'published HTML must define a CSP');
    const scriptDirective = csp.split(';').find(part => part.trim().startsWith('script-src'));
    assert.ok(scriptDirective, 'CSP must define script-src');
    assert.doesNotMatch(scriptDirective, /'unsafe-inline'|'unsafe-eval'/);
    const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1].replace(/\r\n?/g, '\n'));
    assert.ok(scripts.length > 0, 'test expects inline scripts to hash');
    for (const script of scripts) {
      const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
      assert.ok(scriptDirective.includes(hash), `missing CSP hash ${hash}`);
    }
  }
});

test('published HTML blocks plugins and unsafe base URL changes', () => {
  for (const source of [indexSource, gallerySource]) {
    assert.match(source, /object-src 'none'/);
    assert.match(source, /base-uri 'self'/);
  }
});

test('default product edits are loaded from the canonical JSON without an embedded duplicate', () => {
  assert.equal(Object.keys(defaultEdits).length, 148);
  assert.match(indexSource, /let DEFAULT_EDITS = \{\};/);
  assert.match(indexSource, /fetchWithTimeout\('src\/data\/defaultEdits\.json\?v='/);
  assert.match(indexSource, /DEFAULT_EDITS = defaultEditsRes/);
  assert.doesNotMatch(indexSource, /const DEFAULT_EDITS = \{\s*"/);
});
