import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerDatosPdfRecibosSemana } from "@/lib/server/control-de-obra/recibos";
import { ReciboPagoDocumento } from "@/lib/pdf/recibo-pago";
import { manejarErrorApi } from "../../../../../../_lib/manejar-error";

// Un solo PDF con una página por contratista — solo cortes GENERADO con
// monto > 0 (ANULADO nunca entra), tal como se pidió. No es requisito que
// estén liquidados: se genera un recibo al vuelo para el que no tuviera uno
// todavía (mismo folio atómico de siempre).
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/recibos/semana/[semanaId]/pdf">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id, semanaId } = await ctx.params;

  try {
    const recibos = await obtenerDatosPdfRecibosSemana(usuario, id, semanaId);
    if (recibos.length === 0) {
      return Response.json(
        { error: "No hay cortes con monto para generar recibos esta semana." },
        { status: 400 }
      );
    }
    const buffer = await renderToBuffer(ReciboPagoDocumento({ recibos }));
    const etiqueta = `Semana ${recibos[0].semanaNumero}-${recibos[0].semanaAnio}`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Recibos ${etiqueta}.pdf"`,
      },
    });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
