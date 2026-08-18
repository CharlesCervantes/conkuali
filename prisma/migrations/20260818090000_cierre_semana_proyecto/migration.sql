-- CreateEnum
CREATE TYPE "EstatusCorteSemanal" AS ENUM ('GENERADO', 'ANULADO');

-- CreateTable
CREATE TABLE "cierres_semana_proyecto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "estatus" "EstatusSemana" NOT NULL DEFAULT 'CERRADA',
    "cerradoPorId" TEXT NOT NULL,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reabiertoPorId" TEXT,
    "reabiertoEn" TIMESTAMP(3),
    "motivoReapertura" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cierres_semana_proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cortes_semanales" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "cierreSemanaProyectoId" TEXT NOT NULL,
    "beneficiarioProyectoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "montoBruto" DECIMAL(14,2) NOT NULL,
    "ajustes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "montoNeto" DECIMAL(14,2) NOT NULL,
    "estatus" "EstatusCorteSemanal" NOT NULL DEFAULT 'GENERADO',
    "movimientoSemanalId" TEXT,
    "generadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cortes_semanales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corte_semanal_conceptos" (
    "id" TEXT NOT NULL,
    "corteSemanalId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "contratoConceptoId" TEXT NOT NULL,
    "avanceConceptoId" TEXT NOT NULL,
    "descripcionConcepto" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidadEjecutada" DECIMAL(14,3) NOT NULL,
    "precioUnitarioContratista" DECIMAL(14,2) NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "corte_semanal_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cierres_semana_proyecto_empresaId_idx" ON "cierres_semana_proyecto"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_semana_proyecto_proyectoId_semanaId_key" ON "cierres_semana_proyecto"("proyectoId", "semanaId");

-- CreateIndex
CREATE UNIQUE INDEX "cortes_semanales_movimientoSemanalId_key" ON "cortes_semanales"("movimientoSemanalId");

-- CreateIndex
CREATE INDEX "cortes_semanales_empresaId_idx" ON "cortes_semanales"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cortes_semanales_proyectoId_semanaId_beneficiarioProyectoId_key" ON "cortes_semanales"("proyectoId", "semanaId", "beneficiarioProyectoId");

-- CreateIndex
CREATE UNIQUE INDEX "corte_semanal_conceptos_avanceConceptoId_key" ON "corte_semanal_conceptos"("avanceConceptoId");

-- CreateIndex
CREATE INDEX "corte_semanal_conceptos_corteSemanalId_idx" ON "corte_semanal_conceptos"("corteSemanalId");

-- AddForeignKey
ALTER TABLE "cierres_semana_proyecto" ADD CONSTRAINT "cierres_semana_proyecto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_semana_proyecto" ADD CONSTRAINT "cierres_semana_proyecto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_semana_proyecto" ADD CONSTRAINT "cierres_semana_proyecto_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_semana_proyecto" ADD CONSTRAINT "cierres_semana_proyecto_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_semana_proyecto" ADD CONSTRAINT "cierres_semana_proyecto_reabiertoPorId_fkey" FOREIGN KEY ("reabiertoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_cierreSemanaProyectoId_fkey" FOREIGN KEY ("cierreSemanaProyectoId") REFERENCES "cierres_semana_proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_beneficiarioProyectoId_fkey" FOREIGN KEY ("beneficiarioProyectoId") REFERENCES "beneficiario_proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_movimientoSemanalId_fkey" FOREIGN KEY ("movimientoSemanalId") REFERENCES "movimientos_semanales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_semanales" ADD CONSTRAINT "cortes_semanales_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corte_semanal_conceptos" ADD CONSTRAINT "corte_semanal_conceptos_corteSemanalId_fkey" FOREIGN KEY ("corteSemanalId") REFERENCES "cortes_semanales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corte_semanal_conceptos" ADD CONSTRAINT "corte_semanal_conceptos_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corte_semanal_conceptos" ADD CONSTRAINT "corte_semanal_conceptos_contratoConceptoId_fkey" FOREIGN KEY ("contratoConceptoId") REFERENCES "contrato_conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corte_semanal_conceptos" ADD CONSTRAINT "corte_semanal_conceptos_avanceConceptoId_fkey" FOREIGN KEY ("avanceConceptoId") REFERENCES "avance_conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

