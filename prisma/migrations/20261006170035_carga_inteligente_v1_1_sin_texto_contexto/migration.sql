-- AlterEnum
ALTER TYPE "EstatusDocumentoEgreso" ADD VALUE 'SIN_TEXTO';

-- AlterTable
ALTER TABLE "documentos_egreso" ADD COLUMN     "contextoUsuario" TEXT,
ADD COLUMN     "contextosAdicionales" JSONB;
