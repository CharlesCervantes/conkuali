import "server-only";
import { put } from "@vercel/blob";

// Único punto de subida a Vercel Blob — Recibos, Gastos de Obra y Órdenes de
// Compra lo comparten. Nunca se guardan binarios en Postgres, solo la URL
// resultante + el nombre original (mismo patrón que ya usaba
// ReciboPago.archivoEvidenciaUrl antes de que este helper existiera).
export async function subirArchivo(
  carpeta: string,
  archivo: File
): Promise<{ url: string; nombre: string }> {
  const blob = await put(`${carpeta}/${archivo.name}`, archivo, {
    access: "public",
    addRandomSuffix: true,
  });
  return { url: blob.url, nombre: archivo.name };
}
