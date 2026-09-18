import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { DatosPdfRecibo } from "@/lib/server/control-de-obra/recibos";

// Documento @react-pdf/renderer — se renderiza en el servidor (route
// handler), nunca en el navegador. Una página por recibo: sirve tanto para
// la descarga individual (un solo elemento en `recibos`) como para el
// combinado "Descargar todos los recibos de la semana".
//
// El documento representa CONFORMIDAD con la estimación (trabajo reconocido
// y aceptado), nunca recepción de pago — el estado real de pago vive en
// MovimientoSemanal.estatusPago (Reporte General) y nunca se afirma aquí.
// Las firmas son "Contratista"/"Supervisor" (conformidad), no "quien
// recibe"/"fecha de recepción" (Contratistas: Control Contractual +
// Estimaciones, septiembre 2026).

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: "1pt solid #111827",
  },
  identidadEmpresa: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 130, height: 56, objectFit: "contain" },
  razonSocial: { fontSize: 13, fontWeight: 700 },
  titulo: { fontSize: 11, marginTop: 2, color: "#374151" },
  // El identificador PRINCIPAL es "Estimación No. X" (contractual/
  // cronológico) — el folio oficial (REC-000045) es secundario, más pequeño y
  // debajo, para que nunca compitan visualmente (decisión de sesión,
  // septiembre 2026).
  numeroEstimacion: { fontSize: 13, fontWeight: 700, textAlign: "right" },
  folio: { fontSize: 8.5, color: "#6b7280", textAlign: "right", marginTop: 1 },
  fecha: { fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 },
  filaDatos: { flexDirection: "row", marginBottom: 3 },
  etiquetaDato: { width: 110, color: "#6b7280" },
  valorDato: { fontWeight: 700 },
  seccion: { marginTop: 16 },
  seccionTitulo: {
    fontSize: 9,
    fontWeight: 700,
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  resumenGrid: { flexDirection: "row", flexWrap: "wrap" },
  resumenCelda: { width: "33%", marginBottom: 8 },
  resumenEtiqueta: { fontSize: 8, color: "#6b7280" },
  resumenValor: { fontSize: 10.5, fontWeight: 700, marginTop: 1 },
  tablaEncabezado: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontWeight: 700,
  },
  tablaFila: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottom: "0.5pt solid #e5e7eb",
  },
  colDescripcion: { flex: 3 },
  colUnidad: { flex: 1, textAlign: "center" },
  colCantidad: { flex: 1, textAlign: "right" },
  colPU: { flex: 1, textAlign: "right" },
  colImporte: { flex: 1, textAlign: "right" },
  filaTotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1pt solid #111827",
  },
  totalEtiqueta: { fontSize: 11, fontWeight: 700, marginRight: 12 },
  totalValor: { fontSize: 13, fontWeight: 700 },
  leyendaTitulo: { marginTop: 20, fontSize: 9, fontWeight: 700, color: "#374151" },
  leyenda: { marginTop: 6, fontSize: 8.5, color: "#4b5563", lineHeight: 1.4 },
  firmas: { flexDirection: "row", marginTop: 48, gap: 24 },
  firmaBloque: { flex: 1 },
  firmaLinea: { borderTop: "1pt solid #111827", marginTop: 36, paddingTop: 4 },
  firmaEtiqueta: { fontSize: 9, fontWeight: 700, color: "#374151" },
  firmaNombre: { fontSize: 8.5, color: "#6b7280", marginTop: 2 },
});

