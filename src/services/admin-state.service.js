function codeOf(value) {
  return String(value ?? '').trim();
}

function uniqueCodes(values) {
  const seen = new Set();
  const result = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    const code = codeOf(value);
    if (!code || seen.has(code)) return;
    seen.add(code);
    result.push(code);
  });
  return result;
}

function validProduct(value) {
  return value && typeof value === 'object' && codeOf(value.code);
}

function normalizeAdminState(rawState = {}) {
  const addedByCode = new Map();
  (Array.isArray(rawState.added) ? rawState.added : []).forEach(product => {
    if (!validProduct(product)) return;
    const code = codeOf(product.code);
    addedByCode.set(code, { ...product, code, qty: 0, outOfStock: false });
  });

  const edits = {};
  if (rawState.edits && typeof rawState.edits === 'object' && !Array.isArray(rawState.edits)) {
    Object.entries(rawState.edits).forEach(([rawCode, patch]) => {
      const code = codeOf(rawCode);
      if (!code || !patch || typeof patch !== 'object' || Array.isArray(patch)) return;
      edits[code] = { ...patch };
    });
  }

  return {
    added: [...addedByCode.values()],
    edits,
    deleted: uniqueCodes(rawState.deleted),
    order: uniqueCodes(rawState.order)
  };
}

function parseStoredJson(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function readAdminState(storage, keys) {
  return normalizeAdminState({
    added: parseStoredJson(storage, keys.add, []),
    edits: parseStoredJson(storage, keys.edits, {}),
    deleted: parseStoredJson(storage, keys.del, []),
    order: parseStoredJson(storage, keys.order, [])
  });
}

function writeAdminState(storage, keys, rawState) {
  const state = normalizeAdminState(rawState);
  storage.setItem(keys.add, JSON.stringify(state.added));
  storage.setItem(keys.edits, JSON.stringify(state.edits));
  storage.setItem(keys.del, JSON.stringify(state.deleted));
  storage.setItem(keys.order, JSON.stringify(state.order));
  return state;
}

function reconstructCatalog(baseProducts, canonicalEdits, rawState, fallbackOrder = []) {
  const state = normalizeAdminState(rawState);
  const productByCode = new Map();
  const initialOrder = [];

  (Array.isArray(baseProducts) ? baseProducts : []).forEach(product => {
    if (!validProduct(product)) return;
    const code = codeOf(product.code);
    if (!productByCode.has(code)) initialOrder.push(code);
    productByCode.set(code, { ...product, code });
  });

  const applyEdits = edits => {
    Object.entries(edits || {}).forEach(([rawCode, patch]) => {
      const code = codeOf(rawCode);
      const current = productByCode.get(code);
      if (!current || !patch || typeof patch !== 'object') return;
      productByCode.set(code, { ...current, ...patch, code });
    });
  };

  applyEdits(canonicalEdits);

  state.added.forEach(product => {
    const code = codeOf(product.code);
    const current = productByCode.get(code);
    if (!current) initialOrder.push(code);
    productByCode.set(code, { ...(current || {}), ...product, code, qty: 0, outOfStock: false });
  });

  applyEdits(state.edits);

  const deleted = new Set(state.deleted);
  deleted.forEach(code => productByCode.delete(code));

  const preferredOrder = state.order.length ? state.order : uniqueCodes(fallbackOrder);
  const result = [];
  const emitted = new Set();
  preferredOrder.forEach(code => {
    const product = productByCode.get(code);
    if (!product || emitted.has(code)) return;
    emitted.add(code);
    result.push({ ...product });
  });
  initialOrder.forEach(code => {
    const product = productByCode.get(code);
    if (!product || emitted.has(code)) return;
    emitted.add(code);
    result.push({ ...product });
  });

  return result;
}

function recordAddedProduct(rawState, product, currentOrder = []) {
  if (!validProduct(product)) throw new Error('El producto agregado es inválido.');
  const state = normalizeAdminState(rawState);
  const code = codeOf(product.code);
  state.added = state.added.filter(item => item.code !== code);
  state.added.unshift({ ...product, code, qty: 0, outOfStock: false });
  delete state.edits[code];
  state.deleted = state.deleted.filter(item => item !== code);
  state.order = uniqueCodes(currentOrder.length ? currentOrder : [code, ...state.order]);
  return normalizeAdminState(state);
}

function recordProductEdit(rawState, codeValue, patch) {
  const state = normalizeAdminState(rawState);
  const code = codeOf(codeValue);
  if (!code || !patch || typeof patch !== 'object') throw new Error('La edición es inválida.');
  const addedIndex = state.added.findIndex(product => product.code === code);
  if (addedIndex !== -1) {
    state.added[addedIndex] = { ...state.added[addedIndex], ...patch, code, qty: 0, outOfStock: false };
    delete state.edits[code];
  } else {
    state.edits[code] = { ...(state.edits[code] || {}), ...patch };
  }
  state.deleted = state.deleted.filter(item => item !== code);
  return normalizeAdminState(state);
}

function recordProductDeletion(rawState, codeValue) {
  const state = normalizeAdminState(rawState);
  const code = codeOf(codeValue);
  if (!code) throw new Error('El código eliminado es inválido.');
  state.added = state.added.filter(product => product.code !== code);
  delete state.edits[code];
  state.deleted = uniqueCodes([...state.deleted, code]);
  state.order = state.order.filter(item => item !== code);
  return normalizeAdminState(state);
}

function recordOrder(rawState, codes) {
  const state = normalizeAdminState(rawState);
  state.order = uniqueCodes(codes);
  return state;
}

const AdminState = {
  normalizeAdminState,
  readAdminState,
  writeAdminState,
  reconstructCatalog,
  recordAddedProduct,
  recordProductEdit,
  recordProductDeletion,
  recordOrder
};

if (typeof window !== 'undefined') window.AdminState = AdminState;
else globalThis.AdminState = AdminState;
