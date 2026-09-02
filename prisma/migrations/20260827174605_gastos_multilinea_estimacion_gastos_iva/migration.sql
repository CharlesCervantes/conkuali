-- AlterTable
ALTER TABLE "beneficiarios" ADD COLUMN     "mismaPersonaQueId" TEXT;

-- AlterTable
ALTER TABLE "estimaciones_cliente" ADD COLUMN     "aplicaIVA" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "montoAdministracionGastosOperativo" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoAdministracionGastosPrivado" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoAdministracionTrabajosOperativo" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoIVA" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "montoIVAOperativo" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "porcentajeAdministracionGastosOperativo" DECIMAL(5,2),
ADD COLUMN     "porcentajeAdministracionGastosPrivado" DECIMAL(5,2),
ADD COLUMN     "porcentajeIVA" DECIMAL(5,2),
ADD COLUMN     "subtotalGastosCobrables" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalOperativo" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalOperativo" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "estimacion_cliente_gastos" (
    "id" TEXT NOT NULL,
    "estimacionClienteId" TEXT NOT NULL,
    "gastoObraId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "estimacion_cliente_gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimacion_cliente_gastos_detalle" (
    "id" TEXT NOT NULL,
    "estimacionClienteGastoId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precioUnitario" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "estimacion_cliente_gastos_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_obra_detalle" (
    "id" TEXT NOT NULL,
    "gastoObraId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_obra_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimacion_cliente_gastos_gastoObraId_key" ON "estimacion_cliente_gastos"("gastoObraId");

-- CreateIndex
CREATE INDEX "estimacion_cliente_gastos_estimacionClienteId_idx" ON "estimacion_cliente_gastos"("estimacionClienteId");

-- CreateIndex
CREATE INDEX "estimacion_cliente_gastos_detalle_estimacionClienteGastoId_idx" ON "estimacion_cliente_gastos_detalle"("estimacionClienteGastoId");

-- CreateIndex
CREATE INDEX "gastos_obra_detalle_gastoObraId_idx" ON "gastos_obra_detalle"("gastoObraId");

-- CreateIndex
CREATE INDEX "beneficiarios_mismaPersonaQueId_idx" ON "beneficiarios"("mismaPersonaQueId");

-- CreateIndex
CREATE INDEX "gastos_obra_incluidoEnEstimacionClienteId_idx" ON "gastos_obra"("incluidoEnEstimacionClienteId");

-- AddForeignKey
ALTER TABLE "beneficiarios" ADD CONSTRAINT "beneficiarios_mismaPersonaQueId_fkey" FOREIGN KEY ("mismaPersonaQueId") REFERENCES "beneficiarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_gastos" ADD CONSTRAINT "estimacion_cliente_gastos_estimacionClienteId_fkey" FOREIGN KEY ("estimacionClienteId") REFERENCES "estimaciones_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_gastos" ADD CONSTRAINT "estimacion_cliente_gastos_gastoObraId_fkey" FOREIGN KEY ("gastoObraId") REFERENCES "gastos_obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimacion_cliente_gastos_detalle" ADD CONSTRAINT "estimacion_cliente_gastos_detalle_estimacionClienteGastoId_fkey" FOREIGN KEY ("estimacionClienteGastoId") REFERENCES "estimacion_cliente_gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_incluidoEnEstimacionClienteId_fkey" FOREIGN KEY ("incluidoEnEstimacionClienteId") REFERENCES "estimaciones_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_obra_detalle" ADD CONSTRAINT "gastos_obra_detalle_gastoObraId_fkey" FOREIGN KEY ("gastoObraId") REFERENCES "gastos_obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

