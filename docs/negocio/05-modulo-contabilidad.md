# Documentación de Proceso — Módulo "Contabilidad"
**Grupo Conkuali — Sistema de Gestión de Obra (Arqento)**
Versión 1.0 — cierre de decisiones de negocio antes de diseño técnico (schema/queries/UI)

> **Nota de arquitectura (ver `/docs/arquitectura/00-decisiones-fundamentales.md`):**
> el sistema es multi-tenant desde el día 1. Todo lo descrito aquí pertenece a una
> Empresa. Conkuali es la primera empresa (tenant) y usa Contabilidad de forma
> limitada (una cuenta fiscal, solo ciertas operaciones entran); el modelo no asume
> ese comportamiento como regla general — otra Empresa puede usar Contabilidad de
> forma mucho más completa con la misma arquitectura.
>
> Este documento reemplaza el resumen fiscal simple construido en septiembre 2026
> (`lib/server/contabilidad/resumen.ts` actual: Ingresos fiscales / Egresos fiscales /
> Resultado / Facturas pendientes, calculado por mes calendario). Ese código sigue
> funcionando hoy; este documento define su reemplazo, todavía sin implementar.

---

## 1. Propósito y alcance del módulo

Contabilidad **clasifica y reconoce contablemente** operaciones que ya ocurrieron en
Control de Obra, Gastos y Reporte General — nunca las vuelve a capturar. Responde tres
preguntas que hoy nadie responde de forma confiable:

1. ¿Cuánto ganó la empresa en un periodo? (Estado de Resultados)
2. ¿Cuánto nos deben y cuánto debemos? (Cuentas por Cobrar / por Pagar)
3. ¿En qué cuenta está el dinero? (Bancos / Tesorería)

Sin exigir que el usuario sepa contabilidad formal: en esta etapa no hay catálogo de
cuentas SAT, no hay pólizas, no hay partida doble. Todo se deriva leyendo lo que ya
existe en otros módulos, con un mínimo de decisiones explícitas nuevas.

**No todo lo que existe en Reporte General, Control de Obra o la vista Privada
pertenece automáticamente a Contabilidad.** Cada Empresa decide qué operaciones son de
su ámbito contable/fiscal — ver sección 2.

---

## 2. Principio central — cuatro ejes, nunca la misma pregunta

Una operación (un Gasto de Obra, un pago de cliente) se describe con **cuatro
atributos independientes**. Confundirlos fue el problema del diseño anterior
(`requiereFactura` se usaba, incorrectamente, para decidir si algo "existía"
contablemente).

| Eje | Pregunta que responde | Vive en |
|---|---|---|
| **1. Inclusión en Contabilidad** | ¿Esta operación es del ámbito contable/fiscal de la Empresa? | Campo nuevo — sección 3 |
| **2. Reconocimiento contable** | ¿Cuándo cuenta para el Estado de Resultados del periodo? | Estatus ya existentes de cada módulo — sección 4 |
| **3. Estado fiscal/documental (CFDI)** | ¿Requiere factura y ya la tiene? | `requiereFactura` / `facturaEsperada` / `Factura` — sin cambios |
| **4. Movimiento real de dinero** | ¿Ya entró/salió dinero, por qué cuenta? | `MovimientoFinancieroCliente`, `MovimientoSemanal.estatusPago`, `AbonoReposicion`, y el nuevo `Egreso.fechaPago` — sección 7 |

**Ningún eje decide a los otros.** Una operación puede estar incluida en Contabilidad,
reconocida (ya se aprobó), sin CFDI todavía, y sin pagar — los cuatro estados
coexisten. En particular:

- Una estimación puede **reconocerse antes de que exista cualquier pago** del cliente.
- Un gasto puede **reconocerse antes de pagarse**.
- `requiereFactura` nunca decide si algo entra a Contabilidad ni cuándo se reconoce —
  solo describe si hace falta un CFDI.

---

## 3. Eje 1 — Inclusión en Contabilidad (nuevo)

Configurable por Empresa, con override por operación individual.

### 3.1 Configuración por Empresa

