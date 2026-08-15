import {
  ShoppingCart,
  Hammer,
  HardHat,
  Construction,
  Layers,
  Droplet,
  Zap,
  PaintRoller,
  Wrench,
  DoorOpen,
  Trash2,
  Ruler,
  Home,
  Building2,
  Warehouse,
  TriangleAlert,
  Shovel,
  Grid3x3,
  Lightbulb,
  Paintbrush,
  Fence,
  Package,
  type LucideIcon,
} from "lucide-react";

// Catálogo curado (no cualquier icono de lucide-react) — se valida en el
// servicio contra estas claves, así que Partida.icono nunca guarda un valor
// arbitrario. Puramente decorativo, sin significado de negocio.
export const ICONOS_PARTIDA: Record<string, LucideIcon> = {
  carrito: ShoppingCart,
  demolicion: Hammer,
  obra: HardHat,
  construccion: Construction,
  albanileria: Layers,
  hidraulica: Droplet,
  electrica: Zap,
  pintura: PaintRoller,
  herramienta: Wrench,
  puertas: DoorOpen,
  limpieza: Trash2,
  medicion: Ruler,
  casa: Home,
  edificio: Building2,
  bodega: Warehouse,
  atencion: TriangleAlert,
  excavacion: Shovel,
  pisos: Grid3x3,
  iluminacion: Lightbulb,
  acabados: Paintbrush,
  exteriores: Fence,
  materiales: Package,
};

export const COLORES_PARTIDA: Record<string, { bg: string; text: string }> = {
  azul: { bg: "bg-blue-100", text: "text-blue-600" },
  naranja: { bg: "bg-orange-100", text: "text-orange-600" },
  verde: { bg: "bg-emerald-100", text: "text-emerald-600" },
  rosa: { bg: "bg-pink-100", text: "text-pink-600" },
  morado: { bg: "bg-purple-100", text: "text-purple-600" },
  cian: { bg: "bg-teal-100", text: "text-teal-600" },
  amarillo: { bg: "bg-amber-100", text: "text-amber-600" },
  rojo: { bg: "bg-red-100", text: "text-red-600" },
  gris: { bg: "bg-gray-100", text: "text-gray-600" },
};

export const CLAVES_ICONOS_PARTIDA = Object.keys(ICONOS_PARTIDA);
export const CLAVES_COLORES_PARTIDA = Object.keys(COLORES_PARTIDA);
