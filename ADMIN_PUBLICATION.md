# Publicación administrativa segura

## Alcance de esta etapa

El catálogo público permite editar y ordenar productos en el navegador, pero esos cambios permanecen en el almacenamiento local hasta que se exportan. El PIN visible en la aplicación es únicamente una barrera contra accesos accidentales: está incluido en el código público, no identifica al operador y no constituye autenticación ni autorización.

El navegador no solicita credenciales de GitHub, no conserva tokens y no realiza operaciones de escritura contra GitHub. La publicación se hace desde un checkout confiable, después de revisión humana.

## Contenido del paquete

La descarga `biani-admin-package.json` tiene esquema versionado e incluye:

- commit, rama, repositorio y revisión administrativa de origen;
- altas completas;
- ediciones;
- bajas;
- orden completo del catálogo;
- imágenes nuevas embebidas temporalmente;
- identificador, fecha y resumen del paquete;
- huella SHA-256 del estado canónico de origen.

Las huellas SHA-256 sirven para detectar cambios, conflictos y reimportaciones. No demuestran quién creó el archivo ni convierten al paquete en confiable. El archivo debe tratarse como entrada no confiable y revisarse antes de aplicarlo.

## Procedimiento exacto

1. En el catálogo, entrar al modo de edición local y seleccionar **Exportar cambios**.
2. Conservar `biani-admin-package.json` fuera del repositorio. La exportación no borra los cambios pendientes del navegador.
3. Abrir un checkout limpio de `codex-desarrollo` y actualizarlo mediante avance rápido desde `origin/codex-desarrollo`.
4. Confirmar que la rama activa sea `codex-desarrollo` y que no existan cambios locales.
5. Copiar el `packageId` del paquete y ejecutar la simulación:

   ```powershell
   npm run admin:package:check -- "C:\ruta\biani-admin-package.json"
   ```

6. Revisar el resumen completo: commit base, altas, ediciones, bajas, orden, imágenes, archivos que se escribirán y advertencia de autenticidad.
7. Si el resumen es correcto, aplicar indicando expresamente el identificador revisado:

   ```powershell
   npm run admin:package:apply -- --confirm "PACKAGE_ID" "C:\ruta\biani-admin-package.json"
   ```

8. Revisar el diff. El aplicador sólo puede escribir `src/data/admin-state.json`, `code_to_image.json` e imágenes deterministas dentro de `imagenes/`. No modifica `products_fallback.json`, precios base ni otros productos.
9. Ejecutar:

   ```powershell
   npm run lint
   npm run test
   npm run test:e2e
   ```

10. Crear un commit en `codex-desarrollo` y subir exclusivamente esa rama.
11. Verificar que GitHub Actions finalice correctamente. El trabajo de validación funciona con `contents: read`; el trabajo de despliegue conserva permisos de Pages sólo para `main`.
12. Descargar o abrir el `src/data/admin-state.json` confirmado en la rama publicada.
13. En el mismo navegador donde se exportó, seleccionar **Confirmar paquete publicado** y elegir ese archivo. La aplicación borra los pendientes únicamente si encuentra el mismo `packageId` y la misma huella, y sólo si no hubo cambios locales posteriores. Si hubo cambios posteriores, los conserva.

## Controles del aplicador

El aplicador:

- exige la rama `codex-desarrollo`;
- exige un checkout limpio para escribir;
- comprueba que el commit base sea ancestro del HEAD;
- detecta revisiones canónicas obsoletas;
- rechaza identificadores reutilizados con contenido diferente;
- impide rutas absolutas, recorridos `..` y enlaces simbólicos;
- limita el paquete a 25 MiB, cada imagen a 5 MiB y el total de imágenes a 20 MiB;
- valida MIME, base64 y firma binaria de PNG, JPEG, WebP, GIF y AVIF;
- materializa imágenes con nombres derivados de SHA-256;
- conserva archivos de imágenes anteriores y registros de bajas;
- puede reimportar el mismo paquete sin duplicar operaciones.

El estado canónico se aplica después de Google Sheets, fallback y actualizaciones de PDF, y antes de cambios locales pendientes. Por eso una baja publicada no reaparece tras sincronizar y el orden administrativo publicado no es reemplazado por el orden de un PDF.