`Empresa.defaultInclusionContabilidad: Boolean` (nuevo, default `false` a nivel
schema). Cada Empresa decide su propio comportamiento — Conkuali lo configura en
`false` porque hoy solo ciertas operaciones son de su ámbito contable; una Empresa más
simple puede configurarlo en `true` para que todo entre por default. Esto nunca se
hardcodea como regla del sistema.

### 3.2 Snapshot por operación (no un valor calculado en vivo)

Cada operación reconocible copia el default de su Empresa **al momento de crearse**,
como un valor concreto editable después — nunca un valor recalculado en vivo contra el
default actual de la Empresa. Esto evita que cambiar el default de la Empresa altere
retroactivamente la clasificación de operaciones ya reportadas en un Estado de
Resultados de un periodo cerrado (principio de no alterar información histórica).

Campos nuevos:

- `GastoObra.incluidoEnContabilidad: Boolean` (nuevo)
- `EstimacionClienteCapa.incluidoEnContabilidad: Boolean` (nuevo)
- `MovimientoFinancieroCliente.incluidoEnContabilidad: Boolean` (nuevo) — **solo tiene
  efecto cuando `estimacionClienteCapaId` es `null`** (movimientos de tipo
  `APORTACION_FONDO`, que no están ligados a ninguna capa). Ver sección 3.3.

Editable únicamente por quien tenga el permiso `puedeMarcarInclusionContable`
(sección 12), con auditoría obligatoria (sección 13).

### 3.3 Caso especial — Aportaciones de fondo (revisión técnica pedida)

Se revisó explícitamente el riesgo de inconsistencia con `APORTACION_FONDO`:

- `PAGO_ESTIMACION` y `APLICACION_ESTIMACION` **siempre** tienen
  `estimacionClienteCapaId` (obligatorio en código nuevo, ver
  `MovimientoFinancieroCliente` en el schema) — heredan la inclusión de su capa, sin
  campo propio necesario.
- `APORTACION_FONDO` **nunca** tiene capa — es efectivo real aportado al fondo del
  proyecto, no ligado a una estimación específica todavía. Por eso tiene su propio
  campo `incluidoEnContabilidad`, independiente de cualquier capa.

**Regla de reconocimiento para el fondo (evita doble conteo):** una aportación de
fondo **nunca se reconoce como ingreso en el Estado de Resultados por sí misma** — es
un movimiento de Tesorería (efectivo disponible del proyecto), no un ingreso
devengado. El ingreso ya se reconoce, completo, cuando la capa correspondiente queda
`EMITIDA` (sección 4). Cuando después se aplica fondo contra esa estimación
(`APLICACION_ESTIMACION`), es una **reclasificación de efectivo** (el dinero pasa de
"fondo disponible" a "cobro de esta estimación"), nunca un ingreso nuevo — si se
contara aquí también, el ingreso se duplicaría.

`APORTACION_FONDO.incluidoEnContabilidad` solo controla si ese movimiento aparece en
la vista de Movimientos/Tesorería y en el saldo de bancos (sección 7 y 10) — nunca en
el Estado de Resultados.

---

## 4. Eje 2 — Reconocimiento contable (reutiliza estatus existentes, sin campo nuevo)

| Tipo de operación | Evento de reconocimiento | Campo/estatus ya existente |
|---|---|---|
| Ingreso por obra | La capa (Operativo o Privado) queda emitida — nace el derecho de cobro formal | `EstimacionClienteCapa.estatus = EMITIDA` (+ `emitidoEn`) |
| Costo de materiales / equipo / otros | El gasto queda aprobado oficialmente | `GastoObra.estatus = APROBADO` |
| Costo de mano de obra / contratista | El avance de esa semana quedó consolidado en un corte vigente | `CorteSemanal.estatus = GENERADO` (nace de `AvanceConcepto.estatusAprobacion = APROBADO`, consolidado por `CierreSemanaProyecto`) |

Se confirmó explícitamente que **no hace falta inventar ningún estatus nuevo**:
`EstimacionClienteCapa.estatus = EMITIDA` ya es el evento que representa "derecho de
cobro formal", y `CorteSemanal.estatus = GENERADO` ya es el corte oficial semanal de
avance aprobado, independiente de si el `MovimientoSemanal` asociado ya se liquidó.

