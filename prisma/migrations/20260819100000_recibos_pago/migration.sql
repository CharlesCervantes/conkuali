-- CreateEnum
CREATE TYPE "EstatusReciboPago" AS ENUM ('VIGENTE', 'SUPERSEDIDO');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "reciboLeyenda" TEXT,
ADD COLUMN     "reciboMostrarDetalle" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reciboMostrarPU" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reciboRazonSocial" TEXT,
ADD COLUMN     "reciboTitulo" TEXT NOT NULL DEFAULT 'Recibo de pago',
ADD COLUMN     "ultimoFolioRecibo" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "recibos_pago" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "corteSemanalId" TEXT NOT NULL,
    "numeroFolio" INTEGER NOT NULL,
    "folio" TEXT NOT NULL,
    "estatus" "EstatusReciboPago" NOT NULL DEFAULT 'VIGENTE',
    "configuracionSnapshot" JSONB NOT NULL,
    "generadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivoEvidenciaUrl" TEXT,
    "archivoEvidenciaNombre" TEXT,
    "fechaRecepcion" TIMESTAMP(3),
    "subidoPorId" TEXT,
    "subidoEn" TIMESTAMP(3),

    CONSTRAINT "recibos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recibos_pago_corteSemanalId_idx" ON "recibos_pago"("corteSemanalId");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_pago_empresaId_folio_key" ON "recibos_pago"("empresaId", "folio");

-- AddForeignKey
ALTER TABLE "recibos_pago" ADD CONSTRAINT "recibos_pago_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_pago" ADD CONSTRAINT "recibos_pago_corteSemanalId_fkey" FOREIGN KEY ("corteSemanalId") REFERENCES "cortes_semanales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_pago" ADD CONSTRAINT "recibos_pago_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_pago" ADD CONSTRAINT "recibos_pago_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

