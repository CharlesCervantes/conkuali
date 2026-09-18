-- AlterTable
ALTER TABLE "empresas" ALTER COLUMN "reciboTitulo" SET DEFAULT 'ESTIMACIÓN DE CONTRATISTA';

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "supervisorUsuarioId" TEXT;

-- CreateIndex
CREATE INDEX "proyectos_supervisorUsuarioId_idx" ON "proyectos"("supervisorUsuarioId");

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_supervisorUsuarioId_fkey" FOREIGN KEY ("supervisorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: actualiza el título del recibo a "ESTIMACIÓN DE CONTRATISTA"
-- únicamente para la Empresa Grupo Conkuali ya existente (id = 'conkuali',
-- su llave primaria real — mismo identificador ya usado en los backfills de
-- privadoHabilitado y reciboLeyenda de esta sesión). Cambiar solo el DEFAULT
-- de columna arriba no toca ninguna fila ya persistida (Conkuali ya tenía
-- 'Recibo de pago' escrito explícitamente por el seed), así que hace falta
-- este UPDATE explícito además del nuevo default. Empresas nuevas reciben el
-- nuevo default de columna automáticamente, sin este UPDATE.
UPDATE "empresas"
SET "reciboTitulo" = 'ESTIMACIÓN DE CONTRATISTA'
WHERE "id" = 'conkuali';
