-- DropIndex
DROP INDEX "reposiciones_gastos_proyectoId_semanaId_beneficiarioId_key";

-- CreateIndex
-- Índice único PARCIAL — solo una reposición ACTIVA (no RECHAZADA) por
-- proyecto+semana+beneficiario. Una reposición rechazada no debe bloquear
-- crear una nueva para la misma semana; si no, sus gastos liberados nunca
-- podrían volver a agruparse. No representable en schema.prisma (Prisma no
-- soporta @@unique(..., where: ...) todavía) — vive solo aquí, igual patrón
-- que la unicidad de APLICACION_ESTIMACION en Control Contractual.
CREATE UNIQUE INDEX "reposiciones_gastos_activa_unica"
  ON "reposiciones_gastos" ("proyectoId", "semanaId", "beneficiarioId")
  WHERE "estatus" != 'RECHAZADA';
