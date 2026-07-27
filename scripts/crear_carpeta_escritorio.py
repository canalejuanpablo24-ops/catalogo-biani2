import os
import shutil

desktop_dir = r"C:\Users\pablo\OneDrive\Escritorio"
target_folder = os.path.join(desktop_dir, "Galeria_Imagenes_BIANI")
project_dir = r"c:\Users\pablo\OneDrive\Escritorio\proyecto venta online"

os.makedirs(target_folder, exist_ok=True)

# 1. Copy visor_galeria.html as Abrir_Galeria.html & index.html
src_html = os.path.join(project_dir, "visor_galeria.html")
dest_html1 = os.path.join(target_folder, "Abrir_Galeria.html")
dest_html2 = os.path.join(target_folder, "index.html")

shutil.copy2(src_html, dest_html1)
shutil.copy2(src_html, dest_html2)

# 2. Copy galeria_metadata.json
src_json = os.path.join(project_dir, "galeria_metadata.json")
dest_json = os.path.join(target_folder, "galeria_metadata.json")
shutil.copy2(src_json, dest_json)

# 3. Create junction or copy 'imagenes' and 'imagenes_organizadas'
src_imgs = os.path.join(project_dir, "imagenes")
dest_imgs = os.path.join(target_folder, "imagenes")

src_org = os.path.join(project_dir, "imagenes_organizadas")
dest_org = os.path.join(target_folder, "imagenes_organizadas")

# Create directory junctions using mklink /J on Windows if not exist
def create_junction(src, dest):
    if os.path.exists(dest):
        return
    # try junction
    cmd = f'mklink /J "{dest}" "{src}"'
    res = os.system(cmd)
    if res != 0:
        # fallback copy tree
        shutil.copytree(src, dest, dirs_exist_ok=True)

create_junction(src_imgs, dest_imgs)
create_junction(src_org, dest_org)

print(f"Carpeta creada exitosamente en el Escritorio: {target_folder}")