---

## 5. Eje 3 — Estado fiscal / CFDI (sin cambios)

`requiereFactura`, `facturaRef`, `facturaEsperada`, `Factura` (CFDI estructurado, XML
como fuente de verdad) se mantienen exactamente como están. Se aclara su relación con
los otros ejes: una operación puede estar incluida y reconocida en Contabilidad **sin
tener CFDI todavía** — el estado fiscal nunca bloquea el reconocimiento contable, solo
se reporta aparte como "CFDI pendiente".

---

## 6. Eje 4 — Movimiento real de dinero

### 6.1 Cobros (cliente)

`MovimientoFinancieroCliente` con `tipo IN (PAGO_ESTIMACION, APORTACION_FONDO)` y
`estatus = VIGENTE` — ya representa dinero que realmente entró (el modelo nunca se
crea especulativamente).

### 6.2 Pagos a contratistas / beneficiarios

`MovimientoSemanal.estatusPago = LIQUIDADO` — ya existe, con `fechaPago`,
`metodoPago`, `referenciaPago` reales.

### 6.3 Pagos de gastos con reembolso a un beneficiario

`ReposicionGastos` + `Σ AbonoReposicion.monto` (ya soporta pagos parciales) —
aplica cuando `GastoObra.pagadorBeneficiarioId` no es null (alguien adelantó el
dinero y espera que se le reponga).

### 6.4 Pagos de gastos hechos directo por la Empresa (decisión 3)

Cuando `GastoObra.pagadorBeneficiarioId` es `null` (la Empresa pagó directo, ej.
tarjeta empresarial, transferencia), **aprobado no significa pagado**. Se decidió
reutilizar `Egreso` (ya es la decoración de Contabilidad de un `GastoObra`, 1:1 vía
`gastoObraId @unique`) en vez de crear una entidad nueva — evita duplicar el concepto
de "pago":

- `Egreso.fechaPago: DateTime?` (nuevo, null = todavía no pagado)
- `Egreso.referenciaPago: String?` (nuevo)
- `Egreso.medioFinancieroId` (ya existe) — a partir de ahora, en este contexto,
  representa específicamente el medio por el que se pagó; solo cuenta para el saldo
  de una cuenta (sección 13) cuando `fechaPago` no es null.

`pagado` se deriva (`fechaPago != null`), nunca es una columna aparte — mismo patrón
que ya usa el resto del sistema para estados derivados (ej. "incluido en reposición"
en `GastoObra`).

### 6.5 Registros manuales reconocidos pero pendientes de cobro/pago (decisión final)

Un `Egreso`/`Ingreso` manual (sin `gastoObraId`/`movimientoFinancieroClienteId`) no
debe asumirse como dinero ya movido — debe poder representar una operación ya
**reconocida** (cuenta para el Estado de Resultados) pero todavía **sin cobrar/pagar**,
manteniendo Reconocimiento ≠ Cobro/Pago ≠ CFDI también para estos registros. Cambio
mínimo, reutilizando exactamente el mismo patrón de 6.4 en vez de crear campos o
entidades nuevas:

- `Egreso.fecha` (ya existe, usado hoy solo cuando `gastoObraId` es null) pasa a ser
  explícitamente la **fecha de reconocimiento** del egreso manual — cuándo cuenta para
  el Estado de Resultados del periodo.
- `Egreso.fechaPago` (el mismo campo nuevo de 6.4) se amplía en alcance: también
  aplica a egresos manuales. Null = reconocido, todavía por pagar. Con valor = pagado
  en esa fecha.
- Simétricamente para ingresos: `Ingreso.fecha` (ya existe, usado hoy solo cuando
  `movimientoFinancieroClienteId` es null) pasa a ser la **fecha de reconocimiento**.
  Se agrega `Ingreso.fechaCobro: DateTime?` (nuevo, mismo rol que `Egreso.fechaPago`) —
  null = reconocido, todavía por cobrar; con valor = cobrado en esa fecha.

