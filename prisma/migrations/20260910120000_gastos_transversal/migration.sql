-- CreateEnum
CREATE TYPE "FrecuenciaGasto" AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL');

-- AlterTable
ALTER TABLE "gastos_obra" ADD COLUMN     "recurrenteId" TEXT;

-- CreateTable
CREATE TABLE "gastos_recurrentes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "frecuencia" "FrecuenciaGasto" NOT NULL,
    "montoFijo" DECIMAL(14,2),
    "pagadorBeneficiarioId" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_recurrentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonos_reposicion" (
    "id" TEXT NOT NULL,
    "reposicionGastosId" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodoPago" "MetodoPagoGasto" NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_reposicion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gastos_recurrentes_empresaId_proyectoId_idx" ON "gastos_recurrentes"("empresaId", "proyectoId");

-- CreateIndex
CREATE INDEX "gastos_recurrentes_pagadorBeneficiarioId_idx" ON "gastos_recurrentes"("pagadorBeneficiarioId");

-- CreateIndex
CREATE INDEX "abonos_reposicion_reposicionGastosId_idx" ON "abonos_reposicion"("reposicionGastosId");

-- CreateIndex
CREATE INDEX "gastos_obra_recurrenteId_idx" ON "gastos_obra"("recurrenteId");

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_recurrenteId_fkey" FOREIGN KEY ("recurrenteId") REFERENCES "gastos_recurrentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_pagadorBeneficiarioId_fkey" FOREIGN KEY ("pagadorBeneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_recurrentes" ADD CONSTRAINT "gastos_recurrentes_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_reposicion" ADD CONSTRAINT "abonos_reposicion_reposicionGastosId_fkey" FOREIGN KEY ("reposicionGastosId") REFERENCES "reposiciones_gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonos_reposicion" ADD CONSTRAINT "abonos_reposicion_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactamente un Proyecto(tipo=OFICINA) por Empresa — el vehículo técnico
-- para "Gastos de Empresa" (nunca hardcodeado a Conkuali; cualquier Empresa
-- puede tener el suyo). Índice único PARCIAL, no representable como @@unique
-- normal en el DSL de Prisma porque FORMAL/MOMENTANEA sí pueden repetirse
-- por Empresa — mismo patrón ya usado en ReposicionGastos/MovimientoSemanal
-- (Gastos transversal, septiembre 2026).
CREATE UNIQUE INDEX "proyectos_oficina_unico_por_empresa" ON "proyectos" ("empresaId") WHERE "tipo" = 'OFICINA';

-- Catálogo: nuevo módulo global "Gastos" (Gastos transversal, septiembre
-- 2026) — igual patrón que reporte_general/control_de_obra/catalogos ya
-- seeded. Insertar el catálogo NUNCA otorga acceso por sí solo: el acceso
-- real se resuelve por Empresa vía Plan+EmpresaModulo (empresaTieneModulo).
INSERT INTO "modulos" ("id", "clave", "nombre")
VALUES ('modulo_gastos', 'gastos', 'Gastos')
ON CONFLICT ("clave") DO NOTHING;

-- Backfill: habilita el módulo "gastos" ÚNICAMENTE para la Empresa Grupo
-- Conkuali (id = 'conkuali', su llave primaria real — mismo identificador ya
-- usado en los backfills de privadoHabilitado y reciboLeyenda de esta misma
-- sesión, nunca un match por nombre). Esto es un override explícito de
-- EmpresaModulo (habilitado = true) — el mecanismo general de módulos por
-- Empresa sigue siendo 100% configurable desde Portal Master para cualquier
-- otra Empresa, existente o futura; ninguna otra Empresa recibe este módulo
-- por este backfill.
INSERT INTO "empresa_modulos" ("empresaId", "moduloId", "habilitado")
SELECT 'conkuali', m."id", true
FROM "modulos" m
WHERE m."clave" = 'gastos'
  AND EXISTS (SELECT 1 FROM "empresas" WHERE "id" = 'conkuali')
ON CONFLICT ("empresaId", "moduloId") DO UPDATE SET "habilitado" = true;
