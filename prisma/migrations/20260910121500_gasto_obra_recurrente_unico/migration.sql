-- DropIndex
DROP INDEX "gastos_obra_recurrenteId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "gastos_obra_recurrenteId_semanaId_key" ON "gastos_obra"("recurrenteId", "semanaId");