Un `Ingreso`/`Egreso` ligado a un origen real (`movimientoFinancieroClienteId` /
`gastoObraId` no nulos vía el caso 6.4) no necesita este campo para el lado ligado a
`MovimientoFinancieroCliente`: ese modelo por definición solo existe cuando el dinero
ya se movió, así que un `Ingreso` que lo decora se trata siempre como ya cobrado, con
la fecha del movimiento.

---

## 7. Estado de Resultados

Se arma **solo con operaciones incluidas (eje 1) y reconocidas (eje 2) dentro del
periodo** — nunca con eje 4 (eso sería Flujo de Efectivo, sección 9).

| Línea | Fuente |
|---|---|
| **INGRESOS** | |
| Ingresos por obra | `EstimacionClienteCapa.total` (congelado al emitir), `estatus = EMITIDA`, `incluidoEnContabilidad = true`, `emitidoEn` dentro del periodo |
| Otros ingresos | `Ingreso` manual sin origen, `incluidoEnContabilidad` — *(ver nota, sección 15)* |
| **Total ingresos** | suma |
| **COSTOS DIRECTOS DE OBRA** | proyectos tipo `FORMAL` / `MOMENTANEA` |
| Contratistas / Mano de obra | `CorteSemanal.montoNeto`, `estatus = GENERADO` |
| Materiales | `GastoObra.monto`, categoría `MATERIAL`, `estatus = APROBADO`, `incluidoEnContabilidad = true` |
| Maquinaria y equipo | categorías `HERRAMIENTA` + `RENTA_EQUIPO` |
| Permisos y derechos de obra | categoría nueva `PERMISOS_DERECHOS_OBRA` (sección 11) |
| Otros costos directos | categorías `TRANSPORTE` / `COMIDA_PERSONAL` / `SERVICIO` / `OTRO` |
| **Total costos directos** | suma |
| **UTILIDAD BRUTA** | Total ingresos − Total costos directos (+ margen %) |
| **GASTOS DE OPERACIÓN** | proyecto tipo `OFICINA`, categorías ámbito "empresa" |
| Administración / Servicios | categoría `SERVICIOS_EMPRESA` |
| Oficina | categoría `RENTA_OFICINA` |
| Vehículos / gasolina | categoría `GASOLINA` |
| Nómina administrativa | categoría `NOMINA` (normalmente vía `GastoRecurrente`) |
| Otros gastos | `PAPELERIA` + `VIATICOS` + `OTRO_EMPRESA` |
| **Total gastos de operación** | suma |
| **UTILIDAD OPERATIVA** | Utilidad bruta − Total gastos de operación |
| **IMPUESTOS Y CONTRIBUCIONES** | categoría nueva `IMPUESTOS_CONTRIBUCIONES` (sección 11) — línea propia, no mezclada en Gastos de Operación |
| **OTROS INGRESOS / GASTOS** | Egresos/Ingresos manuales sin categoría de obra |
| **RESULTADO DEL PERIODO** | suma final |

**Regla explícita anti-doble-conteo:** `APORTACION_FONDO` y `APLICACION_ESTIMACION`
nunca aparecen como ingreso en este reporte (sección 3.3) — el ingreso ya se contó
completo al emitirse la capa.

Selector de periodo (Este mes / Mes anterior / Trimestre / Año / Personalizado) y de
alcance (Toda la Empresa / proyecto específico): extensión directa de
`lib/contabilidad/periodo.ts`, sin cambios estructurales.

---

## 8. Cuentas por cobrar

Por capa emitida de `EstimacionCliente` (independiente de si esa capa está
`incluidoEnContabilidad` — Cuentas por Cobrar es una vista de eje 4, no del Estado de
Resultados):

```
Por cobrar = EstimacionClienteCapa.total (congelado)
             − Σ MovimientoFinancieroCliente VIGENTE de tipo PAGO_ESTIMACION
               o APLICACION_ESTIMACION atados a esa capa
```

Estados por capa: **Reconocido, sin cobrar** → **Parcialmente cobrado** → **Cobrado**
(saldo = 0). Ya calculable hoy con los modelos existentes, no requiere schema nuevo.

