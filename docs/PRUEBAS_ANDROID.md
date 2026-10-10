# Prueba comercial segura en un celular Android

Este procedimiento usa el artefacto fijo de `codex-desarrollo`. La configuración
`src/config/runtime.config.js` activa `TEST_MODE` en el archivo, no mediante la
URL. Los parámetros de consulta no pueden apagarlo.

## Requisitos

- PC y celular Android conectados a la misma red Wi-Fi privada.
- Python 3 instalado en la PC.
- Un checkout limpio de `codex-desarrollo` actualizado al SHA autorizado.
- No abrir puertos en el router ni usar túneles públicos.

## Iniciar el catálogo

1. Abrir PowerShell dentro de la carpeta raíz del repositorio.
2. Confirmar la rama y el SHA:

   ```powershell
   git branch --show-current
   git rev-parse HEAD
   git status --short
   ```

3. Iniciar el servidor sólo para la sesión de prueba:

   ```powershell
   python -m http.server 4173 --bind 0.0.0.0
   ```

4. Si Windows muestra el aviso del firewall, permitir acceso únicamente en redes
   privadas.
5. En otra ventana de PowerShell ejecutar `ipconfig` y copiar la dirección IPv4
   del adaptador Wi-Fi, por ejemplo `192.168.1.25`.
6. En Chrome del celular abrir:

   ```text
   http://192.168.1.25:4173/index.html
   ```

7. Verificar antes de probar que la franja superior muestre exactamente:
   **CATÁLOGO DE PRUEBA — PEDIDOS NO ENVIADOS**.
8. Agregar productos, completar el cliente y pulsar **Revisar pedido (no se
   envía)**. Debe aparecer una vista previa dentro del catálogo. No debe abrirse
   WhatsApp.
9. Usar **Copiar texto del pedido** para revisar códigos, modos, cantidades,
   precios y formato. En HTTP local, si el portapapeles seguro del navegador no
   está disponible, se utiliza la copia compatible del campo de vista previa.
10. Al terminar, volver a PowerShell y detener el servidor con `Ctrl+C`.

## Controles de seguridad

- No usar una URL pública ni publicar el puerto 4173 en Internet.
- No cambiar `TEST_MODE` durante la sesión.
- Agregar `?testMode=false`, `?TEST_MODE=0` u otros parámetros no altera el modo.
- El enlace flotante de contacto queda deshabilitado.
- El carrito y los datos permitidos del cliente permanecen sólo en el navegador
  del dispositivo de prueba.
- Para repetir desde cero, borrar los datos del sitio en Chrome Android.
