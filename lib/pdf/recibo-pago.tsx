import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { DatosPdfRecibo } from "@/lib/server/control-de-obra/recibos";

// Documento @react-pdf/renderer — se renderiza en el servidor (route
// handler), nunca en el navegador. Una página por recibo: sirve tanto para
// la descarga individual (un solo elemento en `recibos`) como para el
// combinado "Descargar todos los recibos de la semana".

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
  razonSocial: { fontSize: 13, fontWeight: 700 },
  titulo: { fontSize: 11, marginTop: 2, color: "#374151" },
  folio: { fontSize: 12, fontWeight: 700, textAlign: "right" },
  fecha: { fontSize: 9, color: "#6b7280", textAlign: "right", marginTop: 2 },
  filaDatos: { flexDirection: "row", marginBottom: 3 },
  etiquetaDato: { width: 90, color: "#6b7280" },
  valorDato: { fontWeight: 700 },
  seccion: { marginTop: 16 },
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
  leyenda: { marginTop: 20, fontSize: 8.5, color: "#4b5563", lineHeight: 1.4 },
  firmas: { flexDirection: "row", marginTop: 48, gap: 24 },
  firmaBloque: { flex: 1 },
  firmaLinea: { borderTop: "1pt solid #111827", marginTop: 36, paddingTop: 4 },
  firmaEtiqueta: { fontSize: 9, color: "#6b7280" },
});

function formatMoney(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCantidad(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PaginaRecibo({ recibo }: { recibo: DatosPdfRecibo }) {
  const { configuracion } = recibo;
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.encabezado}>
        <View>
          <Text style={styles.razonSocial}>{configuracion.razonSocial}</Text>
          <Text style={styles.titulo}>{configuracion.titulo}</Text>
        </View>
        <View>
          <Text style={styles.folio}>{recibo.folio}</Text>
          <Text style={styles.fecha}>{formatFecha(recibo.fechaGeneracion)}</Text>
        </View>
      </View>

      <View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Proyecto</Text>
          <Text style={styles.valorDato}>{recibo.proyectoNombre}</Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Contratista</Text>
          <Text style={styles.valorDato}>{recibo.contratistaNombre}</Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Semana</Text>
          <Text style={styles.valorDato}>
            Semana {recibo.semanaNumero} · {recibo.semanaAnio}
          </Text>
        </View>
        <View style={styles.filaDatos}>
          <Text style={styles.etiquetaDato}>Corte</Text>
          <Text style={styles.valorDato}>{String(recibo.numeroCorte).padStart(3, "0")}</Text>
        </View>
      </View>

      {configuracion.mostrarDetalle && (
        <View style={styles.seccion}>
          <View style={styles.tablaEncabezado}>
            <Text style={styles.colDescripcion}>Concepto</Text>
            <Text style={styles.colUnidad}>Unidad</Text>
            <Text style={styles.colCantidad}>Cantidad</Text>
            {configuracion.mostrarPU && <Text style={styles.colPU}>P.U.</Text>}
            <Text style={styles.colImporte}>Importe</Text>
          </View>
          {recibo.detalle.map((linea, i) => (
            <View style={styles.tablaFila} key={i}>
              <Text style={styles.colDescripcion}>{linea.descripcion}</Text>
              <Text style={styles.colUnidad}>{linea.unidad}</Text>
              <Text style={styles.colCantidad}>{formatCantidad(linea.cantidad)}</Text>
              {configuracion.mostrarPU && (
                <Text style={styles.colPU}>{formatMoney(linea.precioUnitario)}</Text>
              )}
              <Text style={styles.colImporte}>{formatMoney(linea.importe)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.filaTotal}>
        <Text style={styles.totalEtiqueta}>Total a pagar</Text>
        <Text style={styles.totalValor}>{formatMoney(recibo.total)}</Text>
      </View>

      {configuracion.leyenda && <Text style={styles.leyenda}>{configuracion.leyenda}</Text>}

      <View style={styles.firmas}>
        <View style={styles.firmaBloque}>
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaEtiqueta}>Nombre y firma de quien recibe</Text>
          </View>
        </View>
        <View style={styles.firmaBloque}>
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaEtiqueta}>Fecha de recepción</Text>
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
