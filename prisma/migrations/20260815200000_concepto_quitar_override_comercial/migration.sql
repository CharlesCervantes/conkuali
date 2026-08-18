-- AlterTable
-- Se elimina precioUnitarioClienteOverride a propósito (decisión de sesión,
-- agosto 2026) — el campo/lógica de precio comercial override ya no se usa.
-- Había 2 valores reales no nulos (Mississippi, MEZQUITAL) al momento de
-- esta migración; se pierden de forma permanente aquí (quedan mencionados
-- en la bitácora de esos conceptos como JSON histórico, no como valor vivo)
-- — confirmado explícitamente con el usuario antes de aplicarla.
ALTER TABLE "conceptos" DROP COLUMN "precioUnitarioClienteOverride";
