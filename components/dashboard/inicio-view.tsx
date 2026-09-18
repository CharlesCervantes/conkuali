import Link from "next/link";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Wallet,
  ChevronRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Receipt,
  AlertTriangle,
  Clock,
  FileCheck,
  HandCoins,
  CircleCheckBig,
  AlertOctagon,
  PauseCircle,
  FileWarning,
  ScanEye,
  RotateCcw,
  CalendarClock,
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/dinero";
import type {
  ResumenEjecutivo,
  FilaProyectoDashboard,
  EstadoSalud,
  AlertaDashboard,
  CompromisoDashboard,
} from "@/lib/server/dashboard";

// Inicio es un resumen de una sola pantalla, no una bitácora — cada bloque
// de la fila inferior tiene una altura fija y limita CUÁNTOS registros
// muestra (nunca deja que la cantidad de datos haga crecer la tarjeta).
// Rediseño de Inicio, septiembre 2026 — extiende el rediseño visual de
// agosto/septiembre con Gastos transversal/Contabilidad, sin tocar la
// técnica de "sin scroll" ya probada. nivelAcceso decide qué tanto se
// renderiza (Supervisor = "operativo": nunca montos/Contabilidad/
// compromisos, ni solo ocultos — el dato mismo llega null desde
// dashboard.ts).
const MAX_OBRAS_VISIBLES = 4;
const MAX_PROYECTOS_GRAFICA = 4;
const MAX_ALERTAS_VISIBLES = 4;
const MAX_COMPROMISOS_VISIBLES = 5;
const ALTURA_FILA_INFERIOR = "h-[252px]";

const TIPO_LABEL: Record<string, string> = {
  FORMAL: "Obra",
  MOMENTANEA: "Obra momentánea",
  OFICINA: "Empresa",
};

const SALUD_ICONO: Record<EstadoSalud, LucideIcon> = {
  SALUDABLE: CircleCheckBig,
  ATENCION: AlertTriangle,
  REQUIERE_ACCION: AlertOctagon,
  EN_SEGUIMIENTO: PauseCircle,
};

const SALUD_LABEL: Record<EstadoSalud, string> = {
  SALUDABLE: "Saludable",
  ATENCION: "Atención",
  REQUIERE_ACCION: "Requiere acción",
  EN_SEGUIMIENTO: "En seguimiento",
};

const SALUD_TOKEN: Record<EstadoSalud, { text: string; soft: string; dot: string }> = {
  SALUDABLE: { text: "text-success", soft: "bg-success-soft", dot: "bg-success" },
  ATENCION: { text: "text-warning", soft: "bg-warning-soft", dot: "bg-warning" },
  REQUIERE_ACCION: { text: "text-danger", soft: "bg-danger-soft", dot: "bg-danger" },
  EN_SEGUIMIENTO: { text: "text-[var(--muted)]", soft: "bg-black/[0.05]", dot: "bg-[var(--muted)]" },
};

const ALERTA_ICONO: Record<AlertaDashboard["tipo"], LucideIcon> = {
  pagos_pendientes: CreditCard,
  semanas_sin_cerrar: Clock,
  gastos_pendientes: Receipt,
  estimaciones_listas: FileCheck,
  pendiente_cobro: HandCoins,
  desviacion: TrendingDown,
  facturas_pendientes: FileWarning,
  cfdi_diferencia: ScanEye,
  reposicion_pendiente_antigua: RotateCcw,
  gasto_recurrente_variable_pendiente: CalendarClock,
  sin_avance_reciente: AlertTriangle,
};

const COMPROMISO_ICONO: Record<CompromisoDashboard["tipo"], LucideIcon> = {
  gasto_recurrente_variable: CalendarClock,
  reposicion_pendiente: RotateCcw,
  pago_pendiente: CreditCard,
};

const PERIODO_LABEL: Record<ResumenEjecutivo["periodo"], string> = {
  semana: "la semana",
  mes: "el mes",
  mes_anterior: "el mes anterior",
  acumulado: "lo acumulado",
};

function pct(n: number | null, decimales = 1): string {
  return n === null ? "—" : `${n.toFixed(decimales)}%`;
}

