import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerDatosPdfRecibo } from "@/lib/server/control-de-obra/recibos";
import { ReciboPagoDocumento } from "@/lib/pdf/recibo-pago";
import { manejarErrorApi } from "../../../../../_lib/manejar-error";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/recibos/[reciboId]/pdf">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }
  const { reciboId } = await ctx.params;

  try {
    const datos = await obtenerDatosPdfRecibo(usuario, reciboId);
    const buffer = await renderToBuffer(ReciboPagoDocumento({ recibos: [datos] }));

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${datos.folio}.pdf"`,
      },
    });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
