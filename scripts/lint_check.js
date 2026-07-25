import fs from 'fs';
import path from 'path';

console.log("🔍 Running lint and syntax checks...");

const jsonFiles = [
  'package.json',
  'manifest.json',
  'code_to_category.json',
  'code_to_description.json',
  'code_to_image.json',
  'products_fallback.json',
  'src/data/pdfOrder.json',
  'src/data/defaultEdits.json'
];

let hasErrors = false;

jsonFiles.forEach(file => {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      JSON.parse(content);
      console.log(`  ✓ ${file} is valid JSON`);
    } catch (e) {
      console.error(`  ❌ ${file} has invalid JSON syntax:`, e.message);
      hasErrors = true;
    }
  } else {
    console.warn(`  ⚠️ ${file} not found`);
  }
});

if (hasErrors) {
  console.error("❌ Lint check failed!");
  process.exit(1);
} else {
  console.log("✅ All JSON files passed linting!");
  process.exit(0);
}
