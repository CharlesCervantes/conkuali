-- DropIndex
DROP INDEX "movimientos_semanales_beneficiarioProyectoId_semanaId_orige_key";

-- CreateIndex
-- No único: reemplaza al @@unique anterior, la unicidad real pasa a ser
-- parcial (ver abajo). Se conserva como índice normal por rendimiento de
-- las mismas consultas que antes usaban la clave única.
CREATE INDEX "movimientos_semanales_beneficiarioProyectoId_semanaId_orige_idx"
  ON "movimientos_semanales" ("beneficiarioProyectoId", "semanaId", "origen");

-- CreateIndex
-- Único PARCIAL: CORTE_CONTRATISTA/ORDEN_COMPRA/MANUAL siguen exactamente
-- igual que antes (a lo más un movimiento por beneficiario+semana+origen).
-- REPOSICION_GASTOS queda fuera a propósito — una reposición complementaria
-- tras liquidar la anterior necesita su propio MovimientoSemanal nuevo para
-- el mismo beneficiario+semana; esa integridad la da el índice único
-- parcial de reposiciones_gastos (cerrada = false), no este.
CREATE UNIQUE INDEX "movimientos_semanales_no_reposicion_unica"
  ON "movimientos_semanales" ("beneficiarioProyectoId", "semanaId", "origen")
  WHERE "origen" != 'REPOSICION_GASTOS';
