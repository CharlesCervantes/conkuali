-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "privadoHabilitado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "razonSocial" TEXT,
ADD COLUMN     "rfc" TEXT;

-- AlterTable
ALTER TABLE "estimacion_cliente_capas" ADD COLUMN     "brandingSnapshot" JSONB;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "empresa_modulos" (
    "empresaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL,

    CONSTRAINT "empresa_modulos_pkey" PRIMARY KEY ("empresaId","moduloId")
);

-- CreateIndex
CREATE INDEX "usuarios_empresaId_idx" ON "usuarios"("empresaId");

-- AddForeignKey
ALTER TABLE "empresa_modulos" ADD CONSTRAINT "empresa_modulos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_modulos" ADD CONSTRAINT "empresa_modulos_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill obligatorio: Empresa.privadoHabilitado nace en false (seguro por
-- defecto para tenants nuevos) — Conkuali ya usa la capa privada hoy, así
-- que se reactiva explícitamente aquí para no perder acceso al aplicar esta
-- migración (ver plan "Portal Master / Administración de Empresas", C.3/B).
UPDATE "empresas" SET "privadoHabilitado" = true WHERE "id" = 'conkuali';
