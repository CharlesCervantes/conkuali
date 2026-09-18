-- CreateEnum
CREATE TYPE "EstatusPartida" AS ENUM ('ACTIVA', 'CANCELADA');

-- AlterTable
ALTER TABLE "partidas" ADD COLUMN     "estatus" "EstatusPartida" NOT NULL DEFAULT 'ACTIVA';

