-- CreateEnum
CREATE TYPE "EstatusTrabajoProcesamiento" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'ERROR');

-- CreateEnum
CREATE TYPE "TipoConsumoInteligencia" AS ENUM ('EXTRACCION_LLM', 'OCR', 'CHAT', 'EMBEDDING', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoDocumentoEgreso" AS ENUM ('COTIZACION', 'COMPROBANTE_PAGO', 'FACTURA', 'TICKET', 'RECIBO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstatusDocumentoEgreso" AS ENUM ('PENDIENTE', 'PROCESADO', 'VINCULADO', 'CONVERTIDO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "trabajos_procesamiento_documento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "referenciaModulo" TEXT NOT NULL,
    "archivoRef" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "estatus" "EstatusTrabajoProcesamiento" NOT NULL DEFAULT 'PENDIENTE',
    "procesandoDesde" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "maxIntentos" INTEGER NOT NULL DEFAULT 3,
    "ultimoIntentoEn" TIMESTAMP(3),
    "resultadoDeterministicoListo" BOOLEAN NOT NULL DEFAULT false,
    "resultadoIAListo" BOOLEAN NOT NULL DEFAULT false,
    "extractorVersion" TEXT,
    "modeloIA" TEXT,
    "promptVersion" TEXT,
    "error" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoEn" TIMESTAMP(3),

    CONSTRAINT "trabajos_procesamiento_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_consumo_inteligencia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "trabajoId" TEXT,
    "tipoConsumo" "TipoConsumoInteligencia" NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER,
    "tokensSalida" INTEGER,
    "unidades" INTEGER,
    "tarifaEntradaPorMillion" DECIMAL(10,4),
    "tarifaSalidaPorMillion" DECIMAL(10,4),
    "costoTotal" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "duracionMs" INTEGER,
    "estatus" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_consumo_inteligencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_egreso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "archivoRef" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "hashArchivo" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumentoEgreso" NOT NULL DEFAULT 'OTRO',
    "loteId" TEXT NOT NULL,
    "trabajoProcesamientoId" TEXT,
    "resultadoDeterministico" JSONB,
    "resultadoIA" JSONB,
    "propuestaReconciliada" JSONB,
    "valoresFinalesUsuario" JSONB,
    "estatus" "EstatusDocumentoEgreso" NOT NULL DEFAULT 'PENDIENTE',
    "egresoId" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoPorId" TEXT,
    "confirmadoEn" TIMESTAMP(3),

    CONSTRAINT "documentos_egreso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trabajos_procesamiento_documento_estatus_procesandoDesde_idx" ON "trabajos_procesamiento_documento"("estatus", "procesandoDesde");

-- CreateIndex
CREATE INDEX "trabajos_procesamiento_documento_estatus_ultimoIntentoEn_idx" ON "trabajos_procesamiento_documento"("estatus", "ultimoIntentoEn");

-- CreateIndex
CREATE INDEX "trabajos_procesamiento_documento_empresaId_modulo_operacion_idx" ON "trabajos_procesamiento_documento"("empresaId", "modulo", "operacion");

-- CreateIndex
CREATE INDEX "trabajos_procesamiento_documento_referenciaModulo_idx" ON "trabajos_procesamiento_documento"("referenciaModulo");

-- CreateIndex
CREATE INDEX "registro_consumo_inteligencia_empresaId_fecha_idx" ON "registro_consumo_inteligencia"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "registro_consumo_inteligencia_empresaId_modulo_idx" ON "registro_consumo_inteligencia"("empresaId", "modulo");

-- CreateIndex
CREATE INDEX "registro_consumo_inteligencia_trabajoId_idx" ON "registro_consumo_inteligencia"("trabajoId");

-- CreateIndex
CREATE INDEX "documentos_egreso_empresaId_estatus_idx" ON "documentos_egreso"("empresaId", "estatus");

-- CreateIndex
CREATE INDEX "documentos_egreso_empresaId_hashArchivo_idx" ON "documentos_egreso"("empresaId", "hashArchivo");

-- CreateIndex
CREATE INDEX "documentos_egreso_loteId_idx" ON "documentos_egreso"("loteId");

-- CreateIndex
CREATE INDEX "documentos_egreso_egresoId_idx" ON "documentos_egreso"("egresoId");

-- CreateIndex
CREATE INDEX "documentos_egreso_trabajoProcesamientoId_idx" ON "documentos_egreso"("trabajoProcesamientoId");

-- AddForeignKey
ALTER TABLE "trabajos_procesamiento_documento" ADD CONSTRAINT "trabajos_procesamiento_documento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajos_procesamiento_documento" ADD CONSTRAINT "trabajos_procesamiento_documento_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_consumo_inteligencia" ADD CONSTRAINT "registro_consumo_inteligencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_consumo_inteligencia" ADD CONSTRAINT "registro_consumo_inteligencia_trabajoId_fkey" FOREIGN KEY ("trabajoId") REFERENCES "trabajos_procesamiento_documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_egreso" ADD CONSTRAINT "documentos_egreso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_egreso" ADD CONSTRAINT "documentos_egreso_trabajoProcesamientoId_fkey" FOREIGN KEY ("trabajoProcesamientoId") REFERENCES "trabajos_procesamiento_documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_egreso" ADD CONSTRAINT "documentos_egreso_egresoId_fkey" FOREIGN KEY ("egresoId") REFERENCES "egresos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_egreso" ADD CONSTRAINT "documentos_egreso_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_egreso" ADD CONSTRAINT "documentos_egreso_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
