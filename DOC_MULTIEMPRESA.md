# 🏢 Guía de Despliegue Multiempresa / Multi-Tenant

El catálogo está diseñado con una arquitectura separada entre lógica, interfaz y configuración. Esto permite reutilizar el 100% del código fuente para crear catálogos digitales para **otras distribuidoras o comercios mayoristas** en cuestión de minutos.

---

## 🛠️ Pasos para crear una instancia para otra distribuidora

### 1. Clonar el Repositorio
Crea un nuevo repositorio en GitHub para la nueva distribuidora (ejemplo: `catalogo-distribuidora-x`) y clona el proyecto.

### 2. Configurar `src/config/tenant.config.js`
Abre el archivo `src/config/tenant.config.js` y modifica las siguientes propiedades con la información del cliente:

```javascript
export const TENANT_CONFIG = {
  id: "distribuidora-ejemplo",
  name: "DISTRIBUIDORA EJEMPLO",
  fullName: "Catálogo Ejemplo · Mayorista",
  subtitle: "Pedidos Online & Lista de Precios",
  logoText: "E",
  
  // Teléfono de WhatsApp donde se recibirán los pedidos (formato internacional sin guiones ni +)
  whatsappNumber: "5491122334455",
  contactEmail: "ventas@ejemplo.com.ar",
  address: "Buenos Aires, Argentina",
  salesConditions: "Venta mayorista. Pedido mínimo $ 10.000.",
  
  // ID de la planilla de Google Sheets pública del nuevo cliente
  defaultSheetId: "NUEVO_ID_DE_GOOGLE_SHEETS",
  
  // Pedido mínimo (0 para desactivar)
  minOrderAmount: 10000,
  
  // Pin de acceso para panel interno
  adminPin: "1234"
};
```

### 3. Cargar las Fotos y Fallback Inicial
1. Coloca las imágenes del nuevo cliente dentro de la carpeta `imagenes/`.
2. Actualiza `products_fallback.json` con los productos iniciales y `code_to_image.json` con los nombres de archivo.

### 4. Configurar la Hoja de Google Sheets del Cliente
La planilla de Google Sheets del nuevo cliente debe ser pública ("Cualquier persona con el enlace - Lector") y contener los encabezados:
- **Columna A**: `Código`
- **Columna B**: `Articulo`
- **Columna C**: `Precio`
- **Columna D** *(Opcional)*: `Categoría`
- **Columna E** *(Opcional)*: `Cantidad Minima`

### 5. Validar y Desplegar
Ejecuta las pruebas locales:
```bash
npm run validate
```
Al hacer `git push origin main`, GitHub Actions ejecutará automáticamente los tests y desplegará el nuevo catálogo en GitHub Pages.

---

## 🎨 Personalización de Colores (CSS)
Para cambiar la paleta de colores del cliente, edita las variables en la parte superior de `src/ui/styles.css`:

```css
:root {
  --az: #0f172a;       /* Color de encabezado y botones principales */
  --vd: #10b981;       /* Color de acento / éxito */
  --rd: #ef4444;       /* Color de alertas / insumos */
}
```
