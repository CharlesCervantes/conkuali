-- AlterTable
ALTER TABLE "movimientos_semanales" ADD COLUMN     "fechaPago" TIMESTAMP(3),
ADD COLUMN     "liquidadoEn" TIMESTAMP(3),
ADD COLUMN     "liquidadoPorId" TEXT,
ADD COLUMN     "metodoPago" "MetodoPagoGasto",
ADD COLUMN     "notasPago" TEXT,
ADD COLUMN     "referenciaPago" TEXT;

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_liquidadoPorId_fkey" FOREIGN KEY ("liquidadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
