(function (root) {
  'use strict';

  const KIND = 'biani-admin-package';
  const CANONICAL_KIND = 'biani-admin-state';
  const SCHEMA_VERSION = 1;
  const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_CHANGES = 10000;
  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
  const ALLOWED_PATCH_FIELDS = new Set([
    'name', 'price', 'category', 'image', 'unidad_min', 'outOfStock', 'sale_modes',
    'unit_price', 'unit_min', 'display_price', 'display_min', 'units_per_display',
    'sale_mode', 'brand'
  ]);

  function fail(message) {
    throw new Error(message);
  }

  function plainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function assertNoDangerousKeys(value, path = 'paquete') {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        fail(`Clave peligrosa en ${path}: ${key}`);
      }
      assertNoDangerousKeys(value[key], `${path}.${key}`);
    }
  }

  function codeOf(value) {
    const code = String(value ?? '').trim();
    if (!code || code.length > 120 || /[\\/\0]/.test(code)) fail('Código de producto inválido.');
    return code;
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(String(value)).byteLength;
  }

  function base64Bytes(value) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) fail('Imagen base64 inválida.');
    return Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  }

  function validateImage(value) {
    if (value == null || value === '') return { value: '', bytes: 0 };
    if (typeof value !== 'string') fail('La imagen debe ser texto.');
    if (value.startsWith('data:')) {
      const match = value.match(/^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || !ALLOWED_IMAGE_TYPES.has(match[1])) fail('Formato de imagen embebida no permitido.');
      const bytes = base64Bytes(match[2]);
      if (bytes > MAX_IMAGE_BYTES) fail('Una imagen supera el límite de 5 MiB.');
      return { value, bytes };
    }
    if (!/^imagenes\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.includes('..') || value.includes('//')) {
      fail('Ruta de imagen no permitida.');
    }
    return { value, bytes: 0 };
  }

  function validateNumber(value, field, options = {}) {
    if (!Number.isFinite(value)) fail(`${field} debe ser numérico.`);
    if (options.positive && value <= 0) fail(`${field} debe ser mayor que cero.`);
    if (options.integer && !Number.isInteger(value)) fail(`${field} debe ser entero.`);
    return value;
  }

  function sanitizePatch(rawPatch, path) {
    if (!plainObject(rawPatch)) fail(`${path} debe ser un objeto.`);
    const patch = {};
    let imageBytes = 0;
    for (const [key, value] of Object.entries(rawPatch)) {
      if (!ALLOWED_PATCH_FIELDS.has(key)) fail(`Campo administrativo no permitido: ${path}.${key}`);
      if (key === 'image') {
        const image = validateImage(value);
        patch.image = image.value;
        imageBytes += image.bytes;
      } else if (key === 'price') {
        patch.price = validateNumber(value, `${path}.price`, { positive: true });
      } else if (key === 'unidad_min' || key === 'unit_min' || key === 'units_per_display') {
        patch[key] = validateNumber(value, `${path}.${key}`, { positive: true, integer: true });
      } else if (key === 'outOfStock') {
        if (typeof value !== 'boolean') fail(`${path}.outOfStock debe ser booleano.`);
        patch.outOfStock = value;
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value) || value === null) {
        patch[key] = value;
      } else {
        fail(`Valor no permitido en ${path}.${key}`);
      }
    }
    if (!Object.keys(patch).length) fail(`${path} no contiene cambios.`);
    return { patch, imageBytes };
  }

  function sanitizeProduct(rawProduct, path) {
    if (!plainObject(rawProduct)) fail(`${path} debe ser un producto.`);
    const code = codeOf(rawProduct.code);
    const name = String(rawProduct.name ?? '').trim();
    const category = String(rawProduct.category ?? '').trim();
    if (!name || name.length > 500) fail(`${path}.name es inválido.`);
    if (!category || category.length > 200) fail(`${path}.category es inválido.`);
    const price = validateNumber(rawProduct.price, `${path}.price`, { positive: true });
    const image = validateImage(rawProduct.image || '');
    const product = {
      code,
      name,
      price,
      category,
      image: image.value,
      qty: 0,
      outOfStock: false,
      unidad_min: rawProduct.unidad_min == null ? 1 : validateNumber(rawProduct.unidad_min, `${path}.unidad_min`, { positive: true, integer: true })
    };
    for (const key of ALLOWED_PATCH_FIELDS) {
      if (['name', 'price', 'category', 'image', 'unidad_min', 'outOfStock'].includes(key)) continue;
      if (Object.prototype.hasOwnProperty.call(rawProduct, key)) product[key] = rawProduct[key];
    }
    return { product, imageBytes: image.bytes };
  }

  function uniqueCodes(values, path) {
    if (!Array.isArray(values)) fail(`${path} debe ser una lista.`);
    if (values.length > MAX_CHANGES) fail(`${path} supera el límite permitido.`);
    const result = [];
    const seen = new Set();
    values.forEach((value, index) => {
      const code = codeOf(value);
      if (seen.has(code)) fail(`Código duplicado en ${path}: ${code}`);
      seen.add(code);
      result.push(code);
    });
    return result;
  }

  function validateState(rawState, path = 'changes') {
    if (!plainObject(rawState)) fail(`${path} debe ser un objeto.`);
    const rawAdded = rawState.added;
    const rawEdits = rawState.edits;
    const rawDeleted = rawState.deleted;
    const rawOrder = rawState.order;
    if (!Array.isArray(rawAdded) || !plainObject(rawEdits) || !Array.isArray(rawDeleted) || !Array.isArray(rawOrder)) {
      fail(`${path} debe contener added, edits, deleted y order.`);
    }
    if (rawAdded.length > MAX_CHANGES || Object.keys(rawEdits).length > MAX_CHANGES) fail('El paquete contiene demasiados cambios.');

    const added = [];
    const addedCodes = new Set();
    let imageBytes = 0;
    rawAdded.forEach((value, index) => {
      const sanitized = sanitizeProduct(value, `${path}.added[${index}]`);
      if (addedCodes.has(sanitized.product.code)) fail(`Alta duplicada: ${sanitized.product.code}`);
      addedCodes.add(sanitized.product.code);
      added.push(sanitized.product);
      imageBytes += sanitized.imageBytes;
    });

    const edits = {};
    for (const [rawCode, value] of Object.entries(rawEdits)) {
      const code = codeOf(rawCode);
      if (addedCodes.has(code)) fail(`El código ${code} no puede estar en altas y ediciones.`);
      const sanitized = sanitizePatch(value, `${path}.edits.${code}`);
      edits[code] = sanitized.patch;
      imageBytes += sanitized.imageBytes;
    }

    const deleted = uniqueCodes(rawDeleted, `${path}.deleted`);
    const deletedSet = new Set(deleted);
    for (const code of deleted) {
      if (addedCodes.has(code) || Object.prototype.hasOwnProperty.call(edits, code)) {
        fail(`El código ${code} tiene operaciones incompatibles.`);
      }
    }
    const order = uniqueCodes(rawOrder, `${path}.order`);
    if (imageBytes > MAX_TOTAL_IMAGE_BYTES) fail('Las imágenes del paquete superan el límite total de 20 MiB.');
    return { state: { added, edits, deleted, order }, imageBytes };
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (plainObject(value)) {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  async function sha256Hex(value) {
    if (!root.crypto || !root.crypto.subtle) fail('SHA-256 no está disponible en este entorno.');
    const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function validateBase(rawBase) {
    if (!plainObject(rawBase)) fail('Falta la referencia base.');
    const repository = String(rawBase.repository || '').trim();
    const branch = String(rawBase.branch || '').trim();
    const commit = String(rawBase.commit || '').trim().toLowerCase();
    const adminRevision = rawBase.adminRevision;
    const adminStateSha256 = String(rawBase.adminStateSha256 || '').toLowerCase();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('Repositorio base inválido.');
    if (branch !== 'codex-desarrollo') fail('La rama base debe ser codex-desarrollo.');
    if (!/^[0-9a-f]{40}$/.test(commit)) fail('Commit base inválido.');
    if (!Number.isInteger(adminRevision) || adminRevision < 0) fail('Revisión administrativa base inválida.');
    if (!/^[0-9a-f]{64}$/.test(adminStateSha256)) fail('Huella del estado base inválida.');
    return { repository, branch, commit, adminRevision, adminStateSha256 };
  }

  function validatePackage(rawPackage) {
    assertNoDangerousKeys(rawPackage);
    if (!plainObject(rawPackage)) fail('El paquete debe ser un objeto JSON.');
    const rawText = JSON.stringify(rawPackage);
    if (utf8Bytes(rawText) > MAX_PACKAGE_BYTES) fail('El paquete supera el límite de 25 MiB.');
    if (rawPackage.kind !== KIND || rawPackage.schemaVersion !== SCHEMA_VERSION) fail('Tipo o versión de paquete no compatible.');
    const packageId = String(rawPackage.packageId || '');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$/.test(packageId)) fail('Identificador de paquete inválido.');
    const exportedAt = String(rawPackage.exportedAt || '');
    if (!exportedAt || Number.isNaN(Date.parse(exportedAt))) fail('Fecha de exportación inválida.');
    const base = validateBase(rawPackage.base);
    const validated = validateState(rawPackage.changes, 'changes');
    return {
      kind: KIND,
      schemaVersion: SCHEMA_VERSION,
      packageId,
      exportedAt,
      base,
      changes: validated.state,
      meta: {
        added: validated.state.added.length,
        edited: Object.keys(validated.state.edits).length,
        deleted: validated.state.deleted.length,
        ordered: validated.state.order.length,
        embeddedImageBytes: validated.imageBytes
      }
    };
  }

  function validateCanonicalDocument(rawDocument) {
    assertNoDangerousKeys(rawDocument, 'estado canónico');
    if (!plainObject(rawDocument) || rawDocument.kind !== CANONICAL_KIND || rawDocument.schemaVersion !== SCHEMA_VERSION) {
      fail('Estado administrativo canónico no compatible.');
    }
    if (!Number.isInteger(rawDocument.revision) || rawDocument.revision < 0) fail('Revisión canónica inválida.');
    const sourceCommit = String(rawDocument.sourceCommit || '').toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(sourceCommit)) fail('Commit de origen canónico inválido.');
    const validated = validateState(rawDocument.state, 'state');
    const appliedPackages = Array.isArray(rawDocument.appliedPackages) ? rawDocument.appliedPackages.map((entry, index) => {
      if (!plainObject(entry)) fail(`Registro de paquete inválido en appliedPackages[${index}].`);
      const packageId = String(entry.packageId || '');
      const sha256 = String(entry.sha256 || '').toLowerCase();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$/.test(packageId) || !/^[0-9a-f]{64}$/.test(sha256)) {
        fail('Registro de paquete aplicado inválido.');
      }
      return {
        packageId,
        sha256,
        appliedAt: String(entry.appliedAt || ''),
        baseCommit: String(entry.baseCommit || '').toLowerCase()
      };
    }) : [];
    return {
      kind: CANONICAL_KIND,
      schemaVersion: SCHEMA_VERSION,
      revision: rawDocument.revision,
      sourceCommit,
      updatedAt: rawDocument.updatedAt == null ? null : String(rawDocument.updatedAt),
      appliedPackages,
      state: validated.state
    };
  }

  function randomId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  }

  async function buildPackage(rawState, options) {
    const validated = validateState(rawState, 'changes').state;
    const canonical = validateCanonicalDocument(options.canonicalDocument);
    const adminStateSha256 = await sha256Hex(stableStringify(canonical.state));
    return validatePackage({
      kind: KIND,
      schemaVersion: SCHEMA_VERSION,
      packageId: options.packageId || randomId(),
      exportedAt: options.exportedAt || new Date().toISOString(),
      base: {
        repository: options.repository,
        branch: 'codex-desarrollo',
        commit: canonical.sourceCommit,
        adminRevision: canonical.revision,
        adminStateSha256
      },
      changes: validated
    });
  }

  function mergeStates(rawCanonicalState, incomingState) {
    const admin = root.AdminState;
    if (!admin) fail('AdminState no está disponible.');
    let state = admin.normalizeAdminState(rawCanonicalState);
    incomingState.deleted.forEach(code => { state = admin.recordProductDeletion(state, code); });
    incomingState.added.forEach(product => { state = admin.recordAddedProduct(state, product, state.order); });
    Object.entries(incomingState.edits).forEach(([code, patch]) => { state = admin.recordProductEdit(state, code, patch); });
    if (incomingState.order.length) state = admin.recordOrder(state, incomingState.order);
    return admin.normalizeAdminState(state);
  }

  async function applyPackageToCanonical(rawCanonical, rawPackage, options = {}) {
    const canonical = validateCanonicalDocument(rawCanonical);
    const pkg = validatePackage(rawPackage);
    const packageSha256 = options.packageSha256 || await sha256Hex(stableStringify(pkg));
    if (!/^[0-9a-f]{64}$/.test(packageSha256)) fail('Huella del paquete inválida.');
    const existing = canonical.appliedPackages.find(entry => entry.packageId === pkg.packageId);
    if (existing) {
      if (existing.sha256 !== packageSha256) fail('Conflicto: el identificador del paquete ya existe con otro contenido.');
      return { alreadyApplied: true, packageSha256, document: canonical };
    }
    const currentStateSha256 = await sha256Hex(stableStringify(canonical.state));
    if (pkg.base.adminRevision !== canonical.revision || pkg.base.adminStateSha256 !== currentStateSha256) {
      fail('Conflicto: el estado administrativo canónico cambió desde la exportación.');
    }
    const now = options.now || new Date().toISOString();
    const document = {
      ...canonical,
      revision: canonical.revision + 1,
      sourceCommit: options.sourceCommit || canonical.sourceCommit,
      updatedAt: now,
      appliedPackages: [...canonical.appliedPackages, {
        packageId: pkg.packageId,
        sha256: packageSha256,
        appliedAt: now,
        baseCommit: pkg.base.commit
      }],
      state: mergeStates(canonical.state, pkg.changes)
    };
    return { alreadyApplied: false, packageSha256, document: validateCanonicalDocument(document) };
  }

  function publishedEntry(rawCanonical, packageId, packageSha256) {
    const canonical = validateCanonicalDocument(rawCanonical);
    return canonical.appliedPackages.some(entry => entry.packageId === packageId && entry.sha256 === packageSha256);
  }

  root.AdminPackage = {
    KIND,
    CANONICAL_KIND,
    SCHEMA_VERSION,
    MAX_PACKAGE_BYTES,
    MAX_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    stableStringify,
    sha256Hex,
    validateImage,
    validateState,
    validatePackage,
    validateCanonicalDocument,
    buildPackage,
    mergeStates,
    applyPackageToCanonical,
    publishedEntry
  };
})(typeof window !== 'undefined' ? window : globalThis);