---

## 9. Cuentas por pagar

Dos orígenes, cada uno con su propia fuente de "pagado":

- **Contratistas**: `CorteSemanal.montoNeto` (reconocido) vs. su
  `MovimientoSemanal.estatusPago = LIQUIDADO` (pagado).
- **Gastos con reembolso a un beneficiario**: `GastoObra.monto` (reconocido al
  aprobarse) vs. `ReposicionGastos` + `Σ AbonoReposicion.monto`.
- **Gastos pagados directo por la Empresa**: `GastoObra.monto` (reconocido) vs.
  `Egreso.fechaPago` (nuevo, sección 6.4).

Estados: **Por pagar** (reconocido, sin evento de pago) → **Parcialmente pagado**
(solo aplica a reembolsos con abonos parciales) → **Pagado**.

---

## 10. Movimientos / Tesorería

Vista de *dinero que realmente se movió*, sin importar su reconocimiento contable —
resuelve lo que hoy no existe: ver todo lo que entró/salió por medio financiero en un
rango de fechas. Fuentes: `MovimientoFinancieroCliente` (cobros, incluye fondo),
`MovimientoSemanal` LIQUIDADO (pagos a beneficiarios/contratistas),
`AbonoReposicion` (pagos de reembolso), `Egreso`/`Ingreso` manuales. Esta es la vista
de Flujo de Efectivo real — deliberadamente separada del Estado de Resultados
(sección 7).

---

## 11. Facturas / CFDI

Sin cambios al modelo `Factura` ya construido (XML como fuente de verdad, PDF solo
representación, "1 factura → N Egresos/Ingresos"). Se confirma la independencia con
los otros ejes: una operación puede estar incluida y reconocida sin CFDI todavía.

---

## 12. Impuestos y permisos/derechos de obra (catálogo extensible)

`IMPUESTOS` deja de ser una categoría única en `lib/control-de-obra/categorias-gasto.ts`.
Se separa en dos, cada una en su ámbito ya existente en el catálogo:

- **`IMPUESTOS_CONTRIBUCIONES`** (ámbito `empresa`, sensible) — ISR, IVA, cuotas
  patronales y contribuciones generales de la Empresa. Línea propia debajo de Utilidad
  Operativa (sección 7), nunca dentro de Gastos de Operación.
- **`PERMISOS_DERECHOS_OBRA`** (ámbito `obra`) — licencias, derechos, trámites
  atribuibles a una obra específica. Se suma dentro de Costos Directos de Obra.

El catálogo queda extensible (agregar una categoría nueva es cambio de código, sin
migración — mismo patrón que hoy) — no se construye un catálogo fiscal completo en
esta etapa.

---

## 13. Bancos / Tesorería

`MedioFinanciero` evoluciona de forma aditiva (no rompe lo existente) para soportar
cuentas reales sin tener que rediseñarlo después:

| Campo | Estado |
|---|---|
| `saldoInicial: Decimal` | nuevo |
| `fechaSaldoInicial: DateTime` | nuevo |
| `numeroCuentaEnmascarado: String?` | nuevo, opcional — últimos 4 dígitos, nunca el número completo |
| `moneda: String` | nuevo, default `"MXN"` — prepara multi-moneda sin forzarlo ahora (sección 16) |
| `tipo`, `activo` | ya existen |

**Fórmula del saldo (calculado, nunca almacenado) — corregida para usar solo dinero
real, nunca operaciones solo reconocidas:**

```
Saldo = saldoInicial
        + Σ Ingreso.monto   (cuentaReceptoraId = esta, estatus VIGENTE,
                              y (movimientoFinancieroClienteId IS NOT NULL
                                 OR fechaCobro IS NOT NULL), fecha real ≥ fechaSaldoInicial)
        − Σ Egreso.monto    (medioFinancieroId = esta, estatus VIGENTE,
                              fechaPago IS NOT NULL, fechaPago ≥ fechaSaldoInicial)
```

