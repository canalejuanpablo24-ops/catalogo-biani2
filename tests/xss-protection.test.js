import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
  assert.doesNotMatch(indexSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(indexSource, /\.outerHTML\s*=/);
  assert.doesNotMatch(indexSource, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(indexSource, /document\.write\s*\(/);
  assert.doesNotMatch(indexSource, /onclick=["'][^"']*\$\{/);
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
  assert.match(indexSource, /const TRUSTED_SCRIPT_URLS = new Set\(\[/);
  assert.match(indexSource, /if \(!TRUSTED_SCRIPT_URLS\.has\(src\)\)/);
  assert.match(indexSource, /URL de script no autorizada/);
});