function formatMoney(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCantidad(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function formatPorcentaje(n: number): string {
  return `${n.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Mismo criterio que formatearRangoSemana (lib/server/semanas.ts) — se
// reimplementa aquí en vez de importarlo porque ese helper toma objetos Date
// (server-side) y este componente ya recibe las fechas serializadas a ISO.
function formatPeriodo(inicioIso: string, finIso: string): string {
  const inicio = new Date(inicioIso);
  const fin = new Date(finIso);
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const mismoMes = inicio.getMonth() === fin.getMonth();
  return mismoMes
    ? `${inicio.getDate()}–${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
    : `${inicio.getDate()} ${MESES[inicio.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
}

function CeldaResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.resumenCelda}>
      <Text style={styles.resumenEtiqueta}>{etiqueta}</Text>
      <Text style={styles.resumenValor}>{valor}</Text>
    </View>
  );
}

function PaginaRecibo({ recibo }: { recibo: DatosPdfRecibo }) {
  const { configuracion, resumenContractual } = recibo;
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.encabezado}>
        <View style={styles.identidadEmpresa}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, no es <img> HTML */}
          {recibo.logoBuffer && <Image src={recibo.logoBuffer} style={styles.logo} />}
          <View>
            {/* Con logo, el logo ES la identidad — se omite el nombre en texto
                para que el logo pueda verse más grande (mismo criterio que el
                sidebar de la app). Sin logo, el nombre sigue siendo necesario. */}
            {!recibo.logoBuffer && <Text style={styles.razonSocial}>{configuracion.razonSocial}</Text>}
            <Text style={styles.titulo}>{configuracion.titulo}</Text>
          </View>
        </View>
        <View>
          <Text style={styles.numeroEstimacion}>Estimación No. {recibo.numeroEstimacion ?? "—"}</Text>
          <Text style={styles.folio}>Folio {recibo.folio}</Text>
          <Text style={styles.fecha}>{formatFecha(recibo.fechaCorte)}</Text>
        </View>
      </View>

      <View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Proyecto</Text>
          <Text style={styles.valorDato}>
            {recibo.proyectoNombre}
            {recibo.proyectoNumeroContrato ? ` — Contrato ${recibo.proyectoNumeroContrato}` : ""}
          </Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Contratista</Text>
          <Text style={styles.valorDato}>
            {recibo.contratistaNombre}
            {recibo.especialidadContratista ? ` — ${recibo.especialidadContratista}` : ""}
          </Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Semana</Text>
          <Text style={styles.valorDato}>
            Semana {recibo.semanaNumero} · {recibo.semanaAnio}
          </Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Periodo</Text>
          <Text style={styles.valorDato}>{formatPeriodo(recibo.semanaFechaInicio, recibo.semanaFechaFin)}</Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Fecha de corte</Text>
          <Text style={styles.valorDato}>{formatFecha(recibo.fechaCorte)}</Text>
        </View>
      </View>

      {resumenContractual && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Resumen contractual</Text>
          <View style={styles.resumenGrid}>
            <CeldaResumen etiqueta="Monto contratado" valor={formatMoney(resumenContractual.montoContrato)} />
            <CeldaResumen etiqueta="Estimado anterior" valor={formatMoney(resumenContractual.estimadoAnterior)} />
            <CeldaResumen etiqueta="Esta estimación" valor={formatMoney(resumenContractual.estaEstimacion)} />
            <CeldaResumen etiqueta="Estimado acumulado" valor={formatMoney(resumenContractual.estimadoAcumulado)} />
            <CeldaResumen etiqueta="Saldo contractual" valor={formatMoney(resumenContractual.saldoContractual)} />
            <CeldaResumen etiqueta="% avance" valor={formatPorcentaje(resumenContractual.porcentajeAvance)} />
          </View>
        </View>
      )}

      {configuracion.mostrarDetalle && (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Trabajos de esta semana</Text>
          <View style={styles.tablaEncabezado}>
            <Text style={styles.colDescripcion}>Concepto</Text>
            <Text style={styles.colUnidad}>Unidad</Text>
            <Text style={styles.colCantidad}>Contratada</Text>
            <Text style={styles.colCantidad}>Esta semana</Text>
            <Text style={styles.colCantidad}>Acumulada</Text>
            {configuracion.mostrarPU && <Text style={styles.colPU}>P.U.</Text>}
            <Text style={styles.colImporte}>Importe</Text>
          </View>
          {recibo.detalle.map((linea, i) => (
            <View style={styles.tablaFila} key={i}>
              <Text style={styles.colDescripcion}>{linea.descripcion}</Text>
              <Text style={styles.colUnidad}>{linea.unidad}</Text>
              <Text style={styles.colCantidad}>{formatCantidad(linea.cantidadContratada)}</Text>
              <Text style={styles.colCantidad}>{formatCantidad(linea.cantidad)}</Text>
              <Text style={styles.colCantidad}>{formatCantidad(linea.cantidadAcumulada)}</Text>
              {configuracion.mostrarPU && (
                <Text style={styles.colPU}>{formatMoney(linea.precioUnitario)}</Text>
              )}
              <Text style={styles.colImporte}>{formatMoney(linea.importe)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.filaTotal}>
        <Text style={styles.totalEtiqueta}>Total de esta estimación</Text>
        <Text style={styles.totalValor}>{formatMoney(recibo.total)}</Text>
      </View>

      {configuracion.mostrarLeyenda && configuracion.leyenda && (
        // `break` fuerza que el bloque legal siempre empiece en una hoja
        // nueva, sin importar cuánto haya ocupado ya la tabla de trabajos —
        // nunca queda "pegado" justo debajo del total (decisión de sesión,
        // septiembre 2026). El texto en sí puede seguir fluyendo a más de una
        // hoja si es muy largo — solo se fuerza el INICIO, nunca se recorta.
        <View break>
          <Text style={styles.leyendaTitulo}>{configuracion.tituloLeyenda}</Text>
          <Text style={styles.leyenda}>{configuracion.leyenda}</Text>
        </View>
      )}

      {/* wrap={false}: las dos firmas se mantienen juntas como un solo
          bloque — si no caben al final de la hoja donde terminó la parte
          legal (o la tabla de trabajos, si no hay leyenda), @react-pdf las
          mueve completas a una hoja nueva en vez de partir el bloque a la
          mitad. Así las firmas siempre quedan al final de CUALQUIER hoja en
          la que terminen, nunca separadas entre sí. */}
      <View style={styles.firmas} wrap={false}>
        <View style={styles.firmaBloque}>
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaEtiqueta}>Contratista</Text>
            <Text style={styles.firmaNombre}>{recibo.contratistaNombre}</Text>
          </View>
        </View>
        <View style={styles.firmaBloque}>
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaEtiqueta}>Supervisor</Text>
            {/* Sin Supervisor asignado al proyecto: la línea queda sin nombre
                impreso, nunca se sustituye por quien cerró/generó (ver
                Proyecto.supervisorUsuarioId). */}
            {recibo.supervisorNombre && <Text style={styles.firmaNombre}>{recibo.supervisorNombre}</Text>}
          </View>
        </View>
      </View>
    </Page>
  );
}

export function ReciboPagoDocumento({ recibos }: { recibos: DatosPdfRecibo[] }) {
  return (
    <Document>
      {recibos.map((recibo) => (
        <PaginaRecibo key={recibo.folio} recibo={recibo} />
      ))}
    </Document>
  );
}
