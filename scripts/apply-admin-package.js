#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

await import('../src/services/admin-state.service.js');
await import('../src/services/admin-package.service.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_PATH = path.join(ROOT, 'src', 'data', 'admin-state.json');
const IMAGE_MAP_PATH = path.join(ROOT, 'code_to_image.json');
const IMAGE_ROOT = path.join(ROOT, 'imagenes');
const EXPECTED_REPOSITORY = 'canalejuanpablo24-ops/catalogo-biani2';
const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif']
]);

function abort(message) {
  throw new Error(message);
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe']
  }).trim();
}

function insideRoot(target, allowedRoot = ROOT) {
  const relative = path.relative(path.resolve(allowedRoot), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function assertSafeTarget(target, allowedRoot = ROOT) {
  if (!insideRoot(target, allowedRoot)) abort(`Ruta de escritura fuera del directorio permitido: ${target}`);
  if (fs.existsSync(allowedRoot) && fs.lstatSync(allowedRoot).isSymbolicLink()) abort(`No se permiten enlaces simbólicos: ${allowedRoot}`);
  let cursor = path.resolve(target);
  while (cursor !== path.resolve(allowedRoot)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) abort(`No se permiten enlaces simbólicos: ${cursor}`);
    cursor = path.dirname(cursor);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArguments(argv) {
  const mode = argv.includes('--apply') ? 'apply' : argv.includes('--check') ? 'check' : null;
  if (!mode || (argv.includes('--apply') && argv.includes('--check'))) {
    abort('Uso: node scripts/apply-admin-package.js (--check | --apply --confirm ID) RUTA_PAQUETE');
  }
  const confirmIndex = argv.indexOf('--confirm');
  const confirm = confirmIndex === -1 ? null : argv[confirmIndex + 1];
  const positional = argv.filter((value, index) => !value.startsWith('--') && index !== confirmIndex + 1);
  if (positional.length !== 1) abort('Debe indicar exactamente un archivo de paquete.');
  if (mode === 'apply' && !confirm) abort('--apply requiere --confirm con el packageId revisado.');
  return { mode, confirm, packagePath: path.resolve(positional[0]) };
}

function assertRepositoryState(mode) {
  const branch = git(['branch', '--show-current']);
  const ciSourceBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
  const trustedCiCheck = mode === 'check' && process.env.GITHUB_ACTIONS === 'true' && ciSourceBranch === 'codex-desarrollo';
  if (branch !== 'codex-desarrollo' && !trustedCiCheck) abort(`Rama no autorizada: ${branch || '(detached)'}`);
  if (mode === 'apply' && git(['status', '--porcelain'])) abort('El checkout debe estar limpio antes de aplicar un paquete.');
  return git(['rev-parse', 'HEAD']);
}

function assertBaseCommit(baseCommit, headCommit) {
  try {
    git(['merge-base', '--is-ancestor', baseCommit, headCommit]);
  } catch (_) {
    abort('El commit base del paquete no es ancestro del HEAD actual. Posible divergencia.');
  }
}

function safeImageName(code, digest, extension) {
  const safeCode = String(code).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'producto';
  return `admin_${safeCode}_${digest.slice(0, 16)}.${extension}`;
}

function materializeImages(rawPackage) {
  const pkg = JSON.parse(JSON.stringify(rawPackage));
  const assets = new Map();

  function materialize(code, image) {
    if (!String(image || '').startsWith('data:')) return image || '';
    const match = image.match(/^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) abort(`Imagen inválida para ${code}.`);
    const extension = MIME_EXTENSIONS.get(match[1]);
    if (!extension) abort(`Tipo de imagen no permitido para ${code}.`);
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > globalThis.AdminPackage.MAX_IMAGE_BYTES) abort(`Imagen demasiado grande para ${code}.`);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const relativePath = path.posix.join('imagenes', safeImageName(code, digest, extension));
    const absolutePath = path.resolve(ROOT, ...relativePath.split('/'));
    assertSafeTarget(absolutePath, IMAGE_ROOT);
    const existing = assets.get(relativePath);
    if (existing && !existing.equals(bytes)) abort(`Colisión de imagen para ${code}.`);
    assets.set(relativePath, bytes);
    return relativePath;
  }

  pkg.changes.added = pkg.changes.added.map(product => ({
    ...product,
    image: materialize(product.code, product.image)
  }));
  for (const [code, patch] of Object.entries(pkg.changes.edits)) {
    if (Object.prototype.hasOwnProperty.call(patch, 'image')) patch.image = materialize(code, patch.image);
  }
  return { pkg, assets };
}

function updatedImageMap(current, changes) {
  const next = { ...current };
  changes.added.forEach(product => {
    if (product.image) next[product.code] = product.image;
  });
  Object.entries(changes.edits).forEach(([code, patch]) => {
    if (patch.image) next[code] = patch.image;
  });
  return next;
}

function writeAtomically(target, content) {
  assertSafeTarget(target);
  const suffix = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const temporary = `${target}.tmp-${suffix}`;
  const backup = `${target}.bak-${suffix}`;
  assertSafeTarget(temporary);
  assertSafeTarget(backup);
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  let movedOriginal = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedOriginal = true;
    }
    fs.renameSync(temporary, target);
    if (movedOriginal) fs.unlinkSync(backup);
  } catch (error) {
    if (!fs.existsSync(target) && movedOriginal && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    if (fs.existsSync(backup) && fs.existsSync(target)) fs.unlinkSync(backup);
  }
}

function applyFiles(canonicalDocument, imageMap, assets) {
  const backups = new Map([
    [CANONICAL_PATH, fs.readFileSync(CANONICAL_PATH)],
    [IMAGE_MAP_PATH, fs.readFileSync(IMAGE_MAP_PATH)]
  ]);
  const createdImages = [];
  try {
    for (const [relativePath, bytes] of assets) {
      const target = path.resolve(ROOT, ...relativePath.split('/'));
      assertSafeTarget(target, IMAGE_ROOT);
      if (fs.existsSync(target)) {
        const existingDigest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
        const expectedDigest = crypto.createHash('sha256').update(bytes).digest('hex');
        if (existingDigest !== expectedDigest) abort(`La imagen existente no coincide: ${relativePath}`);
      } else {
        fs.writeFileSync(target, bytes, { flag: 'wx' });
        createdImages.push(target);
      }
    }
    writeAtomically(IMAGE_MAP_PATH, JSON.stringify(imageMap, null, 2) + '\n');
    writeAtomically(CANONICAL_PATH, JSON.stringify(canonicalDocument, null, 2) + '\n');
  } catch (error) {
    for (const [target, bytes] of backups) fs.writeFileSync(target, bytes);
    for (const target of createdImages) if (fs.existsSync(target)) fs.unlinkSync(target);
    throw error;
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const headCommit = assertRepositoryState(args.mode);
  const stat = fs.statSync(args.packagePath);
  if (!stat.isFile() || stat.size > MAX_PACKAGE_BYTES) abort('El paquete no es un archivo válido o supera 25 MiB.');

  const originalPackage = globalThis.AdminPackage.validatePackage(readJson(args.packagePath));
  if (originalPackage.base.repository !== EXPECTED_REPOSITORY) abort('El paquete pertenece a otro repositorio.');
  if (args.mode === 'apply' && args.confirm !== originalPackage.packageId) abort('La confirmación no coincide con packageId.');
  assertBaseCommit(originalPackage.base.commit, headCommit);

  const canonical = globalThis.AdminPackage.validateCanonicalDocument(readJson(CANONICAL_PATH));
  const originalDigest = await globalThis.AdminPackage.sha256Hex(globalThis.AdminPackage.stableStringify(originalPackage));
  const materialized = materializeImages(originalPackage);
  const result = await globalThis.AdminPackage.applyPackageToCanonical(canonical, materialized.pkg, {
    sourceCommit: headCommit,
    packageSha256: originalDigest
  });
  const imageMap = updatedImageMap(readJson(IMAGE_MAP_PATH), materialized.pkg.changes);

  const summary = {
    mode: args.mode,
    packageId: originalPackage.packageId,
    packageSha256: originalDigest,
    baseCommit: originalPackage.base.commit,
    headCommit,
    alreadyApplied: result.alreadyApplied,
    nextRevision: result.document.revision,
    changes: originalPackage.meta,
    imagesToMaterialize: materialized.assets.size,
    writes: result.alreadyApplied ? [] : [
      'src/data/admin-state.json',
      ...(materialized.assets.size ? ['imagenes/admin_*'] : []),
      ...(JSON.stringify(imageMap) !== JSON.stringify(readJson(IMAGE_MAP_PATH)) ? ['code_to_image.json'] : [])
    ],
    authenticityWarning: 'SHA-256 detecta cambios y duplicados; no autentica autoría ni identidad. Requiere revisión humana.'
  };

  if (args.mode === 'apply' && !result.alreadyApplied) applyFiles(result.document, imageMap, materialized.assets);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
