import os
import json
import shutil

root_dir = r"c:\Users\pablo\OneDrive\Escritorio\proyecto venta online"
img_dir = os.path.join(root_dir, "imagenes")
output_dir = os.path.join(root_dir, "imagenes_organizadas")

# Load maps
code_to_cat = {}
code_to_desc = {}
code_to_img = {}

cat_file = os.path.join(root_dir, "code_to_category.json")
desc_file = os.path.join(root_dir, "code_to_description.json")
img_map_file = os.path.join(root_dir, "code_to_image.json")

if os.path.exists(cat_file):
    with open(cat_file, 'r', encoding='utf-8') as f:
        code_to_cat = json.load(f)

if os.path.exists(desc_file):
    with open(desc_file, 'r', encoding='utf-8') as f:
        code_to_desc = json.load(f)

if os.path.exists(img_map_file):
    with open(img_map_file, 'r', encoding='utf-8') as f:
        code_to_img = json.load(f)

filename_meta = {}
for code, path in code_to_img.items():
    fname = os.path.basename(path)
    cat = code_to_cat.get(code, "")
    desc = code_to_desc.get(code, "")
    filename_meta[fname.lower()] = {
        "code": code,
        "category": cat,
        "description": desc
    }

def get_category(filename):
    lower = filename.lower()
    if lower in filename_meta and filename_meta[lower]["category"]:
        return filename_meta[lower]["category"]
    
    if 'alfajor' in lower or lower.startswith('alf-') or lower.startswith('alfa-'):
        return 'Alfajores'
    elif any(k in lower for k in ['choc', 'bon', 'bombon', 'marroc', 'cerealfort', 'caram', 'sugus', 'yummy', 'regaliz', 'bubba', 'halls', 'beldent']):
        return 'Chocolates y Golosinas'
    elif any(k in lower for k in ['gall', 'oblea', 'bizcocho', 'pepa', 'cookie', 'cerealitas', 'terrabusi', 'oreo', 'pepitos', '9-de-oro']):
        return 'Galletitas y Obleas'
    elif any(k in lower for k in ['pila', 'energizer', 'eveready', 'rayovac', 'linterna', 'vincha', 'cargador', 'farol']):
        return 'Pilas y Linternas'
    elif any(k in lower for k in ['vino', 'fecovita', 'toro', 'estancia', 'dilema', 'nativo']):
        return 'Bebidas y Vinos'
    elif any(k in lower for k in ['jugo', 'tang', 'clight']):
        return 'Jugos y Bebidas'
    elif any(k in lower for k in ['yerba', 'mate', 'amanda']):
        return 'Yerba e Infusiones'
    elif any(k in lower for k in ['sina', 'esponja', 'trapo', 'escobillon', 'secador', 'cepillo', 'palangana', 'broche', 'lampazo', 'pala']):
        return 'Limpieza y Bazar'
    elif any(k in lower for k in ['fastix', 'poxi', 'gotita', 'wd-40', 'cinta', 'eccole', 'pulpito', 'unipox', 'volibarra', 'bic-']):
        return 'Ferretería y Librería'
    elif any(k in lower for k in ['harina', 'arroz', 'aceite', 'mayonesa', 'pure', 'premezcla', 'pan-rallado', 'rebozador']):
        return 'Almacén y Comestibles'
    else:
        return 'Varios'

valid_exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg')
files = [f for f in os.listdir(img_dir) if os.path.splitext(f)[1].lower() in valid_exts]

print(f"Encontradas {len(files)} imágenes.")

meta_list = []
categories_count = {}

for f in files:
    cat = get_category(f)
    categories_count[cat] = categories_count.get(cat, 0) + 1
    
    name_no_ext = os.path.splitext(f)[0]
    parts = name_no_ext.split('-', 1)
    if len(parts) > 1 and parts[0].isdigit():
        title = parts[1].replace('-', ' ').title()
        code = parts[0]
    else:
        title = name_no_ext.replace('-', ' ').title()
        code = ""
    
    meta_info = filename_meta.get(f.lower(), {})
    if meta_info.get("description"):
        title = meta_info["description"]
    if meta_info.get("code"):
        code = meta_info["code"]

    meta_list.append({
        "filename": f,
        "title": title,
        "code": code,
        "category": cat,
        "path": f"imagenes/{f}"
    })

# Save metadata JSON FIRST for instant web app response
meta_json_path = os.path.join(root_dir, "galeria_metadata.json")
with open(meta_json_path, 'w', encoding='utf-8') as out:
    json.dump(meta_list, out, ensure_ascii=False, indent=2)

print(f"Metadata de {len(meta_list)} imágenes guardada en {meta_json_path}")

# Now populate imagenes_organizadas
os.makedirs(output_dir, exist_ok=True)
for item in meta_list:
    f = item["filename"]
    cat = item["category"]
    safe_cat = "".join([c if c.isalnum() or c in (' ', '_') else '_' for c in cat]).strip().replace(' ', '_')
    subfolder = os.path.join(output_dir, safe_cat)
    os.makedirs(subfolder, exist_ok=True)
    
    dest_path = os.path.join(subfolder, f)
    if not os.path.exists(dest_path):
        try:
            # Create hardlink if possible (instant), fallback to copy
            try:
                os.link(os.path.join(img_dir, f), dest_path)
            except Exception:
                shutil.copy2(os.path.join(img_dir, f), dest_path)
        except Exception:
            pass

print("Proceso finalizado con éxito.")
