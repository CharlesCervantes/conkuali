-- CreateTable
CREATE TABLE "contratistas" (
    "beneficiarioId" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "contratistas_pkey" PRIMARY KEY ("beneficiarioId")
);

-- AddForeignKey
ALTER TABLE "contratistas" ADD CONSTRAINT "contratistas_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
