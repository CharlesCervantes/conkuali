-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "cliente" TEXT,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "fechaEstimadaTermino" TIMESTAMP(3),
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "numeroContrato" TEXT,
ADD COLUMN     "ubicacion" TEXT;
