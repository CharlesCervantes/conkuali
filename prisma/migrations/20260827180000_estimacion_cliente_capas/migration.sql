-- CreateEnum
CREATE TYPE "CapaEstimacion" AS ENUM ('OPERATIVO', 'PRIVADO');

-- DropIndex
DROP INDEX "estimacion_cliente_gastos_gastoObraId_key";

-- AlterTable
ALTER TABLE "estimacion_cliente_conceptos" ALTER COLUMN "precioUnitarioOperativo" DROP NOT NULL,
ALTER COLUMN "importeContratadoOperativo" DROP NOT NULL,
ALTER COLUMN "importeEstaSemanaOperativo" DROP NOT NULL,
ALTER COLUMN "importeAcumuladoOperativo" DROP NOT NULL,
ALTER COLUMN "importePorEjercerOperativo" DROP NOT NULL,
ALTER COLUMN "precioUnitarioPrivado" DROP NOT NULL,
ALTER COLUMN "importeContratadoPrivado" DROP NOT NULL,
ALTER COLUMN "importeEstaSemanaPrivado" DROP NOT NULL,
ALTER COLUMN "importeAcumuladoPrivado" DROP NOT NULL,
ALTER COLUMN "importePorEjercerPrivado" DROP NOT NULL;

-- AlterTable
ALTER TABLE "estimacion_cliente_gastos" ADD COLUMN     "estimacionClienteCapaId" TEXT;

-- AlterTable
ALTER TABLE "estimaciones_cliente" ALTER COLUMN "numero" DROP NOT NULL,
ALTER COLUMN "subtotal" DROP NOT NULL,
ALTER COLUMN "montoAdministracionOUtilidad" DROP NOT NULL,
ALTER COLUMN "total" DROP NOT NULL;

-- AlterTable
ALTER TABLE "gastos_obra" ADD COLUMN     "incluidoEnCapaOperativoId" TEXT,
ADD COLUMN     "incluidoEnCapaPrivadoId" TEXT;

-- AlterTable
ALTER TABLE "movimientos_financieros_cliente" ADD COLUMN     "estimacionClienteCapaId" TEXT;

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "ultimoNumeroEstimacionOperativo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoNumeroEstimacionPrivado" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "estimacion_cliente_capas" (
    "id" TEXT NOT NULL,
    "estimacionClienteId" TEXT NOT NULL,
    "capa" "CapaEstimacion" NOT NULL,
    "estatus" "EstatusEstimacionCliente" NOT NULL DEFAULT 'BORRADOR',
    "aplicaIVA" BOOLEAN NOT NULL DEFAULT false,
    "porcentajeIVA" DECIMAL(5,2),
    "numero" INTEGER,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "montoAdministracionTrabajos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotalGastosCobrables" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "porcentajeAdministracionGastos" DECIMAL(5,2),
    "montoAdministracionGastos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "montoIVA" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "generadoPorId" TEXT NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPorId" TEXT,
    "emitidoEn" TIMESTAMP(3),
    "fechaCorteDocumento" TIMESTAMP(3),
    "montoContratoCongelado" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimacion_cliente_capas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimacion_cliente_capa_conceptos" (
    "id" TEXT NOT NULL,
    "estimacionClienteCapaId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "precioUnitarioBase" DECIMAL(14,2) NOT NULL,
    "porcentajeAplicado" DECIMAL(5,2),
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "importeContratado" DECIMAL(14,2) NOT NULL,
    "importeEstaSemana" DECIMAL(14,2) NOT NULL,
    "importeAcumulado" DECIMAL(14,2) NOT NULL,
    "importePorEjercer" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "estimacion_cliente_capa_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimacion_cliente_capas_estatus_idx" ON "estimacion_cliente_capas"("estatus");

-- CreateIndex
CREATE UNIQUE INDEX "estimacion_cliente_capas_estimacionClienteId_capa_key" ON "estimacion_cliente_capas"("estimacionClienteId", "capa");

-- CreateIndex
CREATE UNIQUE INDEX "estimacion_cliente_capa_conceptos_estimacionClienteCapaId_c_key" ON "estimacion_cliente_capa_conceptos"("estimacionClienteCapaId", "conceptoId");

-- CreateIndex
CREATE INDEX "estimacion_cliente_gastos_gastoObraId_idx" ON "estimacion_cliente_gastos"("gastoObraId");

-- CreateIndex
CREATE UNIQUE INDEX "estimacion_cliente_gastos_estimacionClienteCapaId_gastoObra_key" ON "estimacion_cliente_gastos"("estimacionClienteCapaId", "gastoObraId");

-- CreateIndex
CREATE INDEX "gastos_obra_incluidoEnCapaOperativoId_idx" ON "gastos_obra"("incluidoEnCapaOperativoId");

-- CreateIndex
CREATE INDEX "gastos_obra_incluidoEnCapaPrivadoId_idx" ON "gastos_obra"("incluidoEnCapaPrivadoId");

-- CreateIndex
CREATE INDEX "movimientos_financieros_cliente_estimacionClienteCapaId_idx" ON "movimientos_financieros_cliente"("estimacionClienteCapaId");

-- AddForeignKey
ALTER TABLE "estimacion_cliente_capas" ADD CONSTRAINT "estimacion_cliente_capas_estimacionClienteId_fkey" FOREIGN KEY ("estimacionClienteId") REFERENCES "estimaciones_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_capas" ADD CONSTRAINT "estimacion_cliente_capas_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_capas" ADD CONSTRAINT "estimacion_cliente_capas_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_capa_conceptos" ADD CONSTRAINT "estimacion_cliente_capa_conceptos_estimacionClienteCapaId_fkey" FOREIGN KEY ("estimacionClienteCapaId") REFERENCES "estimacion_cliente_capas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_capa_conceptos" ADD CONSTRAINT "estimacion_cliente_capa_conceptos_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_gastos" ADD CONSTRAINT "estimacion_cliente_gastos_estimacionClienteCapaId_fkey" FOREIGN KEY ("estimacionClienteCapaId") REFERENCES "estimacion_cliente_capas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros_cliente" ADD CONSTRAINT "movimientos_financieros_cliente_estimacionClienteCapaId_fkey" FOREIGN KEY ("estimacionClienteCapaId") REFERENCES "estimacion_cliente_capas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_incluidoEnCapaOperativoId_fkey" FOREIGN KEY ("incluidoEnCapaOperativoId") REFERENCES "estimacion_cliente_capas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_incluidoEnCapaPrivadoId_fkey" FOREIGN KEY ("incluidoEnCapaPrivadoId") REFERENCES "estimacion_cliente_capas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
