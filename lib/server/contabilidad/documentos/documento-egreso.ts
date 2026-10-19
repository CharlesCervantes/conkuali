import "server-only";
import { db } from "@/lib/server/db";
import { subirArchivo } from "@/lib/server/archivos";
import { calcularHashArchivo, buscarDocumentoPorHash, encolarTrabajo } from "@/lib/server/inteligencia/trabajos";
import { extraerTextoPdfNativo } from "@/lib/server/inteligencia/extractor-pdf-nativo";
import { procesarTrabajosPendientes } from "@/lib/server/inteligencia/worker";
import { VERSION_SCHEMA_HECHOS_EGRESO } from "./schema-hechos-egreso";
import { puedeVerContabilidad, puedeRegistrarMovimientoContable } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { requerirCapturaInteligente } from "./habilitacion";
import "./reconciliar-egreso"; // efecto secundario: se auto-registra en registro-operaciones

// Carga inteligente de documentos — entrypoint de Contabilidad. Único
// archivo de este módulo que conoce R2/hash/cola; el procesamiento real
// (extracción + reconciliación) vive en reconciliar-egreso.ts (Carga
// inteligente de documentos, V1 — octubre 2026).

const MAX_ARCHIVOS_POR_LOTE = 5;
const MAX_BYTES_POR_ARCHIVO = 10 * 1024 * 1024; // 10MB
const MAX_PAGINAS_POR_DOCUMENTO = 20;

