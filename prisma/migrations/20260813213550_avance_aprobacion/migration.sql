-- CreateEnum
CREATE TYPE "EstatusAprobacionAvance" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "avance_conceptos" ADD COLUMN     "aprobadoPorId" TEXT,
ADD COLUMN     "estatusAprobacion" "EstatusAprobacionAvance" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "fechaAprobacion" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "avance_conceptos_estatusAprobacion_idx" ON "avance_conceptos"("estatusAprobacion");

-- AddForeignKey
ALTER TABLE "avance_conceptos" ADD CONSTRAINT "avance_conceptos_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
