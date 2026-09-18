import { renderToBuffer } from "@react-pdf/renderer";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerDatosPdfOrdenCompra } from "@/lib/server/control-de-obra/ordenes-compra";
import { OrdenCompraDocumento } from "@/lib/pdf/orden-compra";
import { manejarErrorApi } from "../../../../../_lib/manejar-error";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/ordenes-compra/[ocId]/pdf">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return Response.json({ error: "No autenticado." }, { status: 401 });
  }
  const { ocId } = await ctx.params;

  try {
    const datos = await obtenerDatosPdfOrdenCompra(usuario, ocId);
    const buffer = await renderToBuffer(OrdenCompraDocumento({ datos }));

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