type MimeSoportado = "application/pdf" | "image/jpeg" | "image/png";

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// Validación de MIME real por MAGIC BYTES — nunca se confía en el
// Content-Type que manda el navegador ni en la extensión del nombre de
// archivo. V1 soporta PDF (texto nativo o escaneado — estrategia VISION
// para este último, ver reconciliar-egreso.ts) y JPG/PNG directos (siempre
// VISION, no hay texto que extraer de una imagen suelta) — V1.2, octubre
// 2026.
function tipoArchivoDetectado(bytes: Buffer): MimeSoportado | null {
  if (bytes.length > 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return null;
}

export type DocumentoSubidoResultado = {
  documentoEgresoId: string;
  duplicado: boolean;
  nombre: string;
};

export async function subirDocumentosEgreso(
  usuario: UsuarioSesion,
  archivos: { nombre: string; tipoMime: string; bytes: Buffer }[],
  contextoUsuario?: string
): Promise<{ loteId: string; documentos: DocumentoSubidoResultado[] }> {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  // Antes de validar, subir a R2 o encolar nada.
  await requerirCapturaInteligente(empresaId);

  if (archivos.length === 0) throw new ValidacionError("Sube al menos un documento.");
  if (archivos.length > MAX_ARCHIVOS_POR_LOTE) {
    throw new ValidacionError(`No se pueden subir más de ${MAX_ARCHIVOS_POR_LOTE} documentos a la vez.`);
  }

  const contexto = contextoUsuario?.trim() || null;
  const loteId = crypto.randomUUID();
  const documentos: DocumentoSubidoResultado[] = [];

  for (const archivo of archivos) {
    if (archivo.bytes.length > MAX_BYTES_POR_ARCHIVO) {
      throw new ValidacionError(`"${archivo.nombre}" supera el límite de 10MB.`);
    }
    const tipoDetectado = tipoArchivoDetectado(archivo.bytes);
    if (!tipoDetectado) {
      throw new ValidacionError(`"${archivo.nombre}" no es un PDF, JPG o PNG válido.`);
    }

    if (tipoDetectado === "application/pdf") {
      const { paginas } = await extraerTextoPdfNativo(archivo.bytes);
      if (paginas > MAX_PAGINAS_POR_DOCUMENTO) {
        throw new ValidacionError(`"${archivo.nombre}" tiene ${paginas} páginas — el máximo soportado es ${MAX_PAGINAS_POR_DOCUMENTO}.`);
      }
    }

    const hashArchivo = calcularHashArchivo(archivo.bytes);

    // Deduplicación — SIEMPRE scoped por empresaId (ver trabajos.ts). Si ya
    // se subió este mismo archivo antes en esta Empresa, se reutiliza ese
    // documento en vez de reprocesar y pagar IA de nuevo.
    const duplicado = await buscarDocumentoPorHash(empresaId, hashArchivo);
    if (duplicado) {
      // Reasignar al lote actual — si no, la pantalla de esta subida (que
      // consulta por loteId) nunca encuentra el documento reutilizado y
      // queda con una "Propuesta" vacía (bug encontrado en pruebas reales,
      // octubre 2026).
      const datosActualizacion: { loteId?: string; contextosAdicionales?: object } = {};
      if (duplicado.loteId !== loteId) datosActualizacion.loteId = loteId;

      // El contexto ORIGINAL nunca se sobreescribe. Si esta subida trae un
      // contexto distinto, se agrega como anotación adicional (auditable)
      // en vez de perderse — nunca dispara una nueva llamada a IA; un futuro
      // "Reanalizar con nuevo contexto" sería una acción explícita aparte.
      if (contexto && contexto !== duplicado.contextoUsuario) {
        const existentes = Array.isArray(duplicado.contextosAdicionales) ? duplicado.contextosAdicionales : [];
        datosActualizacion.contextosAdicionales = [
          ...existentes,
          { texto: contexto, fecha: new Date().toISOString(), usuarioId: usuario.id },
        ];
      }

      if (Object.keys(datosActualizacion).length > 0) {
        await db.documentoEgreso.update({ where: { id: duplicado.id }, data: datosActualizacion });
      }

      documentos.push({ documentoEgresoId: duplicado.id, duplicado: true, nombre: archivo.nombre });
      continue;
    }

    // A partir de aquí se usa el tipo REAL detectado por magic bytes, nunca
    // el que mandó el cliente — así R2 y el worker siempre saben con qué
    // están trabajando de verdad.
    const subido = await subirArchivo(`contabilidad/${empresaId}/documentos-egreso`, archivoComoFile(archivo, tipoDetectado));

    const documentoEgreso = await db.documentoEgreso.create({
      data: {
        empresaId,
        archivoRef: subido.ref,
        archivoNombre: subido.nombre,
        tipoMime: tipoDetectado,
        hashArchivo,
        loteId,
        contextoUsuario: contexto,
        subidoPorId: usuario.id,
      },
    });

    await encolarTrabajo({
      empresaId,
      modulo: "contabilidad",
      operacion: "extraccion_documento_egreso",
      referenciaModulo: documentoEgreso.id,
      archivoRef: subido.ref,
      tipoMime: tipoDetectado,
      creadoPorId: usuario.id,
      extractorVersion: "extraccion-v2", // detecta y elige TEXTO_NATIVO o VISION — ver estrategiaExtraccion
      modeloIA: "gpt-5-mini",
      promptVersion: VERSION_SCHEMA_HECHOS_EGRESO,
    });

    documentos.push({ documentoEgresoId: documentoEgreso.id, duplicado: false, nombre: archivo.nombre });
  }

  // Dispara el procesamiento de inmediato (no bloquea la respuesta al
  // usuario) — el cron sigue siendo la red de seguridad para jobs
  // abandonados/reintentos, no el único disparador. Si el proceso serverless
  // termina antes de que esto acabe, el worker simplemente lo recoge en la
  // siguiente corrida de cron — nunca se pierde el trabajo encolado.
  void procesarTrabajosPendientes().catch(() => {
    // Silencioso a propósito: un fallo aquí no debe tirar la respuesta de
    // "documentos subidos" — el cron reintentará.
  });

  return { loteId, documentos };
}

function archivoComoFile(archivo: { nombre: string; bytes: Buffer }, tipoMime: string): File {
  return new File([new Uint8Array(archivo.bytes)], archivo.nombre, { type: tipoMime });
}

export async function obtenerDocumentoEgreso(usuario: UsuarioSesion, id: string) {
  const empresaId = requerirContabilidad(usuario);
  await requerirCapturaInteligente(empresaId);
  const documento = await db.documentoEgreso.findFirst({
    where: { id, empresaId },
    include: { trabajoProcesamiento: { select: { estatus: true, error: true, intentos: true, maxIntentos: true } } },
  });
  if (!documento) throw new ValidacionError("Documento no encontrado.");
  return documento;
}

export async function obtenerDocumentosDelLote(usuario: UsuarioSesion, loteId: string) {
  const empresaId = requerirContabilidad(usuario);
  await requerirCapturaInteligente(empresaId);
  return db.documentoEgreso.findMany({
    where: { empresaId, loteId },
    include: { trabajoProcesamiento: { select: { estatus: true, error: true, intentos: true, maxIntentos: true } } },
    orderBy: { createdAt: "asc" },
  });
}
