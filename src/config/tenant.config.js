/**
 * BIANI Multi-tenant Configuration File
 * Allows custom branding, Google Sheets ID, WhatsApp credentials, and sales settings per distributor.
 */
export const TENANT_CONFIG = {
  id: "biani-default",
  name: "BIANI",
  fullName: "Catálogo BIANI · Distribuidora mayorista",
  subtitle: "Lista de Precios & Pedidos Online",
  logoText: "B",
  logoImage: "", // Optional logo URL
  
  // WhatsApp & Contact settings
  whatsappNumber: "5492954324063",
  contactEmail: "contacto@biani.com.ar",
  address: "General Acha, La Pampa",
  salesConditions: "Venta mayorista. Precios sujetos a modificación sin previo aviso.",
  
  // Data Source Settings
  defaultSheetId: "179n3Fa7WUbA1ZlgtAVVlIaxbQdaP5CV49NhPY0Ulrn0",
  fallbackDataPath: "./products_fallback.json",
  
  // E-commerce & Order limits
  currencySymbol: "$",
  currencyLocale: "es-AR",
  minOrderAmount: 0, // 0 = no minimum required
  
  // Admin & Security
  adminPin: "1114",
  localStorageKeys: {
    sheetId: "biani_sheet_id",
    order: "biani_order",
    edits: "biani_edits",
    del: "biani_del",
    add: "biani_add",
    cart: "biani_cart_v2"
  },

  // Category Emoji Icons
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

  // Category Groupings
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
