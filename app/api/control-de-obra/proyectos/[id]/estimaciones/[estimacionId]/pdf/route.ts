import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerDatosDocumentoEstimacion } from "@/lib/server/control-de-obra/documentos-estimacion";
import { EstimacionHistoricaDocumento } from "@/lib/pdf/estimacion-historica";
import { sanitizarNombreArchivo } from "@/lib/pdf/nombre-archivo";
import { manejarErrorApi } from "@/app/api/control-de-obra/_lib/manejar-error";

// Capa "operativo" (Cliente) — sin gate propio adicional, igual que la
// pantalla en vivo: el bloque financiero ya viene podado desde
// obtenerDatosDocumentoEstimacion/obtenerControlContractual según
// puedeVerFinancieroCliente, nunca se decide aquí (historial documental,
// agosto 2026).
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/estimaciones/[estimacionId]/pdf">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }
  const { estimacionId } = await ctx.params;

  try {
    const datos = await obtenerDatosDocumentoEstimacion(usuario, estimacionId, "operativo");
    const buffer = await renderToBuffer(EstimacionHistoricaDocumento({ datos }));

    const nombre = `Estimacion-${String(datos.numero).padStart(3, "0")}-${sanitizarNombreArchivo(datos.proyectoNombre)}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombre}"`,
      },
    });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
