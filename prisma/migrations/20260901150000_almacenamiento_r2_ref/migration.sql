-- Renombra las columnas que hoy guardan una referencia de almacenamiento
-- (antes URL pública de Vercel Blob, ahora objectKey privado de Cloudflare
-- R2) de "*Url" a "*Ref" — nombre neutral que no asume un tipo de valor
-- específico, porque durante la transición una misma columna puede seguir
-- conteniendo una URL http(s) histórica real de Vercel Blob junto a
-- objectKeys nuevos de R2 en otras filas. RENAME COLUMN preserva los datos
-- existentes tal cual (no es un DROP+ADD) — ningún archivo histórico se
-- pierde ni deja de resolverse (ver lib/server/archivos.ts, esReferenciaRemota).

ALTER TABLE "empresas" RENAME COLUMN "logoUrl" TO "logoRef";
ALTER TABLE "proyectos" RENAME COLUMN "imagenUrl" TO "imagenRef";
ALTER TABLE "recibos_pago" RENAME COLUMN "archivoEvidenciaUrl" TO "archivoEvidenciaRef";
ALTER TABLE "gastos_obra" RENAME COLUMN "ticketUrl" TO "ticketRef";
ALTER TABLE "gastos_obra" RENAME COLUMN "facturaUrl" TO "facturaRef";
ALTER TABLE "ordenes_compra" RENAME COLUMN "cotizacionUrl" TO "cotizacionRef";
ALTER TABLE "ordenes_compra" RENAME COLUMN "comprobantePagoUrl" TO "comprobantePagoRef";
ALTER TABLE "ordenes_compra" RENAME COLUMN "facturaUrl" TO "facturaRef";
