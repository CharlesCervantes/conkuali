-- AlterTable
ALTER TABLE "reposiciones_gastos" ADD COLUMN "cerrada" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
DROP INDEX "reposiciones_gastos_activa_unica";

-- CreateIndex
-- Reposición ABIERTA por proyecto+semana+beneficiario: ni RECHAZADA ni ya
-- CERRADA (movimiento liquidado) cuentan, así que una liquidada puede
-- coexistir con una complementaria nueva pendiente de pago.
CREATE UNIQUE INDEX "reposiciones_gastos_abierta_unica"
  ON "reposiciones_gastos" ("proyectoId", "semanaId", "beneficiarioId")
  WHERE "cerrada" = false AND "estatus" != 'RECHAZADA';
