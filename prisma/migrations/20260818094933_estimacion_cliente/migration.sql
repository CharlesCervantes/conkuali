-- CreateEnum
CREATE TYPE "EstatusEstimacionCliente" AS ENUM ('BORRADOR', 'EMITIDA');

-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "ultimoNumeroEstimacion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "estimaciones_cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estatus" "EstatusEstimacionCliente" NOT NULL DEFAULT 'BORRADOR',
    "esquemaContractualUsado" "EsquemaContractual",
    "subtotal" DECIMAL(14,2) NOT NULL,
    "montoAdministracionOUtilidad" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "generadoPorId" TEXT NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidoPorId" TEXT,
    "emitidoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimaciones_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimacion_cliente_conceptos" (
    "id" TEXT NOT NULL,
    "estimacionClienteId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "partidaNombre" TEXT NOT NULL,
    "descripcionConcepto" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidadContratada" DECIMAL(14,3) NOT NULL,
    "cantidadAnterior" DECIMAL(14,3) NOT NULL,
    "cantidadEstaSemana" DECIMAL(14,3) NOT NULL,
    "cantidadAcumulada" DECIMAL(14,3) NOT NULL,
    "cantidadPorEjercer" DECIMAL(14,3) NOT NULL,
    "avancePorcentaje" DECIMAL(5,2) NOT NULL,
    "precioUnitarioOperativo" DECIMAL(14,2) NOT NULL,
    "importeContratadoOperativo" DECIMAL(14,2) NOT NULL,
    "importeEstaSemanaOperativo" DECIMAL(14,2) NOT NULL,
    "importeAcumuladoOperativo" DECIMAL(14,2) NOT NULL,
    "importePorEjercerOperativo" DECIMAL(14,2) NOT NULL,
    "precioUnitarioPrivado" DECIMAL(14,2) NOT NULL,
    "importeContratadoPrivado" DECIMAL(14,2) NOT NULL,
    "importeEstaSemanaPrivado" DECIMAL(14,2) NOT NULL,
    "importeAcumuladoPrivado" DECIMAL(14,2) NOT NULL,
    "importePorEjercerPrivado" DECIMAL(14,2) NOT NULL,
    "porcentajeAplicadoPrivado" DECIMAL(5,2),

    CONSTRAINT "estimacion_cliente_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimaciones_cliente_empresaId_idx" ON "estimaciones_cliente"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "estimaciones_cliente_proyectoId_semanaId_key" ON "estimaciones_cliente"("proyectoId", "semanaId");

-- CreateIndex
CREATE INDEX "estimacion_cliente_conceptos_estimacionClienteId_idx" ON "estimacion_cliente_conceptos"("estimacionClienteId");

-- CreateIndex
CREATE INDEX "estimacion_cliente_conceptos_conceptoId_idx" ON "estimacion_cliente_conceptos"("conceptoId");

-- AddForeignKey
ALTER TABLE "estimaciones_cliente" ADD CONSTRAINT "estimaciones_cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimaciones_cliente" ADD CONSTRAINT "estimaciones_cliente_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimaciones_cliente" ADD CONSTRAINT "estimaciones_cliente_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimaciones_cliente" ADD CONSTRAINT "estimaciones_cliente_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimaciones_cliente" ADD CONSTRAINT "estimaciones_cliente_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_conceptos" ADD CONSTRAINT "estimacion_cliente_conceptos_estimacionClienteId_fkey" FOREIGN KEY ("estimacionClienteId") REFERENCES "estimaciones_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_conceptos" ADD CONSTRAINT "estimacion_cliente_conceptos_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
