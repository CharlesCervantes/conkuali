-- Módulo "Compras" (vista global de Requisiciones/Cotizaciones/Órdenes de
-- Compra para Administrador/Director, todas las obras + Empresa) — Compras,
-- septiembre 2026. Sin cambio de schema, solo catálogo + backfill, mismo
-- patrón exacto que el módulo "gastos" (20260910120000_gastos_transversal).

INSERT INTO "modulos" ("id", "clave", "nombre")
VALUES ('modulo_compras', 'compras', 'Compras')
ON CONFLICT ("clave") DO NOTHING;

-- Backfill: habilita el módulo "compras" ÚNICAMENTE para la Empresa Grupo
-- Conkuali (id = 'conkuali', su llave primaria real, nunca un match por
-- nombre). Override explícito de EmpresaModulo (habilitado = true) — el
-- mecanismo general de módulos por Empresa sigue siendo 100% configurable
-- desde Portal Master para cualquier otra Empresa, existente o futura.
INSERT INTO "empresa_modulos" ("empresaId", "moduloId", "habilitado")
SELECT 'conkuali', m."id", true
FROM "modulos" m
WHERE m."clave" = 'compras'
  AND EXISTS (SELECT 1 FROM "empresas" WHERE "id" = 'conkuali')
ON CONFLICT ("empresaId", "moduloId") DO UPDATE SET "habilitado" = true;
