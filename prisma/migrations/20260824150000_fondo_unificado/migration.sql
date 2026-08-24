-- Rediseño del modelo financiero del cliente: el fondo deja de ser un
-- esquema excluyente (FONDO vs PAGO_POR_ESTIMACION) y pasa a ser una fuente
-- de recursos opcional que cualquier proyecto puede tener, derivada de sus
-- propias aportaciones. Audit de datos reales (agosto 2026) confirmó cero
-- movimientos financieros y cero estimaciones emitidas en toda la base —
-- no hace falta ningún backfill, es una migración de schema pura.

-- AlterTable
ALTER TABLE "proyectos" DROP COLUMN "esquemaFinanciamientoCliente";

-- DropEnum
DROP TYPE "EsquemaFinanciamientoCliente";

-- DropIndex
-- Ya no es válido: una estimación ahora puede tener varias
-- APLICACION_ESTIMACION en fechas distintas (una al emitir si se elige, más
-- una por cada "Aplicar fondo" manual posterior). La integridad pasa a
-- garantizarse con un bloqueo de fila sobre Proyecto (SELECT ... FOR UPDATE)
-- al calcular fondo disponible, no con este índice.
DROP INDEX "movimientos_financieros_cliente_aplicacion_unica";