Regla única, sin excepciones por origen (GastoObra-vinculado o manual): un `Egreso`
sin `fechaPago`, o un `Ingreso` manual sin `fechaCobro`, **nunca** afecta el saldo —
son operaciones reconocidas, no dinero real todavía. Un `Ingreso` que decora un
`MovimientoFinancieroCliente` siempre cuenta (ese modelo solo existe cuando el dinero
ya se movió).

**Obligatoriedad de medio financiero (decisión 6):** un medio financiero es
obligatorio en el momento de registrar un cobro o pago real nuevo dentro de
Contabilidad (`Ingreso.cuentaReceptoraId` al registrar un cobro, `Egreso.fechaPago` +
`medioFinancieroId` al registrar un pago) — nunca por el simple hecho de reconocer una
operación (emitir una estimación o aprobar un gasto no exige cuenta todavía).

---

## 14. Futura conciliación bancaria (diseño, no implementación)

Se prepara el terreno con un campo nuevo por ahora: `Egreso.conciliadoEn: DateTime?` y
`Ingreso.conciliadoEn: DateTime?` (nuevo, nullable — null = no conciliado). El módulo
real de conciliación (importar/capturar extracto bancario como `MovimientoBancario` y
emparejarlo) es una fase futura, fuera de alcance ahora — el campo evita tener que
migrar datos históricos cuando se construya.

---

## 15. Rentabilidad por proyecto

Es el Estado de Resultados (sección 7) con `where: proyectoId`. Contratistas,
Materiales, Maquinaria y Permisos/derechos de obra ya tienen `proyectoId` directo.
Gastos de Operación (proyecto tipo `OFICINA`) **no se prorratean** a proyectos
individuales — son gastos de la Empresa, no de una obra. Por eso, "rentabilidad por
proyecto" en realidad muestra Utilidad Bruta por proyecto, no Utilidad Operativa —
debe nombrarse así para no confundir. Queda fuera de esta primera entrega (ya
acordado antes), sin cambios de modelo pendientes para construirla después.

---

## 16. Multi-moneda

Se agrega `moneda` a `MedioFinanciero` (sección 13, default `"MXN"`) dejando la
arquitectura preparada. **No se implementan** tipos de cambio, conversiones ni
resultados cambiarios en esta etapa.

---

## 17. Permisos

Se mantiene el techo actual: `puedeVerContabilidad` (Administrador/Director, nunca
Master ni Supervisor). Permisos nuevos:

- `puedeConfigurarContabilidad` — crear/editar `MedioFinanciero` con saldo inicial,
  configurar `Empresa.defaultInclusionContabilidad`.
- `puedeMarcarInclusionContable` — cambiar el flag de inclusión (eje 1) de una
  operación puntual. Se implementa como función independiente desde el inicio, aunque
  hoy devuelva exactamente lo mismo que `puedeVerContabilidad` (Administrador/
  Director) — así se puede restringir después (ej. solo Director) sin tocar ninguna
  lógica del módulo, mismo patrón que ya usa `puedeRegistrarMovimientoContable`.

**Regla dura (decisión 4):** un usuario con `puedeVerContabilidad` pero **sin**
`puedeVerInformacionPrivada(usuario)` (el único punto de verdad ya existente que
combina rol + preferencia personal "Vista privada" + `Empresa.privadoHabilitado`) no
debe poder ver filas, detalles ni agregados que permitan deducir información Privada.
Esto se aplica **en el filtro server-side de cada query de Contabilidad, antes de
agregar** (nunca después, nunca solo ocultando en la interfaz): toda capa `PRIVADO`
se excluye de la consulta si `puedeVerInformacionPrivada(usuario)` es `false` en ese
momento — incluyendo cuando un Administrador/Director simplemente tiene el interruptor
"Vista privada" apagado (mismo comportamiento que ya protege el resto del sistema; es
intencional que Contabilidad respete también ese interruptor, no solo el rol). En
consecuencia, el mismo usuario puede ver **totales distintos** en momentos distintos
según ese interruptor — es el comportamiento esperado, no un error.

---

## 18. Auditoría