export function InicioView({ resumen }: { resumen: ResumenEjecutivo }) {
  const {
    saludo,
    empresaNombre,
    semanaLabel,
    nivelAcceso,
    puedeVerPrivado,
    vista,
    periodo,
    obrasActivas,
    avanceFisicoConsolidado,
    porPagarObras,
    porPagarEmpresa,
    porCobrar,
    flujoDinero,
    resumenFiscal,
    utilidadConsolidada,
    alertas,
    compromisos,
    proyectos,
  } = resumen;

  const esCompleto = nivelAcceso === "completo";
  const proyectosActivos = proyectos.filter((p) => p.estatus === "ACTIVO");
  const mostrarUtilidad = esCompleto && vista === "privado" && puedeVerPrivado && utilidadConsolidada !== null;

  return (
    <div className="enter space-y-4 lg:h-[calc(100vh-4rem)] lg:flex lg:flex-col lg:overflow-hidden">
      <Encabezado
        saludo={saludo}
        empresaNombre={empresaNombre}
        semanaLabel={semanaLabel}
        puedeVerPrivado={puedeVerPrivado}
        vista={vista}
        periodo={periodo}
      />

      <div
        className={cn(
          "grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2",
          esCompleto ? "lg:grid-cols-5" : "lg:grid-cols-2 lg:max-w-xl"
        )}
      >
        <TarjetaObrasActivas obrasActivas={obrasActivas} />
        <TarjetaAvanceFisico avanceFisicoConsolidado={avanceFisicoConsolidado} periodo={periodo} />
        {esCompleto && resumenFiscal && (
          <>
            <TarjetaKPI
              icono={ArrowDownLeft}
              tinte="bg-success-soft text-success"
              etiqueta="Ingresos fiscales"
              valor={formatMoney(resumenFiscal.ingresosFiscales)}
              detalle={`${PERIODO_LABEL[periodo]} · Contabilidad`}
              href="/contabilidad"
            />
            <TarjetaKPI
              icono={ArrowUpRight}
              tinte="bg-danger-soft text-danger"
              etiqueta="Egresos fiscales"
              valor={formatMoney(resumenFiscal.egresosFiscales)}
              detalle={`${PERIODO_LABEL[periodo]} · Contabilidad`}
              href="/contabilidad"
            />
            <TarjetaKPI
              icono={Scale}
              tinte={resumenFiscal.resultado >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}
              etiqueta="Resultado fiscal"
              valor={formatMoney(resumenFiscal.resultado)}
              detalle={`${PERIODO_LABEL[periodo]} · Contabilidad`}
              href="/contabilidad"
            />
          </>
        )}
      </div>

      {mostrarUtilidad && utilidadConsolidada && <FranjaUtilidad utilidad={utilidadConsolidada} />}

      <div className="grid grid-cols-1 gap-4 overflow-hidden lg:min-h-0 lg:flex-1 xl:grid-cols-5">
        <div className={cn("min-h-0", esCompleto ? "xl:col-span-3" : "xl:col-span-5")}>
          <EstadoDeLasObras proyectos={proyectosActivos} mostrarFinanciero={esCompleto} />
        </div>
        {esCompleto && (
          <div className="min-h-0 xl:col-span-2">
            <GraficaAvance proyectos={proyectosActivos} vista={vista} />
          </div>
        )}
      </div>

      <div className={cn("grid shrink-0 grid-cols-1 gap-4", esCompleto ? "lg:grid-cols-3" : "")}>
        {esCompleto && flujoDinero && <FlujoOperativo flujo={flujoDinero} periodo={periodo} porCobrar={porCobrar} porPagarObras={porPagarObras} porPagarEmpresa={porPagarEmpresa} />}
        <RequiereAtencion alertas={alertas} />
        {esCompleto && <ProximosCompromisos compromisos={compromisos} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Encabezado
// ---------------------------------------------------------------------------

function Encabezado({
  saludo,
  empresaNombre,
  semanaLabel,
  puedeVerPrivado,
  vista,
  periodo,
}: {
  saludo: string;
  empresaNombre: string;
  semanaLabel: string;
  puedeVerPrivado: boolean;
  vista: "general" | "privado";
  periodo: ResumenEjecutivo["periodo"];
}) {
  function href(nuevaVista: "general" | "privado", nuevoPeriodo: typeof periodo) {
    return `/dashboard?vista=${nuevaVista}&periodo=${nuevoPeriodo}`;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{saludo} 👋</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {empresaNombre} <span className="mx-1.5 text-[var(--border)]">·</span> {semanaLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {puedeVerPrivado && (
          <TabGroup>
            <TabLink active={vista === "general"} href={href("general", periodo)}>
              General
            </TabLink>
            <TabLink active={vista === "privado"} href={href("privado", periodo)}>
              Privado
            </TabLink>
          </TabGroup>
        )}

        <TabGroup>
          {(
            [
              ["semana", "Esta semana"],
              ["mes", "Este mes"],
              ["mes_anterior", "Mes anterior"],
              ["acumulado", "Acumulado"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <TabLink key={valor} active={periodo === valor} href={href(vista, valor)}>
              {etiqueta}
            </TabLink>
          ))}
        </TabGroup>
      </div>
    </div>
  );
}

function TabGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {children}
    </div>
  );
}

function TabLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-full items-center rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--brand)] text-[var(--brand-foreground)] shadow-sm"
          : "text-[var(--muted)] hover:bg-black/[0.03] hover:text-[var(--foreground)]"
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tarjetas KPI
// ---------------------------------------------------------------------------

function TarjetaKPI({
  icono: Icono,
  tinte,
  etiqueta,
  valor,
  detalle,
  delta,
  href,
}: {
  icono: LucideIcon;
  tinte: string;
  etiqueta: string;
  valor: string;
  detalle?: string;
  delta?: { texto: string; positivo: boolean } | null;
  href: string;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card className="enter flex h-full w-full items-start justify-between gap-3 p-4 transition-shadow duration-150 ease-out group-hover:shadow-md">
        <div className="min-w-0 flex-1">
          <div className={cn("mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl", tinte)}>
            <Icono size={19} strokeWidth={2} />
          </div>
          <p className="truncate text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">{etiqueta}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-[var(--foreground)]">{valor}</p>
          <div className="mt-1 h-4">
            {delta ? (
              <p
                className={cn(
                  "flex items-center gap-1 truncate text-[11px] font-medium",
                  delta.positivo ? "text-success" : "text-danger"
                )}
              >
                {delta.positivo ? <TrendingUp size={12} className="shrink-0" /> : <TrendingDown size={12} className="shrink-0" />}
                <span className="truncate">{delta.texto}</span>
              </p>
            ) : (
              detalle && <p className="truncate text-[11px] text-[var(--muted)]">{detalle}</p>
            )}
          </div>
        </div>
        <ChevronRight
          size={16}
          className="mt-1 shrink-0 text-[var(--border)] transition-colors duration-150 ease-out group-hover:text-[var(--muted)]"
        />
      </Card>
    </Link>
  );
}

function TarjetaObrasActivas({ obrasActivas }: { obrasActivas: ResumenEjecutivo["obrasActivas"] }) {
  const detalle =
    `${obrasActivas.enEjecucion} en ejecución · ${obrasActivas.porIniciar} por iniciar` +
    (obrasActivas.pausadas > 0 ? ` · ${obrasActivas.pausadas} pausada${obrasActivas.pausadas === 1 ? "" : "s"}` : "");
  return (
    <TarjetaKPI
      icono={Building2}
      tinte="bg-[var(--brand)]/10 text-[var(--brand)]"
      etiqueta="Obras activas"
      valor={String(obrasActivas.total)}
      detalle={detalle}
      href="/control-de-obra"
    />
  );
}

function TarjetaAvanceFisico({
  avanceFisicoConsolidado,
  periodo,
}: {
  avanceFisicoConsolidado: ResumenEjecutivo["avanceFisicoConsolidado"];
  periodo: ResumenEjecutivo["periodo"];
}) {
  const { porcentaje, proyectosIncompletos, deltaVsAnterior } = avanceFisicoConsolidado;
  const delta =
    deltaVsAnterior !== null && (periodo === "semana" || periodo === "mes")
      ? { texto: `${deltaVsAnterior >= 0 ? "+" : ""}${deltaVsAnterior.toFixed(1)}% vs periodo anterior`, positivo: deltaVsAnterior >= 0 }
      : null;
  const detalle =
    !delta && proyectosIncompletos > 0
      ? `${proyectosIncompletos} proyecto${proyectosIncompletos === 1 ? "" : "s"} sin precios completos`
      : undefined;
  return (
    <TarjetaKPI
      icono={TrendingUp}
      tinte="bg-success-soft text-success"
      etiqueta="Avance general (físico)"
      valor={porcentaje === null ? "Sin información" : pct(porcentaje)}
      detalle={detalle}
      delta={delta}
      href="/control-de-obra"
    />
  );
}

// ---------------------------------------------------------------------------
// Utilidad/margen (Privado) — franja compacta, presupuestada como principal,
// real a la fecha como secundaria. Nunca mezcladas en un solo número.
// ---------------------------------------------------------------------------

function FranjaUtilidad({ utilidad }: { utilidad: NonNullable<ResumenEjecutivo["utilidadConsolidada"]> }) {
  return (
    <Card className="enter flex shrink-0 flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          <Scale size={16} />
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">
            Utilidad presupuestada (línea base)
          </p>
          <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(utilidad.utilidadPresupuestada)}
            {utilidad.margenPresupuestadoPct !== null && (
              <span className="ml-1.5 text-xs font-medium text-[var(--muted)]">
                margen {pct(utilidad.margenPresupuestadoPct, 1)}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">Utilidad real a la fecha</p>
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            utilidad.utilidadReal >= 0 ? "text-success" : "text-danger"
          )}
        >
          {formatMoney(utilidad.utilidadReal)}
          {utilidad.margenRealPct !== null && (
            <span className="ml-1.5 text-xs font-medium text-[var(--muted)]">margen {pct(utilidad.margenRealPct, 1)}</span>
          )}
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Estado de las obras
// ---------------------------------------------------------------------------

function EstadoDeLasObras({
  proyectos,
  mostrarFinanciero,
}: {
  proyectos: FilaProyectoDashboard[];
  mostrarFinanciero: boolean;
}) {
  if (proyectos.length === 0) {
    return (
      <Card className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
        <Building2 size={22} className="text-[var(--border)]" />
        <p className="text-sm text-[var(--muted)]">Todavía no hay obras activas.</p>
      </Card>
    );
  }

  const visibles = proyectos.slice(0, MAX_OBRAS_VISIBLES);
  const restantes = proyectos.length - visibles.length;

  return (
    <Card className="enter flex h-full flex-col overflow-hidden p-4">
      <div className="mb-1 flex shrink-0 items-center justify-between">
        <p className="text-sm font-semibold text-[var(--foreground)]">Estado de las obras</p>
        <Link href="/control-de-obra" className="text-xs font-medium text-[var(--brand)] hover:underline">
          Ver todos →
        </Link>
      </div>

      <div className="hidden shrink-0 items-center gap-3 px-2.5 pt-1 pb-2 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase md:flex">
        <span className="w-9 shrink-0" />
        <span className="min-w-0 flex-1">Proyecto</span>
        <span className="w-24 shrink-0 text-right">Avance</span>
        {mostrarFinanciero && (
          <>
            <span className="w-[110px] shrink-0 text-right">Ejecutado</span>
            <span className="w-20 shrink-0 text-right">Por pagar</span>
          </>
        )}
        <span className="w-[104px] shrink-0 text-right">Estado</span>
        <span className="w-4 shrink-0" />
      </div>

      <div className="min-h-0 flex-1 divide-y divide-[var(--border)]/70 overflow-hidden">
        {visibles.map((p) => (
          <FilaProyecto key={p.id} p={p} mostrarFinanciero={mostrarFinanciero} />
        ))}
      </div>

      {restantes > 0 && (
        <p className="mt-1.5 shrink-0 text-center text-[11px] text-[var(--muted)]">
          +{restantes} obra{restantes === 1 ? "" : "s"} más ·{" "}
          <Link href="/control-de-obra" className="font-medium text-[var(--brand)] hover:underline">
            ver todas
          </Link>
        </p>
      )}
    </Card>
  );
}

function FilaProyecto({ p, mostrarFinanciero }: { p: FilaProyectoDashboard; mostrarFinanciero: boolean }) {
  const salud = SALUD_TOKEN[p.salud];
  const IconoSalud = SALUD_ICONO[p.salud];
  const tipoLabel = p.tipo !== "FORMAL" ? (TIPO_LABEL[p.tipo] ?? p.tipo) : null;

  return (
    <Link href={`/control-de-obra/${p.id}`} className="group block">
      <div className="flex items-center gap-3 px-2.5 py-3 transition-colors duration-150 ease-out group-hover:bg-black/[0.015]">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-[var(--brand)]/10">
          {p.imagenRef ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/control-de-obra/proyectos/${p.id}/imagen`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--brand)]">
              <Building2 size={16} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">{p.nombre}</p>
          {tipoLabel && <p className="truncate text-[11px] text-[var(--muted)]">{tipoLabel}</p>}
        </div>

        <div className="hidden w-24 shrink-0 items-center justify-end gap-2 md:flex">
          {p.avanceFisico.incompleto ? (
            <span className="text-[11px] text-[var(--muted)]">Incompleto</span>
          ) : (
            <>
              <div className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${Math.min(Math.max(p.avanceFisico.porcentaje ?? 0, 0), 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[11px] font-medium tabular-nums text-[var(--foreground)]">
                {pct(p.avanceFisico.porcentaje, 0)}
              </span>
            </>
          )}
        </div>

        {mostrarFinanciero && (
          <>
            <div className="hidden w-[110px] shrink-0 text-right md:block">
              <p className="truncate text-[12px] font-medium tabular-nums text-[var(--foreground)]">
                {p.ejecutado === null ? "—" : formatMoney(p.ejecutado)}
              </p>
              {p.montoContrato !== null && p.ejecutado !== null && (
                <p className="truncate text-[10px] tabular-nums text-[var(--muted)] opacity-70">
                  de {formatMoney(p.montoContrato)}
                </p>
              )}
            </div>

            <div className="hidden w-20 shrink-0 text-right md:block">
              <p className={cn("truncate text-[12px] font-medium tabular-nums", (p.porPagar ?? 0) > 0 ? "text-danger" : "text-[var(--muted)]")}>
                {(p.porPagar ?? 0) > 0 ? formatMoney(p.porPagar ?? 0) : "—"}
              </p>
            </div>
          </>
        )}

        <div className="hidden w-[104px] shrink-0 justify-end md:flex">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap", salud.soft, salud.text)}>
            <IconoSalud size={11} className="shrink-0" />
            {SALUD_LABEL[p.salud]}
          </span>
        </div>

        <ChevronRight size={15} className="shrink-0 text-[var(--border)] transition-colors duration-150 ease-out group-hover:text-[var(--muted)]" />
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Físico vs financiero
// ---------------------------------------------------------------------------

function GraficaAvance({ proyectos, vista }: { proyectos: FilaProyectoDashboard[]; vista: "general" | "privado" }) {
  if (proyectos.length === 0) {
    return (
      <Card className="flex h-full min-h-[220px] items-center justify-center p-6 text-sm text-[var(--muted)]">
        Sin datos para comparar.
      </Card>
    );
  }

  const ordenados = [...proyectos].sort((a, b) => {
    const da = (a.avanceFinancieroPorcentaje ?? 0) - (a.avanceFisico.porcentaje ?? 0);
    const db = (b.avanceFinancieroPorcentaje ?? 0) - (b.avanceFisico.porcentaje ?? 0);
    return db - da; // mayor desviación primero
  });
  const visibles = ordenados.slice(0, MAX_PROYECTOS_GRAFICA);
  const restantes = ordenados.length - visibles.length;

  return (
    <Card className="enter flex h-full flex-col overflow-hidden p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
          Físico vs financiero <span className="font-normal text-[var(--muted)]">({vista === "privado" ? "Privado" : "General"})</span>
        </p>
        <div className="flex shrink-0 items-center gap-2.5 text-[10px] text-[var(--muted)]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" /> Físico
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Financiero
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-hidden">
        {visibles.map((p) => (
          <div key={p.id}>
            <p className="mb-1.5 truncate text-xs font-medium text-[var(--foreground)]">{p.nombre}</p>
            <div className="space-y-1.5">
              <BarraComparativa valor={p.avanceFisico.porcentaje} color="bg-[var(--brand)]" />
              <BarraComparativa valor={p.avanceFinancieroPorcentaje} color="bg-success" />
            </div>
          </div>
        ))}
      </div>
      {restantes > 0 && (
        <p className="mt-2 shrink-0 text-center text-[11px] text-[var(--muted)]">
          <Link href="/control-de-obra" className="font-medium text-[var(--brand)] hover:underline">
            Ver todos →
          </Link>
        </p>
      )}
    </Card>
  );
}

function BarraComparativa({ valor, color }: { valor: number | null; color: string }) {
  const acotado = valor === null ? 0 : Math.min(Math.max(valor, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
        <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", color)} style={{ width: `${acotado}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-[var(--foreground)]">{pct(valor, 0)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flujo operativo — DISTINTO de "Resultado fiscal" (Nivel 1, Contabilidad):
// aquí cuenta TODO movimiento real, con o sin factura (Rediseño de Inicio,
// C. Fiscal vs Operativo — nunca el mismo número con otro nombre).
// ---------------------------------------------------------------------------

function FlujoOperativo({
  flujo,
  periodo,
  porCobrar,
  porPagarObras,
  porPagarEmpresa,
}: {
  flujo: NonNullable<ResumenEjecutivo["flujoDinero"]>;
  periodo: ResumenEjecutivo["periodo"];
  porCobrar: number | null;
  porPagarObras: number | null;
  porPagarEmpresa: number | null;
}) {
  const vacio = flujo.entradas === 0 && flujo.pagosDeObra === 0;
  const porPagarTotal = (porPagarObras ?? 0) + (porPagarEmpresa ?? 0);

  return (
    <Card className={cn("enter flex flex-col overflow-hidden p-4", ALTURA_FILA_INFERIOR)}>
      <p className="mb-1.5 shrink-0 truncate text-sm font-semibold text-[var(--foreground)]">
        Flujo operativo de {PERIODO_LABEL[periodo]}
      </p>
      {vacio ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <Wallet size={20} className="text-[var(--border)]" />
          <p className="text-xs text-[var(--muted)]">Sin movimientos en este periodo.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
          <EtapaFlujo
            icono={ArrowDownToLine}
            tinte="bg-success-soft text-success"
            etiqueta="Entradas de clientes"
            monto={flujo.entradas}
            colorMonto="text-success"
            signo="+"
          />
          <Conector />
          <EtapaFlujo
            icono={ArrowUpFromLine}
            tinte="bg-black/[0.05] text-[var(--foreground)]"
            etiqueta="Pagos de obra"
            monto={flujo.pagosDeObra}
            colorMonto="text-[var(--foreground)]"
            signo="−"
            nota={
              flujo.gastosReposicionesDentro > 0
                ? `↳ incluye ${formatMoney(flujo.gastosReposicionesDentro)} en gastos/reposiciones`
                : undefined
            }
          />
          <div className="mt-1 flex items-center justify-between border-t border-[var(--border)] pt-2">
            <div className="flex items-center gap-2">
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", flujo.neto >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                <Scale size={14} />
              </div>
              <span className="text-xs font-semibold text-[var(--foreground)]">Neto</span>
            </div>
            <span className={cn("text-base font-semibold tabular-nums", flujo.neto >= 0 ? "text-success" : "text-danger")}>
              {flujo.neto >= 0 ? "+" : ""}
              {formatMoney(flujo.neto)}
            </span>
          </div>
          {(porPagarTotal > 0 || (porCobrar ?? 0) > 0) && (
            <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>
                Por pagar: obras {formatMoney(porPagarObras ?? 0)} · empresa {formatMoney(porPagarEmpresa ?? 0)}
              </span>
              <span>Por cobrar: {formatMoney(porCobrar ?? 0)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EtapaFlujo({
  icono: Icono,
  tinte,
  etiqueta,
  monto,
  colorMonto,
  signo,
  nota,
}: {
  icono: LucideIcon;
  tinte: string;
  etiqueta: string;
  monto: number;
  colorMonto: string;
  signo: "+" | "−";
  nota?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tinte)}>
            <Icono size={13} />
          </div>
          <span className="truncate text-xs text-[var(--foreground)]">{etiqueta}</span>
        </div>
        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", colorMonto)}>
          {signo}
          {formatMoney(monto)}
        </span>
      </div>
      {nota && <p className="mt-0.5 truncate pl-9 text-[10px] text-[var(--muted)]">{nota}</p>}
    </div>
  );
}

function Conector() {
  return (
    <div className="flex h-2.5 items-center pl-[13px]">
      <div className="h-full w-px bg-[var(--border)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requiere tu atención
// ---------------------------------------------------------------------------

function RequiereAtencion({ alertas }: { alertas: AlertaDashboard[] }) {
  const visibles = alertas.slice(0, MAX_ALERTAS_VISIBLES);
  const restantes = alertas.length - visibles.length;

  return (
    <Card className={cn("enter flex flex-col overflow-hidden p-4", ALTURA_FILA_INFERIOR)}>
      <p className="mb-1 shrink-0 text-sm font-semibold text-[var(--foreground)]">Requiere tu atención</p>
      {alertas.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <CircleCheckBig size={20} className="text-[var(--border)]" />
          <p className="text-xs text-[var(--muted)]">Todo al día.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ul className="min-h-0 flex-1 divide-y divide-[var(--border)]/70 overflow-hidden">
            {visibles.map((a, i) => {
              const Icono = ALERTA_ICONO[a.tipo];
              const esCritico = a.severidad === "REQUIERE_ACCION";
              return (
                <li key={i}>
                  <Link
                    href={a.href}
                    className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors duration-150 ease-out hover:bg-black/[0.02]"
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        esCritico ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                      )}
                    >
                      <Icono size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--foreground)]">{a.titulo}</p>
                      <p className="truncate text-[10px] text-[var(--muted)]">{a.detalle}</p>
                    </div>
                    <ChevronRight size={13} className="shrink-0 text-[var(--border)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {restantes > 0 && (
            <p className="shrink-0 pt-1 text-center text-[11px] text-[var(--muted)]">
              +{restantes} pendiente{restantes === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Próximos compromisos — reemplaza Actividad reciente (Rediseño de Inicio,
// septiembre 2026). Solo compromisos financieros/operativos accionables,
// nunca un calendario de todo lo que existe.
// ---------------------------------------------------------------------------

function ProximosCompromisos({ compromisos }: { compromisos: CompromisoDashboard[] }) {
  const visibles = compromisos.slice(0, MAX_COMPROMISOS_VISIBLES);
  const restantes = compromisos.length - visibles.length;

  return (
    <Card className={cn("enter flex flex-col overflow-hidden p-4", ALTURA_FILA_INFERIOR)}>
      <p className="mb-1 shrink-0 text-sm font-semibold text-[var(--foreground)]">Próximos compromisos</p>
      {compromisos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <CalendarClock size={20} className="text-[var(--border)]" />
          <p className="text-xs text-[var(--muted)]">Sin compromisos pendientes.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ul className="min-h-0 flex-1 divide-y divide-[var(--border)]/70 overflow-hidden">
            {visibles.map((c, i) => {
              const Icono = COMPROMISO_ICONO[c.tipo];
              return (
                <li key={i}>
                  <Link
                    href={c.href}
                    className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors duration-150 ease-out hover:bg-black/[0.02]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
                      <Icono size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--foreground)]">{c.titulo}</p>
                      <p className="truncate text-[10px] text-[var(--muted)]">{c.detalle}</p>
                    </div>
                    {c.monto !== null && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--foreground)]">
                        {formatMoney(c.monto)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {restantes > 0 && (
            <p className="shrink-0 pt-1 text-center text-[11px] text-[var(--muted)]">
              +{restantes} más
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
