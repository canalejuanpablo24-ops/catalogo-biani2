# Catálogo Online BIANI

Este proyecto contiene un catálogo digital interactivo y responsivo listo para ser desplegado en **GitHub Pages**. Está integrado con **Google Sheets** como base de datos en tiempo real, permitiendo actualizar la lista de productos y precios al instante sin tocar el código. 

---

## 🛠️ Configuración de la Base de Datos (Google Sheets)

Para que el catálogo se actualice desde tu propia planilla de Google Sheets:

### 1. Crear tu planilla en Google Sheets
1. Entra a [Google Sheets](https://sheets.google.com) y crea una nueva hoja de cálculo.
2. Importa tu archivo de Excel `Documento de pablo canale (1).xlsx` (puedes arrastrarlo directamente a Google Drive y abrirlo como Google Sheets).
3. Asegúrate de que las columnas tengan los siguientes encabezados en la **primera fila (Fila 1)**:
   - **Columna A**: `Código` (número identificador del producto)
   - **Columna B**: `Articulo` (nombre del producto)
   - **Columna C**: `Categoría` *(opcional: si lo dejas vacío o no existe, el catálogo usará el mapeo de categorías inteligente precargado)*
   - **Columna D**: `Precio` (precio del producto. Soporta formato argentino como `12.345,67` o estándar `12345.67`)

### 2. Compartir la planilla públicamente
Para que el catálogo web pueda leer los datos de la planilla, debes darle permisos de lectura públicos:
1. En tu hoja de cálculo, haz clic en el botón azul **"Compartir"** (arriba a la derecha).
2. En la sección **"Acceso general"**, cambia de **"Restringido"** a **"Cualquier persona con el enlace"**.
3. Asegúrate de que el rol esté configurado como **"Lector"**.
4. Haz clic en **"Listo"**.

### 3. Obtener el ID de la Planilla
El ID de la planilla es el código de letras y números largo que aparece en la dirección (URL) de tu navegador, justo entre `/d/` y `/edit`.
Por ejemplo, en este enlace:
`https://docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I0J_klmNoPqRsTuVwXyZ/edit#gid=0`
El ID es: `1A2B3C4D5E6F7G8H9I0J_klmNoPqRsTuVwXyZ`

## 💻 Prueba Local (Antes de subir a GitHub)

Debido a las políticas de seguridad de los navegadores modernos (CORS), no es posible abrir el archivo `index.html` haciendo doble clic en él directamente (`file://`), ya que se bloqueará la carga de los archivos de base de datos locales (`products_fallback.json` y mapeos).

Para probar tu catálogo de forma local en tu computadora antes de subirlo:
1. Haz doble clic en el archivo **`iniciar_servidor.bat`** que se encuentra en esta carpeta.
2. Se abrirá una ventana de comandos de Windows que iniciará un servidor web local.
3. Abre tu navegador e ingresa a: **`http://localhost:8000`**
4. Para cerrar el servidor local cuando termines, simplemente cierra la ventana de comandos.

---

## 🚀 Despliegue en GitHub Pages

Para publicar tu catálogo online de forma gratuita con tu propia dirección de GitHub Pages:

1. **Crear una cuenta de GitHub**: Si no tienes una, crea una cuenta gratuita en [GitHub](https://github.com).
2. **Crear un nuevo repositorio**:
   - Haz clic en **"New"** para crear un nuevo repositorio.
   - Ponle un nombre, por ejemplo: `catalogo`.
   - Selecciónalo como **Público**.
   - Haz clic en **"Create repository"**.
3. **Subir los archivos**:
   - Sube todos los archivos de esta carpeta al repositorio:
     - `index.html`
     - `code_to_category.json`
     - `code_to_image.json`
     - `products_fallback.json`
     - La carpeta `imagenes/` (con todas las imágenes dentro)
4. **Activar GitHub Pages**:
   - En tu repositorio de GitHub, ve a la pestaña **"Settings"** (Configuración) en el menú superior.
   - En el menú lateral izquierdo, haz clic en **"Pages"**.
   - En la sección **"Build and deployment"**, bajo **"Source"**, selecciona **"Deploy from a branch"**.
   - Bajo **"Branch"**, selecciona **`main`** (o `master`) y la carpeta **`/ (root)`**.
   - Haz clic en **"Save"** (Guardar).
5. **¡Listo!**: En un par de minutos, GitHub te dará un enlace público (por ejemplo: `https://tu-usuario.github.io/catalogo/`) donde cualquiera podrá acceder a tu catálogo online desde su celular o computadora.

---

## ⚙️ Uso y Modificación del Catálogo

- **Cambiar el ID de la hoja desde la web**: En tu catálogo online, haz clic en el botón de **Configuración ⚙️** en el encabezado. Pega el ID de tu Google Sheet y haz clic en **Sincronizar**. El catálogo se guardará en tu navegador y se actualizará en tiempo real.
- **Configurar el ID por defecto**: Para que todos tus clientes entren directamente con tu hoja cargada, abre el archivo `index.html` con un editor de notas, busca la línea que dice `const DEFAULT_SHEET_ID = "";` y pon tu ID entre las comillas (ejemplo: `const DEFAULT_SHEET_ID = "tu-id-aqui";`). Guarda el archivo y súbelo a GitHub.
- **Configurar tu WhatsApp**: En `index.html`, busca la línea `const WA = '5492954000000';` y cambia los números por el teléfono de tu negocio (incluyendo el código de país, por ejemplo `549` para Argentina y el prefijo de área, sin guiones ni espacios).
- **Mapeo de Imágenes**: El sistema cuenta con un catálogo de fotos autodetectado (`code_to_image.json`). Si subes un nuevo producto con un código que ya estaba en el Excel original, este cargará automáticamente su imagen respectiva de la carpeta `imagenes/`.
- **Carga de Respaldo**: Si no hay internet o la hoja de cálculo de Google no está disponible, el sistema cargará automáticamente el archivo `products_fallback.json` como base de datos de respaldo.
