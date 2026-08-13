-- CreateEnum
CREATE TYPE "TipoBeneficiario" AS ENUM ('CONTRATISTA', 'PROVEEDOR', 'ADMINISTRACION');

-- CreateEnum
CREATE TYPE "TipoProyecto" AS ENUM ('FORMAL', 'MOMENTANEA', 'OFICINA');

-- CreateEnum
CREATE TYPE "EstatusProyecto" AS ENUM ('ACTIVO', 'PAUSADO', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstatusAprobacion" AS ENUM ('PENDIENTE_VALIDACION', 'APROBADO', 'RECHAZADO', 'POSPUESTO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstatusPago" AS ENUM ('SIN_MOVIMIENTO', 'PENDIENTE_PAGO', 'PAGADO_PUENTE', 'LIQUIDADO');

-- CreateEnum
CREATE TYPE "EstatusAditiva" AS ENUM ('PENDIENTE', 'AUTORIZADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstatusSemana" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateTable
CREATE TABLE "proyectos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoProyecto" NOT NULL DEFAULT 'FORMAL',
    "estatus" "EstatusProyecto" NOT NULL DEFAULT 'ACTIVO',
    "fechaInicio" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiarios" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoBeneficiario" NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "beneficiarioId" TEXT NOT NULL,
    "giro" TEXT,
    "vendedor" TEXT,
    "telefono" TEXT,
    "credito" TEXT,
    "cuentaBancaria" TEXT,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("beneficiarioId")
);

-- CreateTable
CREATE TABLE "personal_administrativo" (
    "beneficiarioId" TEXT NOT NULL,
    "nss" TEXT,
    "fechaNacimiento" TIMESTAMP(3),

    CONSTRAINT "personal_administrativo_pkey" PRIMARY KEY ("beneficiarioId")
);

-- CreateTable
CREATE TABLE "beneficiario_proyectos" (
    "id" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "concepto" TEXT,
    "montoContrato" DECIMAL(14,2),
    "puesto" TEXT,
    "sueldo" DECIMAL(14,2),
    "sueldoVariable" BOOLEAN,
    "fechaIngreso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiario_proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aditivas" (
    "id" TEXT NOT NULL,
    "beneficiarioProyectoId" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estatus" "EstatusAditiva" NOT NULL DEFAULT 'PENDIENTE',
    "solicitadaPorId" TEXT NOT NULL,
    "autorizadaPorId" TEXT,
    "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAutorizacion" TIMESTAMP(3),

    CONSTRAINT "aditivas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semanas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "estado" "EstatusSemana" NOT NULL DEFAULT 'ABIERTA',

    CONSTRAINT "semanas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_semanales" (
    "id" TEXT NOT NULL,
    "beneficiarioProyectoId" TEXT NOT NULL,
    "semanaId" TEXT NOT NULL,
    "montoEntreSemana" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "montoFinSemana" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estatusAprobacion" "EstatusAprobacion" NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
    "estatusPago" "EstatusPago" NOT NULL DEFAULT 'SIN_MOVIMIENTO',
    "cubiertoPorFondoPuente" BOOLEAN NOT NULL DEFAULT false,
    "fondoPuenteUsuarioId" TEXT,
    "enviadoPorId" TEXT NOT NULL,
    "aprobadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimientos_semanales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios_movimiento" (
    "id" TEXT NOT NULL,
    "movimientoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proyectos_empresaId_idx" ON "proyectos"("empresaId");

-- CreateIndex
CREATE INDEX "beneficiarios_empresaId_tipo_idx" ON "beneficiarios"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "beneficiario_proyectos_proyectoId_idx" ON "beneficiario_proyectos"("proyectoId");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiario_proyectos_beneficiarioId_proyectoId_key" ON "beneficiario_proyectos"("beneficiarioId", "proyectoId");

-- CreateIndex
CREATE INDEX "aditivas_beneficiarioProyectoId_idx" ON "aditivas"("beneficiarioProyectoId");

-- CreateIndex
CREATE UNIQUE INDEX "semanas_empresaId_numero_anio_key" ON "semanas"("empresaId", "numero", "anio");

-- CreateIndex
CREATE INDEX "movimientos_semanales_semanaId_idx" ON "movimientos_semanales"("semanaId");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_semanales_beneficiarioProyectoId_semanaId_key" ON "movimientos_semanales"("beneficiarioProyectoId", "semanaId");

-- CreateIndex
CREATE INDEX "comentarios_movimiento_movimientoId_idx" ON "comentarios_movimiento"("movimientoId");

-- AddForeignKey
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiarios" ADD CONSTRAINT "beneficiarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_administrativo" ADD CONSTRAINT "personal_administrativo_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiario_proyectos" ADD CONSTRAINT "beneficiario_proyectos_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "beneficiarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiario_proyectos" ADD CONSTRAINT "beneficiario_proyectos_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivas" ADD CONSTRAINT "aditivas_beneficiarioProyectoId_fkey" FOREIGN KEY ("beneficiarioProyectoId") REFERENCES "beneficiario_proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivas" ADD CONSTRAINT "aditivas_solicitadaPorId_fkey" FOREIGN KEY ("solicitadaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aditivas" ADD CONSTRAINT "aditivas_autorizadaPorId_fkey" FOREIGN KEY ("autorizadaPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semanas" ADD CONSTRAINT "semanas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_beneficiarioProyectoId_fkey" FOREIGN KEY ("beneficiarioProyectoId") REFERENCES "beneficiario_proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_semanaId_fkey" FOREIGN KEY ("semanaId") REFERENCES "semanas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_fondoPuenteUsuarioId_fkey" FOREIGN KEY ("fondoPuenteUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_semanales" ADD CONSTRAINT "movimientos_semanales_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_movimiento" ADD CONSTRAINT "comentarios_movimiento_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "movimientos_semanales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_movimiento" ADD CONSTRAINT "comentarios_movimiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
