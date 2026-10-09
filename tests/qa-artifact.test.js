import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const output = new URL('../dist-qa/', import.meta.url);

test('el artefacto QA se construye con TEST_MODE obligatorio y sin contenido productivo', () => {
  execFileSync(process.execPath, ['scripts/build-qa-artifact.js'], {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      GITHUB_REF_NAME: 'codex-desarrollo',
      GITHUB_SHA: 'test-sha'
    }
  });

  const manifest = JSON.parse(readFileSync(new URL('qa-build-manifest.json', output), 'utf8'));
  const robots = readFileSync(new URL('robots.txt', output), 'utf8');
  const headers = readFileSync(new URL('_headers', output), 'utf8');
  const runtime = readFileSync(new URL('src/config/runtime.config.js', output), 'utf8');

  assert.equal(manifest.testMode, true);
  assert.equal(manifest.sourceBranch, 'codex-desarrollo');
  assert.equal(manifest.sourceCommit, 'test-sha');
  assert.match(runtime, /TEST_MODE:\s*true/);
  assert.match(robots, /Disallow:\s*\//);
  assert.match(headers, /X-Robots-Tag:\s*noindex, nofollow, noarchive, nosnippet/);
  assert.equal(existsSync(new URL('CNAME', output)), false);
  assert.equal(existsSync(new URL('.github/', output)), false);
  assert.equal(existsSync(new URL('tests/', output)), false);
  assert.equal(existsSync(new URL('ADMIN_PUBLICATION.md', output)), false);
});

test('el workflow QA sólo valida codex-desarrollo y exige Access antes de desplegar', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-qa.yml', import.meta.url), 'utf8');

  assert.match(workflow, /branches:\s*\n\s*- codex-desarrollo/);
  assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /CLOUDFLARE_QA_ACCESS_READY/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /--project-name=biani-qa/);
  assert.match(workflow, /--branch=codex-desarrollo/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});
