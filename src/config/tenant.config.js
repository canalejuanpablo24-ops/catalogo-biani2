/**
 * BIANI public catalog configuration.
 * This file is delivered to every visitor by GitHub Pages: never store passwords,
 * private costs, customer information or write-enabled credentials here.
 */
export const TENANT_CONFIG = {
  id: "biani-default",
  name: "BIANI",
  fullName: "Catálogo BIANI · Distribuidora mayorista",
  subtitle: "Lista de precios y pedidos online",
  logoText: "B",
  logoImage: "",

  whatsappNumber: "5492954324063",
  contactEmail: "contacto@biani.com.ar",
  address: "General Acha, La Pampa",
  salesConditions: "Venta mayorista. Precios sujetos a modificación sin previo aviso.",

  // Single read-only central source. Visitors cannot override this ID locally.
  defaultSheetId: "179n3Fa7WUbA1ZlgtAVVlIaxbQdaP5CV49NhPY0Ulrn0",
  fallbackDataPath: "./products_fallback.json",
  catalogVersion: "2026.08.03-01",

  currencySymbol: "$",
  currencyLocale: "es-AR",
  minOrderAmount: 0,

  // Only harmless client-side preferences belong here.
  localStorageKeys: {
    cart: "biani_cart_v2"
  },

  categoryIcons: {
    "Nuevos y Sin Imagen": "🆕",
    "Alfajores": "🥮",
    "Varios": "📦",
    "Chocolates": "🍫",
    "Cereales": "🌾",
    "Pastillas": "💊",
    "Galletitas": "🍪",
    "Chicles": "🍬",
    "Gomitas": "🧸",
    "Caramelos": "🍬",
    "Jugos": "🧃",
    "Despensa": "🛒",
    "Yerbas": "🧉",
    "Bic": "✏️",
    "Pilas": "🔋",
    "Lámparas": "💡",
    "Pegamentos": "🧪",
    "Higiene": "🧴",
    "Chupetines": "🍭",
    "Turrones": "🥜",
    "Papelería": "📄",
    "Perfumería": "✨",
    "Detergentes": "🧼",
    "Limpieza": "🧹",
    "Pipas": "🌻",
    "Bebidas": "🥤",
    "Snacks": "🍿"
  },

  categoryGroups: {
    "🆕 Nuevos / Sin Imagen": ["Nuevos y Sin Imagen"],
    "🥮 Chocolates y Alfajores": ["Alfajores", "Chocolates"],
    "🍭 Golosinas": ["Caramelos", "Pastillas", "Chupetines", "Gomitas", "Turrones", "Chicles", "Pipas"],
    "🍪 Galletitas y Snacks": ["Galletitas", "Cereales", "Snacks"],
    "🛒 Despensa y Bebidas": ["Despensa", "Yerbas", "Jugos", "Bebidas"],
    "🧴 Cuidado Personal": ["Higiene", "Perfumería"],
    "🧼 Limpieza": ["Limpieza", "Detergentes"],
    "🔋 Bazar y Varios": ["Bic", "Pilas", "Lámparas", "Pegamentos", "Papelería", "Varios"]
  }
};

export default TENANT_CONFIG;
