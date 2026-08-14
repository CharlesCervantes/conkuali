-- Un concepto solo puede pertenecer a UN contratista (nunca repartido entre
-- varios) — decisión de sesión, agosto 2026. Verificado antes de migrar: 0
-- conceptos con más de una asignación en los datos actuales.

-- DropIndex
DROP INDEX "contrato_conceptos_contratoContratistaId_conceptoId_key";

-- CreateIndex
CREATE UNIQUE INDEX "contrato_conceptos_conceptoId_key" ON "contrato_conceptos"("conceptoId");

-- CreateIndex
CREATE INDEX "contrato_conceptos_contratoContratistaId_idx" ON "contrato_conceptos"("contratoContratistaId");
