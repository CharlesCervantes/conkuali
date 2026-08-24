-- AlterTable
ALTER TABLE "beneficiarios" ADD COLUMN     "usuarioId" TEXT;

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "rfc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "beneficiarios_usuarioId_key" ON "beneficiarios"("usuarioId");

-- AddForeignKey
ALTER TABLE "beneficiarios" ADD CONSTRAINT "beneficiarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
