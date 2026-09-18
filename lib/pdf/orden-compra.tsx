import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { DatosPdfOrdenCompra } from "@/lib/server/control-de-obra/ordenes-compra";

// Documento @react-pdf/renderer — se renderiza en el servidor (route
// handler), nunca en el navegador. Una Orden de Compra por documento — es el
// papel que se le entrega al proveedor (Compras, Fase 5, septiembre 2026).
// Mismo motor/branding que Recibo/Estimación (lib/pdf/recibo-pago.tsx), sin
// snapshot histórico congelado (ver comentario en obtenerDatosPdfOrdenCompra).

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
  folio: { fontSize: 13, fontWeight: 700, textAlign: "right" },
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
  colConcepto: { flex: 3 },
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
  notas: { marginTop: 16, fontSize: 9, color: "#4b5563", lineHeight: 1.4 },
});

function formatMoney(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCantidad(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

export function OrdenCompraDocumento({ datos }: { datos: DatosPdfOrdenCompra }) {
  const { branding } = datos;
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.encabezado}>
          <View style={styles.identidadEmpresa}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, no es <img> HTML */}
            {datos.logoBuffer && <Image src={datos.logoBuffer} style={styles.logo} />}
            <View>
              {!datos.logoBuffer && <Text style={styles.razonSocial}>{branding.razonSocial ?? branding.nombre}</Text>}
              <Text style={styles.titulo}>Orden de Compra</Text>
            </View>
          </View>
          <View>
            <Text style={styles.folio}>{datos.folio}</Text>
            <Text style={styles.fecha}>{formatFecha(datos.fecha)}</Text>
          </View>
        </View>

        <View>
          <View style={styles.filaDatos}>
            <Text style={styles.etiquetaDato}>Proyecto</Text>
            <Text style={styles.valorDato}>{datos.proyectoNombre}</Text>
          </View>
          <View style={styles.filaDatos}>
            <Text style={styles.etiquetaDato}>Proveedor</Text>
            <Text style={styles.valorDato}>
              {datos.proveedorNombre}
              {datos.proveedorRazonSocial ? ` — ${datos.proveedorRazonSocial}` : ""}
            </Text>
          </View>
          {datos.proveedorRfc && (
            <View style={styles.filaDatos}>
              <Text style={styles.etiquetaDato}>RFC</Text>
              <Text style={styles.valorDato}>{datos.proveedorRfc}</Text>
            </View>
          )}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Conceptos</Text>
          <View style={styles.tablaEncabezado}>
            <Text style={styles.colConcepto}>Concepto</Text>
            <Text style={styles.colUnidad}>Unidad</Text>
            <Text style={styles.colCantidad}>Cantidad</Text>
            <Text style={styles.colPU}>P.U.</Text>
            <Text style={styles.colImporte}>Importe</Text>
          </View>
          {datos.detalle.map((l) => (
            <View style={styles.tablaFila} key={l.id}>
              <View style={styles.colConcepto}>
                <Text>{l.concepto}</Text>
                {l.descripcion && <Text style={{ fontSize: 8.5, color: "#6b7280", marginTop: 1 }}>{l.descripcion}</Text>}
              </View>
              <Text style={styles.colUnidad}>{l.unidad}</Text>
              <Text style={styles.colCantidad}>{formatCantidad(l.cantidad)}</Text>
              <Text style={styles.colPU}>{formatMoney(l.precioUnitario)}</Text>
              <Text style={styles.colImporte}>{formatMoney(l.importe)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.filaTotal}>
          <Text style={styles.totalEtiqueta}>Total</Text>
          <Text style={styles.totalValor}>{formatMoney(datos.total)}</Text>
        </View>

        {datos.notas && (
          <View style={styles.notas}>
            <Text style={{ fontWeight: 700, marginBottom: 3 }}>Condiciones/notas</Text>
            <Text>{datos.notas}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
