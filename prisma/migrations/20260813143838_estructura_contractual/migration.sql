-- CreateEnum
CREATE TYPE "ConceptoEstatus" AS ENUM ('ACTIVO', 'CANCELADO');

-- CreateTable
CREATE TABLE "partidas" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conceptos" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "codigo" TEXT,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidadContratada" DECIMAL(14,3) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "notas" TEXT,
    "estatus" "ConceptoEstatus" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_contratista" (
    "id" TEXT NOT NULL,
    "beneficiarioProyectoId" TEXT NOT NULL,
    "numeroContrato" TEXT,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_contratista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_conceptos" (
    "id" TEXT NOT NULL,
    "contratoContratistaId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precioUnitarioContratista" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partidas_proyectoId_idx" ON "partidas"("proyectoId");

-- CreateIndex
CREATE INDEX "conceptos_partidaId_idx" ON "conceptos"("partidaId");

-- CreateIndex
CREATE INDEX "contratos_contratista_beneficiarioProyectoId_idx" ON "contratos_contratista"("beneficiarioProyectoId");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_conceptos_contratoContratistaId_conceptoId_key" ON "contrato_conceptos"("contratoContratistaId", "conceptoId");

-- AddForeignKey
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_contratista" ADD CONSTRAINT "contratos_contratista_beneficiarioProyectoId_fkey" FOREIGN KEY ("beneficiarioProyectoId") REFERENCES "beneficiario_proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_conceptos" ADD CONSTRAINT "contrato_conceptos_contratoContratistaId_fkey" FOREIGN KEY ("contratoContratistaId") REFERENCES "contratos_contratista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_conceptos" ADD CONSTRAINT "contrato_conceptos_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
