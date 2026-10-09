#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'dist-qa');
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const REQUIRED_FILES = [
  '.nojekyll',
  'index.html',
  'icon-192.png',
  'icon-512.png',
  'code_to_category.json',
  'code_to_description.json',
  'code_to_image.json',
  'products_fallback.json'
];
const REQUIRED_DIRECTORIES = ['src', 'imagenes'];

function abort(message) {
  throw new Error(message);
}

function assertInsideRoot(target, root) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    abort('Ruta fuera del directorio permitido: ' + target);
  }
}

function copyFile(source, destination) {
  assertInsideRoot(source, ROOT);
  assertInsideRoot(destination, OUTPUT);
  const stats = fs.lstatSync(source);
  if (stats.isSymbolicLink()) abort('No se permiten enlaces simbólicos: ' + source);
  if (!stats.isFile()) abort('Se esperaba un archivo: ' + source);
  if (stats.size > MAX_FILE_BYTES) abort('Archivo mayor a 25 MiB: ' + source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  assertInsideRoot(source, ROOT);
  assertInsideRoot(destination, OUTPUT);
  const stats = fs.lstatSync(source);
  if (stats.isSymbolicLink()) abort('No se permiten enlaces simbólicos: ' + source);
  if (!stats.isDirectory()) abort('Se esperaba un directorio: ' + source);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const childSource = path.join(source, entry.name);
    const childDestination = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) abort('No se permiten enlaces simbólicos: ' + childSource);
    if (entry.isDirectory()) copyDirectory(childSource, childDestination);
    else if (entry.isFile()) copyFile(childSource, childDestination);
    else abort('Tipo de archivo no permitido: ' + childSource);
  }
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(target));
    else if (entry.isFile()) files.push(target);
    else abort('Tipo de archivo no permitido en el artefacto: ' + target);
  }
  return files;
}

function assertTestMode() {
  const runtimePath = path.join(ROOT, 'src', 'config', 'runtime.config.js');
  const controllerPath = path.join(ROOT, 'src', 'ui', 'test-mode.controller.js');
  const servicePath = path.join(ROOT, 'src', 'services', 'test-mode.service.js');
  const indexPath = path.join(ROOT, 'index.html');
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  const controller = fs.readFileSync(controllerPath, 'utf8');
  const service = fs.readFileSync(servicePath, 'utf8');
  const html = fs.readFileSync(indexPath, 'utf8');

  if (!/TEST_MODE:\s*true/.test(runtime)) abort('TEST_MODE no está fijado en true.');
  if (!/Object\.freeze/.test(runtime) || !/writable:\s*false/.test(runtime) || !/configurable:\s*false/.test(runtime)) {
    abort('La configuración TEST_MODE no está inmovilizada.');
  }
  if (/location\.search|URLSearchParams/.test(runtime + controller)) {
    abort('TEST_MODE no puede depender de parámetros de URL.');
  }
  if (!controller.includes('CATÁLOGO DE PRUEBA — PEDIDOS NO ENVIADOS')) {
    abort('Falta la identificación permanente del catálogo de prueba.');
  }
  for (const target of ['wa.me', 'api.whatsapp.com', 'whatsapp:']) {
    if (!service.includes(target)) abort('Falta bloquear el destino ' + target);
  }
  if (!html.includes('src/config/runtime.config.js') ||
      !html.includes('src/services/test-mode.service.js') ||
      !html.includes('src/ui/test-mode.controller.js')) {
    abort('El catálogo no carga todos los controles de TEST_MODE.');
  }
  if (/<a\s+href=["'](?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com)|<a\s+href=["']whatsapp:/i.test(html)) {
    abort('El HTML contiene un enlace navegable a WhatsApp.');
  }
}

function assertNoBrowserWrites(files) {
  const forbidden = [
    /api\.github\.com/i,
    /github_pat_/i,
    /Authorization\s*:\s*['"](?:token|Bearer)/i,
    /repos\/[^\s'"]+\/contents/i
  ];
  for (const file of files) {
    if (!/\.(?:html|js)$/i.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(source)) abort('Operación GitHub no permitida en el artefacto: ' + path.relative(OUTPUT, file));
    }
  }
}

assertTestMode();

if (fs.existsSync(OUTPUT)) fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });

for (const relative of REQUIRED_FILES) {
  const source = path.join(ROOT, relative);
  if (!fs.existsSync(source)) abort('Falta archivo requerido: ' + relative);
  copyFile(source, path.join(OUTPUT, relative));
}
for (const relative of REQUIRED_DIRECTORIES) {
  const source = path.join(ROOT, relative);
  if (!fs.existsSync(source)) abort('Falta directorio requerido: ' + relative);
  copyDirectory(source, path.join(OUTPUT, relative));
}

fs.writeFileSync(path.join(OUTPUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
fs.writeFileSync(
  path.join(OUTPUT, '_headers'),
  '/*\n' +
    '  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet\n' +
    '  X-Content-Type-Options: nosniff\n' +
    '  Referrer-Policy: no-referrer\n' +
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()\n',
  'utf8'
);

let files = walkFiles(OUTPUT);
if (files.length > MAX_FILES) abort('El artefacto supera el límite gratuito de 20.000 archivos.');
for (const file of files) {
  if (fs.statSync(file).size > MAX_FILE_BYTES) abort('Archivo mayor a 25 MiB: ' + file);
}
assertNoBrowserWrites(files);

const manifest = {
  kind: 'biani-qa-build',
  schemaVersion: 1,
  testMode: true,
  sourceBranch: process.env.GITHUB_REF_NAME || 'codex-desarrollo',
  sourceCommit: process.env.GITHUB_SHA || 'local',
  project: 'biani-qa',
  fileCount: files.length
};
fs.writeFileSync(path.join(OUTPUT, 'qa-build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
files = walkFiles(OUTPUT);
if (files.length > MAX_FILES) abort('El artefacto final supera el límite gratuito de archivos.');
if (fs.existsSync(path.join(OUTPUT, 'CNAME'))) abort('El artefacto QA no debe contener CNAME.');

console.log('Artefacto QA validado:', JSON.stringify({
  output: path.relative(ROOT, OUTPUT),
  files: files.length,
  testMode: true,
  sourceCommit: manifest.sourceCommit
}));
