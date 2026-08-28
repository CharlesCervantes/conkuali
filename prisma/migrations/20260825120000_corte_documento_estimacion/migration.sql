-- AlterTable
ALTER TABLE "estimaciones_cliente" ADD COLUMN     "fechaCorteDocumento" TIMESTAMP(3),
ADD COLUMN     "montoContratoOperativoCongelado" DECIMAL(14,2),
ADD COLUMN     "montoContratoPrivadoCongelado" DECIMAL(14,2);
