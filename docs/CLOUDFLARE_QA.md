# Cloudflare Pages QA privado

El workflow `.github/workflows/deploy-qa.yml` valida y construye el catálogo de
pruebas en cada push a `codex-desarrollo`. El despliegue permanece bloqueado
hasta que Cloudflare Access esté configurado y la variable
`CLOUDFLARE_QA_ACCESS_READY` tenga el valor exacto `true`.

## Diseño de aislamiento

- Proyecto Pages independiente: `biani-qa`.
- Rama de producción ficticia del proyecto: `qa-production-disabled`.
- La rama `codex-desarrollo` se publica únicamente como preview.
- No se incluye `CNAME`; `biani.com.ar` no participa.
- El artefacto contiene `TEST_MODE: true`, bloqueo de WhatsApp, `robots.txt`
  con `Disallow: /` y encabezado `X-Robots-Tag: noindex, nofollow, noarchive,
  nosnippet`.
- El job de despliegue usa un entorno de GitHub denominado `biani-qa` y
  permisos `contents: read`.

## Preparación obligatoria antes del primer despliegue

1. Iniciar sesión en Cloudflare mediante el flujo oficial; no compartir
   contraseñas, códigos ni tokens por chat.
2. Crear un proyecto Pages Direct Upload vacío llamado `biani-qa`, con
   `qa-production-disabled` como rama de producción.
3. Antes de subir archivos, habilitar la política de Cloudflare Access para
   previews del proyecto.
4. Configurar una política Allow limitada a los correos o identidades
   autorizados. No utilizar una regla Everyone.
5. Abrir una ventana privada y confirmar que
   `https://codex-desarrollo.biani-qa.pages.dev/` exige autenticación. Si el
   proyecto asigna otro alias, verificar ese alias.
6. Crear un API Token de alcance mínimo: Account / Cloudflare Pages / Edit,
   limitado a la cuenta elegida.
7. En GitHub, crear el environment `biani-qa` y guardar allí:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
8. Crear la variable de repositorio `CLOUDFLARE_QA_ACCESS_READY=true` sólo
   después de completar y verificar Access.
9. Ejecutar manualmente el workflow **Validate and deploy private BIANI QA**.
10. Verificar nuevamente en incógnito que el enlace exige autenticación antes de
    distribuirlo.

Nunca crear el primer deployment antes de habilitar Access: los previews de
Pages son públicos por defecto.
