-- AlterTable
ALTER TABLE "egresos" ADD COLUMN     "clasificacionManual" TEXT,
ADD COLUMN     "conciliadoEn" TIMESTAMP(3),
ADD COLUMN     "fechaPago" TIMESTAMP(3),
ADD COLUMN     "referenciaPago" TEXT;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "defaultInclusionContabilidad" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "estimacion_cliente_capas" ADD COLUMN     "incluidoEnContabilidad" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "gastos_obra" ADD COLUMN     "incluidoEnContabilidad" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ingresos" ADD COLUMN     "clasificacionManual" TEXT,
ADD COLUMN     "conciliadoEn" TIMESTAMP(3),
ADD COLUMN     "fechaCobro" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "medios_financieros" ADD COLUMN     "fechaSaldoInicial" TIMESTAMP(3),
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'MXN',
ADD COLUMN     "numeroCuentaEnmascarado" TEXT,
ADD COLUMN     "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "movimientos_financieros_cliente" ADD COLUMN     "incluidoEnContabilidad" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "egresos_medioFinancieroId_fechaPago_idx" ON "egresos"("medioFinancieroId", "fechaPago");

-- CreateIndex
CREATE INDEX "estimacion_cliente_capas_estatus_incluidoEnContabilidad_idx" ON "estimacion_cliente_capas"("estatus", "incluidoEnContabilidad");

-- CreateIndex
CREATE INDEX "gastos_obra_empresaId_incluidoEnContabilidad_fecha_idx" ON "gastos_obra"("empresaId", "incluidoEnContabilidad", "fecha");

-- CreateIndex
CREATE INDEX "ingresos_cuentaReceptoraId_fechaCobro_idx" ON "ingresos"("cuentaReceptoraId", "fechaCobro");
