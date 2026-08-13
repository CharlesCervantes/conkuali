import Link from "next/link";
import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeAdministrarProyectos } from "@/lib/server/permisos";
import { listarProyectos } from "@/lib/server/control-de-obra/proyectos";
import type { EstatusProyecto, Proyecto } from "@/lib/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { EstatusProyectoBadge } from "@/components/control-de-obra/estatus-proyecto-badge";
import { cambiarEstatusAction } from "./actions";

const TIPO_LABEL: Record<string, string> = {
  FORMAL: "Obra",
  MOMENTANEA: "Obra momentánea",
  OFICINA: "Oficina",
};

export default async function ControlDeObraPage() {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }

  if (!empresaTieneModulo(usuario, "control_de_obra")) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu plan no incluye el módulo de Control de Obra.
      </Card>
    );
  }

  const proyectos = await listarProyectos(usuario);
  const operativos = proyectos.filter(
    (p) => p.estatus === "ACTIVO" || p.estatus === "PAUSADO"
  );
  const historicos = proyectos.filter(
    (p) => p.estatus === "CERRADO" || p.estatus === "CANCELADO"
  );
  const puedeAdministrar = puedeAdministrarProyectos(usuario);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            Control de Obra
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Administración de proyectos
          </p>
        </div>
        {puedeAdministrar && (
          <Link href="/control-de-obra/nuevo">
            <Button>+ Nuevo proyecto</Button>
          </Link>
        )}
      </div>

      {operativos.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay proyectos activos o pausados.
        </Card>
      ) : (
        <Card className="enter overflow-hidden">
          <Table>
            <Thead>
              <Tr>
                <Th>Proyecto</Th>
                <Th>Tipo</Th>
                <Th>Cliente</Th>
                <Th>Estatus</Th>
                {puedeAdministrar && <Th className="text-right">Acciones</Th>}
              </Tr>
            </Thead>
            <tbody>
              {operativos.map((p) => (
                <FilaProyecto
                  key={p.id}
                  proyecto={p}
                  puedeAdministrar={puedeAdministrar}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {historicos.length > 0 && (
        <Card className="enter overflow-hidden">
          <details>
            <summary className="cursor-pointer list-none px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold text-[var(--foreground)]">
                Histórico
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">
                {historicos.length} proyecto{historicos.length === 1 ? "" : "s"}{" "}
                cerrado{historicos.length === 1 ? "" : "s"} o cancelado
                {historicos.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="border-t border-[var(--border)]">
              <table className="w-full text-sm">
                <Thead>
                  <Tr>
                    <Th>Proyecto</Th>
                    <Th>Tipo</Th>
                    <Th>Cliente</Th>
                    <Th>Estatus</Th>
                    {puedeAdministrar && <Th className="text-right">Acciones</Th>}
                  </Tr>
                </Thead>
                <tbody>
                  {historicos.map((p) => (
                    <FilaProyecto
                      key={p.id}
                      proyecto={p}
                      puedeAdministrar={puedeAdministrar}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}

function FilaProyecto({
  proyecto,
  puedeAdministrar,
}: {
  proyecto: Proyecto;
  puedeAdministrar: boolean;
}) {
  return (
    <Tr>
      <Td className="font-medium">
        {puedeAdministrar ? (
          <Link
            href={`/control-de-obra/${proyecto.id}/editar`}
            className="hover:underline"
          >
            {proyecto.nombre}
          </Link>
        ) : (
          proyecto.nombre
        )}
      </Td>
      <Td className="text-[var(--muted)]">
        {TIPO_LABEL[proyecto.tipo] ?? proyecto.tipo}
      </Td>
      <Td className="text-[var(--muted)]">{proyecto.cliente ?? "—"}</Td>
      <Td>
        <EstatusProyectoBadge estatus={proyecto.estatus} />
      </Td>
      {puedeAdministrar && (
        <Td>
          <div className="flex justify-end gap-2">
            {transicionesDisponibles(proyecto.estatus).map((t) => (
              <form
                key={t.estatus}
                action={cambiarEstatusAction.bind(null, proyecto.id, t.estatus)}
              >
                <Button type="submit" variant="outline" className="px-2.5 py-1 text-xs">
                  {t.etiqueta}
                </Button>
              </form>
            ))}
          </div>
        </Td>
      )}
    </Tr>
  );
}

function transicionesDisponibles(
  estatus: EstatusProyecto
): { estatus: EstatusProyecto; etiqueta: string }[] {
  switch (estatus) {
    case "ACTIVO":
      return [
        { estatus: "PAUSADO", etiqueta: "Pausar" },
        { estatus: "CERRADO", etiqueta: "Cerrar" },
        { estatus: "CANCELADO", etiqueta: "Cancelar" },
      ];
    case "PAUSADO":
      return [
        { estatus: "ACTIVO", etiqueta: "Reactivar" },
        { estatus: "CERRADO", etiqueta: "Cerrar" },
        { estatus: "CANCELADO", etiqueta: "Cancelar" },
      ];
    case "CERRADO":
    case "CANCELADO":
      return [{ estatus: "ACTIVO", etiqueta: "Reabrir" }];
    default:
      return [];
  }
}
