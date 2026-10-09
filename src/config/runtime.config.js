(function configureBianiRuntime(root) {
  'use strict';

  const fixedConfig = Object.freeze({
    TEST_MODE: true,
    artifact: 'codex-desarrollo-commercial-test'
  });

  Object.defineProperty(root, 'BIANI_RUNTIME_CONFIG', {
    value: fixedConfig,
    enumerable: true,
    writable: false,
    configurable: false
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
