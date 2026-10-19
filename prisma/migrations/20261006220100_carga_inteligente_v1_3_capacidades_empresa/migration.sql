-- CreateEnum
CREATE TYPE "ComportamientoLimiteInteligencia" AS ENUM ('SOLO_ALERTAR', 'BLOQUEAR');

-- CreateEnum
CREATE TYPE "CapacidadInteligencia" AS ENUM ('ANALISIS_DOCUMENTAL_TEXTO', 'ANALISIS_VISUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstatusDocumentoEgreso" ADD VALUE 'CAPACIDAD_NO_HABILITADA';
ALTER TYPE "EstatusDocumentoEgreso" ADD VALUE 'LIMITE_ALCANZADO';

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "comportamientoLimiteInteligencia" "ComportamientoLimiteInteligencia" NOT NULL DEFAULT 'SOLO_ALERTAR',
ADD COLUMN     "inteligenciaHabilitada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limiteOperacionesMensualInteligencia" INTEGER,
ADD COLUMN     "porcentajeAlertaInteligencia" INTEGER;

-- CreateTable
CREATE TABLE "empresa_capacidades_inteligencia" (
    "empresaId" TEXT NOT NULL,
    "capacidad" "CapacidadInteligencia" NOT NULL,
    "habilitado" BOOLEAN NOT NULL,

    CONSTRAINT "empresa_capacidades_inteligencia_pkey" PRIMARY KEY ("empresaId","capacidad")
);

-- CreateIndex
CREATE INDEX "registro_consumo_inteligencia_empresaId_tipoConsumo_fecha_idx" ON "registro_consumo_inteligencia"("empresaId", "tipoConsumo", "fecha");

-- AddForeignKey
ALTER TABLE "empresa_capacidades_inteligencia" ADD CONSTRAINT "empresa_capacidades_inteligencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