Todo cambio a `incluidoEnContabilidad` (cualquier entidad), al saldo inicial de una
cuenta, y a `Empresa.defaultInclusionContabilidad` se audita vía `registrarAuditoria`
(mismo patrón que Egreso/Ingreso/MedioFinanciero hoy) — son cambios con impacto
directo en el Estado de Resultados, deben quedar quién y cuándo los decidió.

---

## 19. Relación con Control de Obra, Gastos, Reporte General y Estimaciones del Cliente

Ningún módulo existente cambia su flujo. Contabilidad **solo lee** (nunca escribe
hacia atrás): `GastoObra`/`GastoObraDetalle` (Gastos), `MovimientoSemanal`/
`CorteSemanal`/`AvanceConcepto` (Reporte General/Control de Obra),
`EstimacionClienteCapa`/`MovimientoFinancieroCliente` (Estimaciones del Cliente). Los
únicos cambios en esos modelos son los campos nuevos de este documento — aditivos, no
rompen nada existente.

---

## 20. Qué entra y qué no entra automáticamente — estados finales

| Estado | Significado | Aplica a |
|---|---|---|
| Incluido / No incluido | Eje 1 | `GastoObra`, `EstimacionClienteCapa`, `MovimientoFinancieroCliente` (solo fondo) |
| Reconocido / No reconocido | Eje 2 | derivado de estatus existentes (sección 4) |
| Cobrado / Parcialmente cobrado / Por cobrar | Eje 4 (cliente) | por capa de `EstimacionCliente` |
| Pagado / Parcialmente pagado / Por pagar | Eje 4 (proveedor/contratista/empresa) | `CorteSemanal` + `MovimientoSemanal`, `ReposicionGastos` + `AbonoReposicion`, `Egreso.fechaPago` |
| CFDI no requerido / pendiente / vinculado | Eje 3 | sin cambio |
| Conciliado / No conciliado | futuro | campo nuevo, sin funcionalidad aún |

Nada entra a Contabilidad solo por existir en Reporte General, Control de Obra o la
vista Privada — siempre pasa primero por el eje 1 (inclusión explícita, con default
configurable por Empresa).

---

## 21. Reglas de negocio confirmadas

1. Inclusión en Contabilidad, reconocimiento contable, estado fiscal (CFDI) y
   movimiento real de dinero son cuatro ejes independientes — nunca se infiere uno de
   otro.
2. `requiereFactura` nunca decide si una operación existe contablemente ni cuándo se
   reconoce — solo describe si hace falta un CFDI.
3. El default de inclusión en Contabilidad es configurable por Empresa
   (`Empresa.defaultInclusionContabilidad`); Conkuali lo configura en `false`.
4. Cada operación copia el default de su Empresa al crearse (snapshot editable), nunca
   se recalcula en vivo contra el default actual — no se altera retroactivamente un
   periodo ya reportado.
5. El ingreso por obra se reconoce cuando `EstimacionClienteCapa.estatus = EMITIDA` —
   no cuando se cobra.
6. Una aportación de fondo (`APORTACION_FONDO`) nunca es ingreso reconocido por sí
   misma — es Tesorería. El ingreso ya se contó al emitir la capa; aplicar fondo
   después es una reclasificación de efectivo, no un ingreso nuevo.
7. El costo de materiales/equipo se reconoce cuando `GastoObra.estatus = APROBADO`.
8. El costo de mano de obra de contratista se reconoce cuando existe
   `CorteSemanal.estatus = GENERADO` para ese beneficiario+proyecto+semana —
   independientemente de si ya se pagó.
9. Un gasto aprobado y pagado directo por la Empresa se distingue de uno aprobado y
   sin pagar mediante `Egreso.fechaPago` (nuevo) — reutilizando la entidad `Egreso`
   existente, sin duplicar el concepto de pago.
10. El saldo de una cuenta (`MedioFinanciero`) se calcula únicamente con movimientos
    reales de dinero (`Ingreso`, y `Egreso` con `fechaPago` no nulo) — nunca con
    operaciones solo reconocidas.
11. Un medio financiero es obligatorio al registrar un cobro o pago real, nunca al
    solo reconocer una operación.
