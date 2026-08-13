-- CreateTable
CREATE TABLE "avance_conceptos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "cantidadEjecutada" DECIMAL(14,3) NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avance_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avance_conceptos_empresaId_idx" ON "avance_conceptos"("empresaId");

-- CreateIndex
CREATE INDEX "avance_conceptos_semanaId_idx" ON "avance_conceptos"("semanaId");

-- CreateIndex
CREATE UNIQUE INDEX "avance_conceptos_conceptoId_semanaId_key" ON "avance_conceptos"("conceptoId", "semanaId");

-- AddForeignKey
ALTER TABLE "avance_conceptos" ADD CONSTRAINT "avance_conceptos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avance_conceptos" ADD CONSTRAINT "avance_conceptos_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avance_conceptos" ADD CONSTRAINT "avance_conceptos_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avance_conceptos" ADD CONSTRAINT "avance_conceptos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
