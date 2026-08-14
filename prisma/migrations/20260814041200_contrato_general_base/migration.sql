-- CreateEnum
CREATE TYPE "EsquemaContractual" AS ENUM ('PRECIO_ALZADO', 'ADMINISTRACION');

-- AlterTable
ALTER TABLE "conceptos" ADD COLUMN     "porcentajeAdministracion" DECIMAL(5,2),
ADD COLUMN     "porcentajeUtilidad" DECIMAL(5,2),
ADD COLUMN     "precioUnitarioClienteOverride" DECIMAL(14,2),
ADD COLUMN     "precioUnitarioContratista" DECIMAL(14,2),
ADD COLUMN     "precioUnitarioHerramienta" DECIMAL(14,2),
ADD COLUMN     "precioUnitarioIndirectos" DECIMAL(14,2),
ADD COLUMN     "precioUnitarioMateriales" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "movimientos_semanales" ADD COLUMN     "contratoContratistaId" TEXT;

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "esquemaContractual" "EsquemaContractual",
ADD COLUMN     "porcentajeAdministracionDefault" DECIMAL(5,2),
ADD COLUMN     "porcentajeUtilidadDefault" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_contratoContratistaId_fkey" FOREIGN KEY ("contratoContratistaId") REFERENCES "contratos_contratista"("id") ON DELETE SET NULL ON UPDATE CASCADE;
