-- AlterEnum
ALTER TYPE "TipoConsumoInteligencia" ADD VALUE 'EXTRACCION_LLM_VISUAL';

-- AlterTable
ALTER TABLE "documentos_egreso" ADD COLUMN     "estrategiaExtraccion" TEXT;