12. La información de la capa Privada sigue siendo un eje de confidencialidad
    separado de la inclusión contable — un usuario sin permiso de Privado no ve
    filas, detalles ni agregados que permitan deducirla, filtrado siempre del lado
    del servidor antes de agregar.
13. `IMPUESTOS_CONTRIBUCIONES` (ámbito Empresa) y `PERMISOS_DERECHOS_OBRA` (ámbito
    obra) reemplazan la categoría genérica `IMPUESTOS` — catálogo extensible.
14. `MedioFinanciero` prepara moneda (`default "MXN"`) sin implementar conversión de
    tipo de cambio todavía.
15. Un Egreso/Ingreso manual también puede quedar reconocido sin haberse cobrado o
    pagado todavía (`fecha` = reconocimiento, `fechaPago`/`fechaCobro` = cobro/pago
    real, nulos mientras esté pendiente) — misma separación de ejes que el resto del
    módulo, sin crear entidades nuevas.
16. `puedeMarcarInclusionContable` inicia con el mismo techo que
    `puedeVerContabilidad` (Administrador/Director) pero vive como función
    independiente para poder restringirse después sin tocar la lógica del módulo.

---

## 22. Pendientes / preguntas abiertas

Ninguna — ambas preguntas menores de la versión anterior de este documento quedaron
cerradas (secciones 6.5 y 17).

---

## 23. Fuera de alcance en esta etapa

- Catálogo de cuentas contables / pólizas / partida doble.
- Conciliación bancaria completa (importación de extractos, matching automático) —
  solo se prepara el campo `conciliadoEn` (sección 14).
- Conversión de moneda / resultados cambiarios.
- Rentabilidad por proyecto como pantalla propia (el cálculo ya queda posible, la
  pantalla se construye después).
- Migración de saldo inicial histórico de cuentas ya en uso — se captura a mano al
  configurar cada `MedioFinanciero`.

---

## 24. Próximos pasos (fases de implementación propuestas — no ejecutadas)

1. **Schema** — campos nuevos de este documento (`Empresa.defaultInclusionContabilidad`,
   `incluidoEnContabilidad` en `GastoObra`/`EstimacionClienteCapa`/
   `MovimientoFinancieroCliente`, `Egreso.fechaPago`/`referenciaPago`/`conciliadoEn`,
   `Ingreso.conciliadoEn`, `MedioFinanciero.saldoInicial`/`fechaSaldoInicial`/
   `numeroCuentaEnmascarado`/`moneda`), catálogo `IMPUESTOS_CONTRIBUCIONES`/
   `PERMISOS_DERECHOS_OBRA`, permisos nuevos. Migración aditiva, sin tocar datos
   existentes.
2. **Backend — lecturas** — reescribir `lib/server/contabilidad/resumen.ts` sobre las
   fuentes correctas de reconocimiento (sección 4/7), Cuentas por Cobrar (sección 8),
   Cuentas por Pagar (sección 9), Movimientos/Tesorería (sección 10), saldo de
   `MedioFinanciero` (sección 13) — todas respetando el filtro de Privado (sección 17)
   desde el query.
3. **Backend — escrituras** — acciones para marcar inclusión contable, registrar
   `fechaPago`/`referenciaPago`/`medioFinancieroId` de un Egreso, configurar saldo
   inicial de `MedioFinanciero`, configurar el default de la Empresa — todas con
   auditoría (sección 18).
4. **UI — Resumen** — selector de periodo (mes/trimestre/año/personalizado) + alcance
   (Empresa/proyecto), Estado de Resultados completo, indicadores superiores.
5. **UI — Cuentas por Cobrar / por Pagar** — pantallas nuevas.
6. **UI — Bancos** — extender `medios-financieros-view.tsx` con saldo inicial y saldo
   calculado.
7. **Migración de datos existentes** — decidir y ejecutar el valor inicial de
   `incluidoEnContabilidad` para operaciones históricas ya capturadas antes de este
   cambio (backfill, requiere una pasada explícita, ver sección 22).

Cada fase se implementa y valida por separado — no se ejecuta ninguna hasta que la
autorices explícitamente.
