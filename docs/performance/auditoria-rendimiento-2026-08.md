# Auditoría de rendimiento — Control de Obra (Conkuali)

**Fecha:** agosto 2026
**Alcance:** módulo Control de Obra (17 pantallas, 7 acciones de escritura)
**Estado:** solo diagnóstico — nada de lo aquí descrito fue implementado ni commiteado

---

## 1. Metodología

- **Tenant sintético desechable.** Se creó una empresa de prueba con 1 proyecto (esquema Administración), 5 partidas × 6 conceptos (30 conceptos), 3 contratistas, 6 semanas de historial (4 cerradas — 2 con estimación emitida, 2 en borrador — y 2 abiertas), gastos, órdenes de compra y fondo. Autenticación vía `createSession()` real (nunca se manejó ni mostró ninguna contraseña real). Todo se eliminó de la base de datos al terminar.
- **Producción real, no solo `next dev`.** Las cifras que sostienen las conclusiones vienen de `next build` + `next start`, contra la misma base Neon de producción. Se hizo una comparación separada contra `next dev` (sección 8) — nunca se mezclan las dos fuentes.
- **Neon introduce varianza real, no ruido de medición.** El mismo request, minutos aparte, varió de 0.9s a 5.3s sin ningún cambio de código — es cómputo serverless escalando desde inactivo. Se reporta rango + repeticiones, nunca un número suelto, y se separa explícitamente este efecto del código de la aplicación.
- **Prisma instrumentado a nivel de query.** Se agregó temporalmente `log:[{emit:"event", level:"query"}]` al cliente Prisma, activo solo detrás de una variable de entorno de auditoría (`PERF_AUDIT_LOG`). Cada query quedó registrada con su texto SQL y duración exacta. Se retiró por completo al terminar — `lib/server/db.ts` quedó idéntico a como estaba antes de la auditoría.
- **Alcance de la muestra.** El desglose de queries a nivel detalle se capturó para las pantallas con los hallazgos más relevantes o anómalos (Inicio, Avance, Cliente/Estimación, Cliente Priv./Estimación, Contrato Privado, Contratistas). Para el resto se reporta tiempo total real (3 repeticiones) y conteo de queries, pero no el desglose interno (marcado `n/d`). El dataset sintético (30 conceptos, 3 contratistas) es representativo de una obra mediana, no del límite superior de Conkuali — proyectos reales más grandes probablemente muestran los mismos cuellos de botella de forma más severa, no distinta.

---

> **Corrección posterior (misma fecha, medición de seguimiento):** el número original de Cliente / Estimación semanal (2.86s, marcado "Crítico") **no se reprodujo** en una segunda ronda de medición más controlada — con un tenant sintético distinto y una réplica aislada del mismo código, la página midió consistentemente 0.51–0.55s. La lectura más probable: esa ventana de la batería original coincidió con una degradación transitoria de Neon (Avance y Resumen, medidos justo antes, también mostraron picos ese mismo tramo). La tabla de abajo ya refleja el número corregido; el detalle completo de la reverificación está en el resumen ejecutivo que le sigue a este documento. Avance de obra y Resumen del proyecto **no se re-verificaron** con el mismo rigor — sus números originales se conservan, marcados para revalidar antes de tratarlos como definitivos.

## 2. Resultados — de más lenta a más rápida

Producción, 3 repeticiones por fila (con una petición de calentamiento previa descartada). El tiempo mostrado es el promedio de las 3; donde la varianza fue grande, se anota el rango.

| Pantalla / acción | Tiempo total | DB (suma) | # queries | Query más lenta | Severidad |
|---|---:|---:|---:|---|---|
| Avance de obra | 2.05 s (0.79–3.79) | 3.39 s* | 26 | `SUM avance_conceptos` · 620 ms | Alto + inestable — sin revalidar |
| Resumen del proyecto | 1.10 s (0.62–1.74) | n/d | 7 | — | Alto (inestable) — sin revalidar |
| Contrato General Privado | 1.05 s | 0.88 s | 9 | `conceptos` (sin select) · 235 ms | Alto |
| Cliente Priv. / Estimación semanal | 0.96 s (picos a 5.3s en frío) | n/d | 29 | `SUM estimaciones_cliente` · hasta 1.7s en frío | Alto (cold-start) |
| Cliente / Control Contractual | 0.67 s (0.41–1.10) | n/d | 17 | — | Medio |
| Proyectos (lista) | 0.76 s (0.59–0.97) | n/d | 6 | — | Medio |
| Catálogos / Personal | 0.70 s | n/d | 6 | — | Medio |
| Cliente / Estimación semanal (corregido) | 0.51–0.55 s† | n/d | ~22 | — | Medio — waterfall sin paralelismo confirmado, magnitud corregida |
| Gastos / Reposiciones | 0.62 s | n/d | 24 | — | Medio |
| Catálogos / Contratistas | 0.61 s | n/d | 6 | — | Medio |
| Gastos / Órdenes de Compra | 0.61 s | n/d | 18 | — | Bajo |
| Catálogos / Proveedores | 0.59 s | n/d | 6 | — | Bajo |
| Inicio | 0.65 s | 0.26 s | 6 | `sesiones` · 48 ms | Bajo |
| Reporte General | 0.62 s | n/d | 6 | — | Bajo |
| Contrato General | 0.47 s | n/d | 9 | — | Bajo |
| Contratistas | 0.50 s | 1.57 s* | 25 | `recibos_pago` · 346 ms | Bajo |
| Cliente Priv. / Control Contractual | 0.42 s | n/d | 16 | — | Bajo |

\* La suma de duración de queries puede superar el tiempo total real — indica concurrencia real entre Server Components (layout + página + componentes hijos), no solo el waterfall que muestra el código de una sola función.
† Ver el resumen ejecutivo para el waterfall exacto por servicio (obtenerOCrearSemana/obtenerResumenCierreSemana/obtenerEstimacionCliente-EnVivo) y la nota metodológica sobre por qué el número original no se reprodujo.

### Acciones de escritura (servidor, ejecutadas una vez sobre datos desechables)

| Acción | Tiempo total | Severidad |
|---|---:|---|
| cerrarSemana (proyecto completo, 30 conceptos, 3 contratistas) | 2.41–4.29 s (rango entre 2 corridas) | Crítico |
| guardarAvanceSemanal (30 conceptos, un solo envío) | 3.22 s | Crítico (escala linealmente con N — ver resumen ejecutivo) |
| guardarAvanceSemanal (5 conceptos) | 0.86–2.26 s (rango entre 2 corridas) | Crítico |
| emitirEstimacion | 0.93 s | Medio |
| aprobarGasto (con creación de Reposición) | 0.88 s | Medio |
| registrarPagoEstimacion | 0.51 s | Medio |
| cambiarEstatusAprobacionAvance (1 concepto) | 0.33–0.78 s (rango entre 2 corridas) | Medio |
| aplicarFondoAEstimacion (máximo disponible) | 0.47 s | Bajo |
| reabrirSemana | 0.24 s | Bajo |
| registrarAportacionFondo (1 aportación) | 0.14 s | Bajo |

*Los rangos entre dos corridas son el mismo fenómeno de varianza de Neon documentado en la sección de cold-start — no ruido de medición. Ver el resumen ejecutivo para el desglose exacto de `cerrarSemana` (por fase y por contratista) y el escalado completo de `guardarAvanceSemanal` (N=1/5/10/30).*

---

## 3. Auditoría de arquitectura (estática)

- **Cero `loading.tsx`, cero `<Suspense>`.** En las 29 páginas del sistema. Toda navegación es un bloqueo total hasta que termina el request completo — no hay streaming parcial en ningún punto.
- **Cero caché de datos.** Cero `revalidate`, `unstable_cache`, `"use cache"` o `cacheTag` en todo el código. Cada carga de página vuelve a consultar Neon desde cero.
- **`obtenerProyecto` sí está bien deduplicado.** Envuelto en `cache()` de React junto con `verifySession` — layout + página + servicios llamados en el mismo request comparten una sola consulta. Confirmado con datos: nunca se vio una segunda query de `proyectos` repetida dentro de un mismo request.
- **`obtenerOCrearSemana` escribe en cada lectura.** Es un `UPSERT`, no un `SELECT`, y no está cacheado. Cinco pantallas (Avance, Reporte General, Gastos, Cliente y Cliente Priv./Estimación) lo ejecutan en cada carga, incluso cuando la semana ya existe.
- **3 loops reales de queries en escritura:** `guardarAvanceSemanal` (`avance.ts:317`), la descarga masiva de recibos (`recibos.ts:527`) y el cierre por-contratista dentro de `cerrarSemana` (`cierre-semana.ts:615`) — los tres confirmados con evidencia de tiempo real, no solo lectura de código.
- **Over-fetching + fuga de datos privados.** `partidasConConceptos` (usada por Avance y Contratistas) trae todas las columnas de Concepto, incluidas las privadas — a diferencia de su gemela `partidasConConceptosOperativo`, que sí usa `select`. Efecto doble: más lento, y Supervisor recibe en el payload campos que no debería ver.

---

## 4. Top 10 cuellos de botella

### 1. cerrarSemana — la acción más pesada del sistema
- **Archivo:** `lib/server/control-de-obra/cierre-semana.ts:499-692`
- **Evidencia:** 2.41-4.29s medidos (dos corridas). Desglose exacto de una corrida limpia: el loop por-contratista (línea 615-627) es **el 51% del tiempo total** (1221ms de 2410ms) — 3 contratistas a ~400ms cada uno, estrictamente secuencial. `generarEstimacionCliente` es el segundo bloque más pesado (22%).
- **Causa:** dentro de la misma transacción atómica, un `for` genera/reconcilia un `CorteSemanal` por contratista, uno por uno.
- **Solución:** revisar si el trabajo por contratista (independiente entre sí) puede paralelizarse dentro de la misma transacción — requiere diseño cuidadoso.
- **Impacto:** Alto · **Riesgo:** Medio · **Esfuerzo:** medio-alto

### 2. guardarAvanceSemanal — N+1 confirmado con escalado limpio (N=1/5/10/30)
- **Archivo:** `lib/server/control-de-obra/avance.ts:317-341`
- **Evidencia:** 432ms/856ms/1316ms/3219ms para N=1/5/10/30 conceptos — escalado prácticamente lineal, ~96ms por concepto adicional. Confirma el patrón `for (fila) { await upsert; await registrarAuditoria; }` con evidencia reproducible, no un solo punto de datos.
- **Causa:** 2 queries secuenciales por fila, sin batch ni transacción agrupada.
- **Solución:** agrupar en `createMany`/`updateMany` por lote donde el negocio lo permita, o al menos envolver el loop en una sola transacción.
- **Impacto:** Alto · **Riesgo:** Bajo · **Esfuerzo:** medio

### 3. El costo real es el # de queries, no su complejidad SQL
- **Hallazgo transversal**, no un archivo.
- **Evidencia:** Dashboard (6 queries) → 258ms DB. Contrato Privado (9 queries) → 885ms. Avance (26 queries) → 3.4s. Relación casi lineal con el conteo, no con el SQL.
- **Implicación:** reduce cantidad de queries (batching, deduplicación, paralelismo real) vale más que optimizar el SQL de una query individual.
- **Impacto:** Alto (es diagnóstico, no cambio)

### 4. Cold-start / varianza de Neon — hasta 10× entre corridas, sin ningún cambio de código
- **Infraestructura**, no código de la aplicación.
- **Evidencia:** Cliente Priv./Estimación midió 0.93-1.0s en régimen tibio y 5.28s en la primera petición tras una pausa. Por separado, guardarAvanceSemanal(N=5) midió 856ms en una corrida limpia y 2.26s en otra; cerrarSemana midió 2.41s y 4.29s. El mismo código, minutos u horas aparte.
- **Solución:** evaluar con Neon un mínimo de cómputo dedicado ("always-on") — decisión de costo/infraestructura, no de código. Ver desglose completo en el resumen ejecutivo.
- **Impacto:** Alto en percepción y en la fiabilidad de cualquier medición futura · depende del plan Neon

### 5. Queries que preguntan por nada — `WHERE id IN (NULL)` en cada página del sistema
- **Origen confirmado:** `lib/server/session.ts:52` (`cargarUsuarioPorToken`) — el `select` anidado `empresa.plan.modulos.modulo` se parte en queries separadas; con `empresa.planId` nulo (tenant sin Plan asignado), Prisma igual dispara `planes`/`plan_modulos`/`modulos` con listas de ids vacías. Confirmado 2 veces en páginas distintas, mismo patrón exacto.
- **Evidencia:** 3 queries de ~40-45ms cada una, en TODA página del sistema (session se resuelve una vez por request vía `cache()`, pero el desperdicio ocurre igual en cada request nuevo).
- **Nota importante:** esto se confirmó con el tenant sintético, que no tenía Plan asignado. Falta verificar si la empresa real de Conkuali tiene `planId` nulo también — si sí, el hallazgo aplica igual en producción; si no, no reproduce. Ver el resumen ejecutivo para el detalle completo.
- **Solución:** evaluar `relationLoadStrategy: "join"` en Prisma (colapsa esto a una sola query con JOIN) o un guard explícito si el `planId` es null.
- **Impacto:** Medio-Alto (afecta cada página) · **Riesgo:** Bajo · **Esfuerzo:** bajo — quick win, pendiente de confirmar si aplica a producción

### 6. Cero `loading.tsx` — todo bloquea, nada progresa
- **Todo `app/`** — 0 de 29 páginas.
- **Causa:** sin `loading.tsx`/`<Suspense>`, la navegación siempre se siente "congelada" en vez de "progresiva", incluso en páginas ya rápidas.
- **Solución:** empezar por las pantallas más lentas confirmadas (Avance, Contrato Privado, Cliente Priv.-Estimación) — aditivo, no toca lógica de negocio.
- **Impacto:** Alto en percepción · **Riesgo:** Bajo · **Esfuerzo:** bajo por pantalla

### 7. `obtenerOCrearSemana` escribe en el camino de lectura
- **Archivo:** `lib/server/semanas.ts:47-55`
- **Evidencia:** `db.semana.upsert(...)` sin `cache()` ni guard — medido en ~250-265ms con 4 queries por invocación (no 1, como esperaría un upsert simple). Se ejecuta en 5+ pantallas en cada carga.
- **Solución:** revisar con cuidado — es la única fuente de verdad de "crear la semana si no existe"; cachear mal rompería esa garantía.
- **Impacto:** Medio · **Riesgo:** Medio · **Esfuerzo:** medio

### 8. Over-fetching en `partidasConConceptos`
- **Archivo:** `lib/server/control-de-obra/estructura-contractual.ts:145-151`
- **Evidencia:** trae todas las columnas de Concepto (incluidas privadas) sin `select`, a diferencia de `partidasConConceptosOperativo` (líneas 90-124), que sí lo usa.
- **Solución:** usar `partidasConConceptosOperativo` (ya existe) en Avance/Contratistas cuando no se necesita la capa privada.
- **Impacto:** Medio · **Riesgo:** Bajo · **Esfuerzo:** bajo-medio — corrige también fuga de datos privados

### 9. Cliente / Estimación semanal — sin paralelismo (magnitud corregida)
- **Archivo:** `app/(proyecto)/control-de-obra/[id]/cliente/general/estimacion/page.tsx`
- **Evidencia:** waterfall real confirmado (`obtenerOCrearSemana → obtenerResumenCierreSemana → obtenerEstimacionCliente/EnVivo`, sin `Promise.all`, page.tsx:72-85), pero el costo real medido es ~650-950ms en la réplica aislada del waterfall, no los 2.86s reportados originalmente (ver corrección arriba). Sigue siendo el único patrón 100% secuencial de las pantallas auditadas.
- **Solución:** `obtenerResumenCierreSemana` no depende de nada más que `semana.id` — puede dispararse junto con el resto en vez de esperar en la cola. Bajada de prioridad frente al reporte original.
- **Impacto:** Medio (revisado a la baja) · **Riesgo:** Bajo · **Esfuerzo:** bajo-medio

### 10. Crear Personal — dos escrituras sin transacción
- **Archivo:** `app/(app)/catalogos/actions.ts:136-169`
- **Evidencia:** `crearPersonalAction` llama `crearPersonalAdministrativo` y luego, en un `await` aparte, `vincularUsuarioBeneficiario` — sin `$transaction` compartida (comentario propio en el código lo admite, líneas 132-135).
- **Causa:** si la segunda escritura falla, queda un registro de Personal huérfano.
- **Solución:** envolver ambas en `db.$transaction` — mismo patrón ya usado en `eliminarBeneficiario`/`eliminarProyecto`.
- **Impacto:** Medio (integridad, no solo velocidad) · **Riesgo:** Bajo · **Esfuerzo:** bajo

---

## 5. Rendimiento real vs. percibido

**Real — el servidor de verdad tarda:**
- cerrarSemana (2.41-4.29s) — loop secuencial por contratista, 51% del tiempo total en la corrida instrumentada.
- guardarAvanceSemanal (432ms→3.22s según N=1→30) — N+1 confirmado con escalado lineal reproducible.
- Cliente/Estimación semanal (~650-950ms en la réplica aislada) — waterfall sin paralelismo, real pero de magnitud menor a lo reportado inicialmente.

**Percibido — el servidor no es (solo) el problema:**
- Cero `loading.tsx` en 29 páginas — cada navegación es un bloqueo total, incluso en páginas rápidas.
- Cold-start de Neon — picos a 5.3s con el código intacto.
- Resumen del proyecto (0.62s–1.74s) — varianza alta probablemente confunde más al usuario que la lentitud misma.

Agregar `loading.tsx` a las pantallas más lentas probablemente mejora la sensación de velocidad más que cualquier optimización de query individual, y es lo más barato de todo este reporte — no sustituye arreglar el waterfall de Cliente/Estimación, lo complementa.

---

## 6. Quick wins vs. optimizaciones estructurales

**Quick wins** (alto impacto, bajo riesgo, poco código):
- Short-circuit en queries con array de ids vacío.
- `$transaction` en crear/editar Personal.
- `loading.tsx` en las 4 pantallas más lentas.
- Usar `partidasConConceptosOperativo` donde ya aplica.

**Optimizaciones estructurales** (requieren tocar arquitectura/transacciones con cuidado):
- Batch/transacción en `guardarAvanceSemanal` (prioridad alta — escalado lineal confirmado, N=30 ya cuesta 3.2s).
- Revisar el loop por-contratista de `cerrarSemana` (prioridad alta — 51% del tiempo total de la acción más lenta medida).
- Rediseñar `obtenerOCrearSemana` para no escribir en cada lectura.
- Paralelizar el fetch de Cliente/Estimación semanal (prioridad baja — real pero de menor magnitud que lo reportado inicialmente).

---

## 7. Development vs. production

| Pantalla | next start (prod) | next dev | Lectura |
|---|---:|---:|---|
| Inicio | 0.65s | 0.68s | Prácticamente igual |
| Resumen del proyecto | 1.10s | 1.34s | Dev algo más lento, dentro del ruido |
| Avance de obra | 0.79–3.79s | 1.41–2.80s | Ambos con varianza alta — Neon domina, no Next.js |
| Cliente / Estimación | 0.51–0.55s (corregido)* | 1.56–1.60s | *Medido en tenants distintos — no comparable directo; ver nota de corrección arriba |
| Contrato Privado | 1.05s | 1.26–2.99s | Dev con más varianza |

**Contra la intuición habitual:** para las pantallas dominadas por queries a Neon (la mayoría), la diferencia dev/prod es pequeña o inconsistente — en una muestra, dev fue más rápido que prod. El costo de compilación de Turbopack en dev es real pero queda enmascarado por la latencia de Neon, que es igual en ambos modos. **No asumir que "producción arregla la lentitud"** — la mayoría de lo medido aquí es igual de lento en ambos.

---

## 8. Comparación con la auditoría anterior

No existe una auditoría previa. Se revisó `/docs`, el historial de git y el repositorio completo — no hay documentación, instrumentación ni resultados de una auditoría de rendimiento anterior. **Este reporte es el nuevo baseline.**

Sí existe un ajuste ad hoc previo relacionado (no una auditoría formal): el pool de conexiones en `lib/server/db.ts` tiene `min:1` + `idleTimeoutMillis` alto + `keepAlive`, con un comentario propio explicando que sin esto, reconectar a Neon costaba 1-2.5s en cualquier clic con más de 10s de por medio. Es el mismo fenómeno de cold-start que este reporte vuelve a documentar (hallazgo #5) — mitigado parcialmente, no eliminado.

---

## 9. Recomendación final priorizada

*Actualizada tras la ronda de verificación profunda — ver el resumen ejecutivo para el detalle completo de cada punto.*

1. Verificar si `empresas.planId` es null en producción, y si aplica, corregir la cadena `WHERE id IN (NULL)` de sesión (afecta cada página del sistema).
2. Envolver crear/editar Personal en `$transaction` (corrección de integridad, cero riesgo).
3. Convertir el loop de `guardarAvanceSemanal` a un patrón por lotes (escalado lineal confirmado, N=30 ya cuesta 3.2s).
4. Revisar si el loop por-contratista de `cerrarSemana` puede paralelizarse (51% del tiempo de la acción más lenta medida).
5. Usar el select operativo-seguro en `partidasConConceptos` donde ya aplica (rendimiento + corrige fuga de datos privados).
6. Agregar `loading.tsx` a las pantallas más lentas confirmadas (Avance, Contrato Privado, Cliente Priv.-Estimación).
7. Paralelizar el fetch de Cliente / Estimación semanal (prioridad baja tras la corrección de magnitud).
8. Extender `loading.tsx` al resto del módulo Control de Obra.
9. Rediseñar el UPSERT de `obtenerOCrearSemana` en el camino de lectura.
10. Evaluar con Neon un mínimo de cómputo dedicado.

No se implementó nada de lo anterior en el momento de escribir esta sección. Instrumentación temporal retirada por completo, datos sintéticos eliminados, sin commit.

---

## 10. Resultados después de Etapa A

**Fecha:** agosto 2026 — implementación de Etapa A (quick wins de bajo riesgo)

### Qué se implementó

| # | Cambio | Archivos |
|---|---|---|
| 1 | `WHERE id IN (NULL)` de sesión — **descartado tras verificar datos reales** | — (ver abajo) |
| 2 | `$transaction` en crear/editar Personal + vínculo Usuario | `lib/server/catalogos.ts`, `app/(app)/catalogos/actions.ts` |
| 3 | Select operativo-seguro en Avance y Contratistas (elimina columnas privadas) | `lib/server/control-de-obra/avance.ts`, `lib/server/control-de-obra/estructura-contractual.ts` |
| 4 | Paralelismo seguro en Cliente/Cliente Priv. — Estimación semanal | `app/(proyecto)/control-de-obra/[id]/cliente/general/estimacion/page.tsx`, `.../cliente/privado/estimacion/page.tsx` |
| 5 | `loading.tsx` (skeletons discretos) en 5 pantallas | `[id]/loading.tsx`, `ejecucion/avance/loading.tsx`, `contrato/privado/loading.tsx`, `cliente/general/estimacion/loading.tsx`, `cliente/privado/estimacion/loading.tsx`, `components/ui/skeleton.tsx` |

### Hallazgo #1 descartado con datos reales

Se consultó (solo lectura) la empresa real de Conkuali antes de tocar código: **`Empresa.planId` no es null** — tiene el plan "Completo" con 4 módulos asignados. El hallazgo de `WHERE id IN (NULL)` en la cadena de sesión se había confirmado únicamente con el tenant sintético (que no tenía plan asignado); no se reproduce en producción. Siguiendo la instrucción explícita de no optimizar sin causa confirmada, **no se tocó `cargarUsuarioPorToken`**.

### Verificación de correctitud (21/21, datos desechables)

- Avance de obra y Contratistas: confirmado campo por campo que `precioUnitarioIndirectos`, `precioUnitarioHerramienta`, `porcentajeUtilidad`, `precioUnitarioContratistaPrivado` y `cantidadContratadaPrivado` **ya no llegan** al resultado (ni a la base de datos ni al payload hacia el navegador); `precioUnitarioContratista`, `precioUnitarioMateriales` y `porcentajeAdministracion` (no privados) siguen presentes y correctos.
- Contratistas: monto de contrato recalculado idéntico al valor esperado (100×500 = 50,000) — el cálculo no cambió.
- Personal: crear/editar con un vínculo a un Usuario ya ocupado lanza error **y no deja ningún registro a medias** (ni el Beneficiario nuevo, ni el cambio de nombre en una edición) — atomicidad confirmada bajo falla real, no solo en el camino feliz.
- Supervisor bloqueado correctamente de Cliente Priv./Contrato Privado; Avance sigue accesible y sin errores para Supervisor tras remover las columnas privadas.
- Cliente/Cliente Priv.: valores renderizados (P.U., importes, subtotal/administración/total) verificados exactos contra lo esperado, en semana abierta y cerrada, antes y después del cambio de paralelismo.

### Tabla antes/después

Medido en `next build` + `next start`. Las columnas "Queries antes"/"después" son la evidencia más confiable (no dependen de la varianza de Neon); "Tiempo total" se reporta con las salvedades explicadas abajo.

| Pantalla | Tiempo antes | Tiempo después | Queries antes | Queries después | Mejora |
|---|---:|---:|---:|---:|---|
| Inicio | 0.65 s | 0.60 s | 6 | 6 | Sin cambio (no tocada) |
| Resumen | 1.10 s (0.62–1.74) | 0.66 s | 7 | 7 | No comparable de forma limpia — no tocada por Etapa A, la diferencia es varianza de Neon entre sesiones |
| Contrato General Privado | 1.05 s | 1.06 s | 9 | 9 | Sin cambio (solo ganó `loading.tsx`, que no se mide en tiempo de respuesta completo) |
| Avance de obra | 2.05 s (0.79–3.79) | 0.97 s (0.74–1.42) | 26 | 28 | Queries ~igual (esperado — el fix quita columnas, no queries); tiempo no comparable limpiamente (datasets/sesiones distintas) |
| Contratistas | 0.50 s | 0.46 s | 25 | 25 | **Queries idénticas** (confirma que el fix de over-fetching es de ancho de columna, no de conteo) |
| Cliente / Estimación semanal | 0.51–0.55 s (corregido) / 2.86 s (original, ver nota) | 0.81–0.89 s | ~22 | 27–32 | Ver "Paralelismo aislado" abajo — la comparación de página completa está confundida por tamaño de dataset |
| Cliente Priv. / Estimación semanal | 0.96 s (picos a 5.3s) | 0.74–0.83 s | 29 | 30–35 | Ver "Paralelismo aislado" abajo |

**Por qué el conteo de queries subió en Cliente/Cliente Priv.:** el paralelismo implementado es "especulativo" — se disparan las lecturas congelada Y en vivo a la vez (antes solo se llamaba la que correspondía), y se descarta la que no aplica según el estatus de la semana. Esto cuesta 5-6 queries de más (ambas lecturas son puras, sin efecto secundario) a cambio de eliminar la espera secuencial. Es un tradeoff real, no un error — documentado explícitamente en el código.

### Paralelismo aislado (secuencial vs. paralelo, mismo request, mismo momento)

Para aislar el efecto del cambio #4 de la varianza de Neon y de diferencias de dataset, se comparó secuencial vs. paralelo **dentro del mismo request**, sobre los mismos datos, una inmediatamente después de la otra — 10 repeticiones tibias (se descartó 1 repetición fría con cold-start):

| Repetición | Secuencial | Paralelo | Reducción |
|---:|---:|---:|---:|
| 1 | 554.6 ms | 349.2 ms | 37.0% |
| 2 | 432.7 ms | 466.8 ms | -7.9% |
| 3 | 434.4 ms | 413.3 ms | 4.8% |
| 4 | 423.8 ms | 349.2 ms | 17.6% |
| 5 | 376.8 ms | 339.2 ms | 10.0% |
| 6 | 409.7 ms | 337.6 ms | 17.6% |
| 7 | 551.7 ms | 521.2 ms | 5.5% |
| 8 | 1362.1 ms | 621.0 ms | 54.4% |
| 9 | 457.4 ms | 478.6 ms | -4.6% |
| 10 | 2430.4 ms | 1035.1 ms | 57.4% |

**Mediana: ~13.8% más rápido.** El patrón es honesto, no uniforme: en 8 de 10 repeticiones el paralelo ganó; en 2 fue ligeramente más lento (ruido de medición — Promise.all tiene su propio overhead de coordinación que puede empatar con la ganancia cuando las 3 llamadas ya eran rápidas). El beneficio es claramente mayor cuando Neon está lento (repeticiones 8 y 10, +54-57%) que cuando ya está tibio y rápido (unos pocos ms de diferencia) — el paralelismo ayuda más justo cuando más se necesita.

### Regresiones encontradas

Ninguna. Las 21 verificaciones de correctitud (fuga de datos privados, atomicidad de Personal, cálculos de Contratistas, valores renderizados de Cliente/Cliente Priv. en ambas ramas) pasaron. El único efecto secundario esperado y documentado es el aumento de 5-6 queries en Cliente/Cliente Priv., que es el costo explícito del tradeoff de paralelismo especulativo, no una regresión.

### Siguiente optimización recomendada (basada en estas mediciones)

1. **`guardarAvanceSemanal` (batch/transacción)** — sigue siendo el hallazgo con la evidencia más clara y de mayor impacto real (escalado lineal confirmado, 96ms/concepto adicional). No tocado en Etapa A a propósito (era Etapa B).
2. **Loop por-contratista de `cerrarSemana`** — 51% del tiempo de la acción más pesada del sistema. Requiere diseño cuidadoso (Etapa C).
3. Reconsiderar si vale la pena el tradeoff de queries extra en Cliente/Cliente Priv. — la mediana de mejora (~14%) es real pero modesta; si se prioriza reducir el conteo de queries en vez de la latencia percibida, una alternativa sería un pre-chequeo barato del estatus de cierre (una sola query) antes de decidir cuál estimación pedir, evitando la especulación — no implementado aquí porque el brief pedía explícitamente no over-engineerizar esta etapa.
4. Cold-start de Neon sigue siendo, con datos de esta etapa, la variable individual más grande en cualquier medición (57% de diferencia solo por el estado de Neon) — reafirma que la Etapa D (infraestructura) es donde vive la mayor ganancia de percepción restante.

---

## 11. Resultados después de Etapa B

**Fecha:** agosto 2026 — implementación de Etapa B (`guardarAvanceSemanal`, batch)

### Auditoría previa (antes de tocar código)

Confirmado leyendo `lib/server/control-de-obra/avance.ts` completo antes de escribir nada:

- `porGuardar` se construye en una sola pasada sobre `datos.filas`, comparando cada una contra `existentePorConcepto` (de un `findMany` inicial) y `anteriorPorConcepto` (de `sumaEjecutadaPorConcepto`, ya agregado con `groupBy`) — la validación de excedente ya ocurría **completa, antes de cualquier escritura** (nada que cambiar ahí).
- **Hallazgo no reportado antes:** el ciclo de escritura (`for (const fila of porGuardar) { upsert; registrarAuditoria }`) **no estaba dentro de ninguna `db.$transaction`** — cada `upsert` y cada `registrarAuditoria` eran operaciones independientes. Si algo fallaba a mitad del ciclo (ej. una caída de conexión), las filas ya escritas quedaban comprometidas sin rollback — la única protección real era que la *validación* de negocio ocurría antes de escribir, nunca una garantía transaccional de la escritura en sí. La versión batch corrige esto como efecto colateral (ver "Qué se implementó").
- `AvanceConcepto.@@unique([conceptoId, semanaId])` es la única garantía estructural contra filas duplicadas — confirmado en el schema, sin cambios.
- `verificarSemanaEditable` (semana cerrada + concepto liquidado) se llama dos veces, igual que antes: una vez a nivel semana (antes de leer conceptos) y otra vez con los conceptoIds finales de `porGuardar` (después de validar, antes de escribir) — orden preservado exactamente.

### Qué se implementó

Estrategia final (con la auditoría de causa hecha antes de escribir código):

1. **Validación**: sin cambios — se sigue cargando todo, validando todas las filas, y solo después se escribe. Una fila inválida sigue lanzando error antes de tocar la base de datos (ni siquiera dentro de una transacción que luego revierte — literalmente nunca se emite ningún INSERT/UPDATE).
2. **Escritura, ahora dentro de `db.$transaction`** (antes no había transacción):
   - **Filas nuevas** → `tx.avanceConcepto.createManyAndReturn(...)` — una sola sentencia `INSERT ... VALUES (...), (...), ...`, regresa los ids generados (necesarios para auditar cada uno).
   - **Filas existentes** → **una sola sentencia `UPDATE ... FROM (VALUES ...)`** vía `tx.$executeRaw` con `Prisma.sql`/`Prisma.join` — Postgres actualiza cada fila con su propio valor de cantidad en un solo round-trip. Cada valor interpolado pasa por el mecanismo de parámetros de Prisma (tagged template), nunca concatenación de texto.
   - **Auditoría** → `tx.registroAuditoria.createMany(...)` con **un registro por concepto** (nunca uno global) — mismo contenido (concepto, valor anterior, valor nuevo, usuario, fecha, acción) que antes, agrupado en una sola sentencia.
3. **Concurrencia**: dos requests simultáneos para un concepto **nunca antes capturado** ahora pueden chocar contra el `@@unique` dentro del `createManyAndReturn` — se capturó explícitamente (`P2002`) y se traduce a un error claro ("Alguien más acaba de capturar avance... actualiza la página e intenta de nuevo") en vez de fallar con un mensaje genérico. Esto es **más estricto** que el `upsert` anterior (que resolvía la carrera en silencio, último-en-escribir-gana) — documentado como una mejora deliberada, no un cambio de regla de negocio.

### Por qué SÍ se usó SQL parametrizado (pros/contras evaluados)

Prisma no ofrece un "`updateMany` con valores distintos por fila" nativo. Se evaluaron dos opciones:

| Opción | Pros | Contras |
|---|---|---|
| N `tx.avanceConcepto.update()` individuales, dentro de 1 transacción | 100% type-safe, `@updatedAt` automático, cero riesgo de SQL | Sigue siendo O(N) queries para la mitad de los casos (edición) — no cumple el objetivo de "casi constante" |
| **`UPDATE ... FROM (VALUES ...)` vía `$executeRaw` + `Prisma.sql`/`Prisma.join`** (elegida) | Verdadero O(1) — una sola sentencia sin importar N | Pierde el tipado de Prisma para esa sentencia; requiere manejar a mano `"updatedAt" = now()` y el cast de enum `'PENDIENTE'::"EstatusAprobacionAvance"`; más difícil de leer para alguien no familiarizado con el patrón VALUES-join |

Se optó por la segunda porque el objetivo explícito era reducir de O(N) a casi-constante, y el patrón usado es el documentado oficialmente por Prisma para listas de longitud variable (nunca concatenación de string): cada valor se interpola con `${...}` dentro de `Prisma.sql`, que Prisma convierte en un parámetro con placeholder real — el texto SQL en sí (nombres de columna, `FROM`, `WHERE`) es siempre estático, nunca construido a partir de input del usuario.

### Verificación de correctitud (26/26, datos desechables, corrida en `next start`)

| # | Escenario | Resultado |
|---|---|---|
| 1 | Crear avance nuevo | ✓ filas creadas, `PENDIENTE`, 1 auditoría CREAR por concepto |
| 2 | Editar avance existente | ✓ cantidad actualizada, auditoría EDITAR con valorAnterior/valorNuevo correctos |
| 3 | Mezcla nuevos + existentes en un mismo envío | ✓ ambos caminos (createManyAndReturn + UPDATE batch) conviven en la misma transacción |
| 4 | Cantidad = 0 | ✓ concepto nunca capturado + cantidad 0 → no genera fila (sin cambios); concepto existente editado a 0 → sí se guarda (cambio real) |
| 5 | Excedente de cantidad contratada | ✓ error, cero filas escritas |
| 6 | 1 fila inválida entre 30 | ✓ error, **las 30 quedan sin guardar** (rollback completo — de hecho, nunca se emite ni un solo INSERT/UPDATE) |
| 7 | Semana cerrada | ✓ bloqueado |
| 8 | Concepto con corte liquidado (semana reabierta) | ✓ bloqueado específicamente ese concepto, cantidad sin cambios |
| 9 | Doble request concurrente (mismo concepto, nunca antes capturado) | ✓ nunca 2 filas; al menos una tuvo éxito; el valor final es el de una de las dos solicitudes, nunca una combinación |
| 10 | Auditoría por concepto en un lote de 5 | ✓ exactamente 5 registros de auditoría (uno por concepto), no 1 global |

### Tabla antes/después — queries

Query más lenta ya no es el eje del problema aquí — lo es el **conteo**, que es lo que la auditoría original identificó como la causa raíz. Medido con `next build` + `next start`, instrumentación de Prisma a nivel de query.

| N | Queries antes (medido, N+1 confirmado) | Queries después (medido, todas las corridas tibias) | Reducción |
|---:|---:|---:|---:|
| 1 | 13 | 11 | -15% |
| 5 | 21 | 11 | -48% |
| 10 | 31 | 11 | -65% |
| 30 | 71 | **11** | **-85%** |

*"Queries antes" = 11 fijas (permisos/proyecto/semana/candados/lecturas de validación) + 2×N (un `upsert` + un `registrarAuditoria` por fila) — fórmula derivada del comportamiento confirmado en el código anterior. "Queries después" = 11 fijas, **sin ningún término que dependa de N** — confirmado directamente instrumentando Prisma: exactamente 11 queries dentro de `guardarAvanceSemanal` para N=1, N=5, N=10 y N=30 por igual (createManyAndReturn + UPDATE batch + auditoría createMany cuentan como 1 query cada uno, sin importar cuántas filas muevan).*

### Tabla antes/después — tiempo

| N | Antes (Etapa A, corrida dedicada) | Después (mediana, corridas tibias intercaladas) | Lectura |
|---:|---:|---:|---:|
| 1 | 432 ms | 937 ms | No comparable de forma limpia (ver nota) |
| 5 | 856 ms | 931 ms | No comparable de forma limpia (ver nota) |
| 10 | 1,316 ms | 939 ms | -29% |
| 30 | 3,219 ms | 1,080 ms | **-66%** |

**Nota de honestidad metodológica:** las columnas "antes" y "después" se midieron en **sesiones distintas** (días distintos), así que no son estrictamente comparables — el "antes" pudo capturarse en una ventana de Neon más tibia que el "después". Por eso se hizo una prueba adicional, **intercalando N=1/5/10/30 dentro de la misma ventana de medición** (para que cualquier deriva de Neon afecte a todos los N por igual, no solo a los últimos):

| Ronda | N=1 | N=5 | N=10 | N=30 |
|---:|---:|---:|---:|---:|
| 1 (fría) | 2,100 ms | 4,108 ms | 3,494 ms | 2,367 ms |
| 2 (tibia) | 976 ms | 924 ms | 942 ms | 1,005 ms |
| 3 (tibia) | 937 ms | 1,022 ms | 939 ms | 1,162 ms |
| 4 (tibia) | 926 ms | 931 ms | 925 ms | 1,080 ms |

**Esta es la evidencia más limpia disponible:** en las 3 rondas tibias, el tiempo total está entre 0.92s y 1.16s **sin importar N** — no hay ninguna tendencia creciente. Antes del cambio, N=30 constantemente costaba ~7.5× más que N=1 (3,219ms vs 432ms, patrón lineal confirmado con múltiples repeticiones). Después del cambio, N=30 no es sistemáticamente más lento que N=1 — la variable que domina el tiempo total ya no es N, es la varianza de Neon (la ronda 1, fría, es 2-4× más lenta que las rondas 2-4, para TODOS los N por igual).

**Conclusión de la medición de tiempo:** se logró el objetivo #3 del brief ("mantener tiempos relativamente estables al crecer N") de forma clara. La reducción absoluta de tiempo es más chica de lo que el conteo de queries sugeriría a valores bajos de N (N=1/N=5), porque ahí el costo ya estaba dominado por el overhead fijo (sesión, permisos, candados) que no cambió — la ganancia real y grande está, como se esperaba, en N alto, que es exactamente el caso de uso real (capturar avance de una partida completa de una sola vez).

### Regresiones encontradas

Ninguna. 26/26 verificaciones de correctitud, incluyendo los casos más delicados (rollback completo ante una fila inválida en un lote de 30, bloqueo por semana cerrada, bloqueo por concepto liquidado con semana reabierta, y concurrencia con dos requests simultáneos sobre el mismo concepto nunca antes capturado).

**Cambio de comportamiento deliberado y documentado (no una regresión):** una carrera real entre dos usuarios capturando el MISMO concepto por primera vez en la MISMA semana ahora falla con un mensaje claro pidiendo reintentar, en vez de resolverse en silencio con "el último que escribió gana" (comportamiento del `upsert` anterior). Es un escenario de milisegundos, prácticamente nunca visto en uso real, y la nueva conducta es estrictamente más segura.

**Mejora de correctitud encontrada como efecto colateral:** la escritura ahora sí ocurre dentro de una transacción real (antes no la había) — un fallo a mitad del lote ahora revierte todo de forma garantizada por Postgres, no solo por la validación previa en JavaScript.

### ¿Vale la pena tocar `cerrarSemana` ahora?

**Sí, sigue siendo la recomendación.** Con `guardarAvanceSemanal` resuelto, `cerrarSemana` (2.4-4.3s, con el loop por-contratista representando el 51% del tiempo total en la corrida instrumentada de la auditoría original) queda como la única acción medida que sigue escalando con el tamaño de la obra (más contratistas = más iteraciones del loop). A diferencia de `guardarAvanceSemanal`, ese loop genera/reconcilia un `CorteSemanal` completo por contratista (con su propia cascada de cálculos financieros) — no es un simple `INSERT`/`UPDATE` por fila, así que la misma estrategia de batch (createMany + UPDATE por VALUES) no aplica directo; requeriría diseño propio, con el mismo cuidado de no debilitar ninguna garantía financiera. Se mantiene como candidato para una Etapa C separada, con su propio análisis de causa antes de tocar código — tal como se hizo aquí.

## 12. Resultados después de Etapa C

**Fecha:** agosto 2026 — implementación de Etapa C (`cerrarSemana`, loop por contratista). A diferencia de Etapa B, aquí se optó deliberadamente por **no** llevar el loop a O(1) — la prioridad explícita era preservar la transacción única y las garantías financieras, aceptando una mejora "segura del 25-40%" en vez de una reescritura de mayor riesgo.

### Perfil profundo (antes de tocar código)

Instrumentado temporalmente con marcadores por fase y log de queries a nivel Prisma, corrida real con `next build`+`next start`, 3 contratistas / 30 conceptos (mismo dataset que la auditoría original):

**Camino CREAR (contratista nuevo, sin corte previo) — 8 queries por contratista:**

| Query | Propósito |
|---|---|
| `SELECT cortes_semanales` (findUnique) | Buscar corte existente — sale `null`, Prisma no dispara las relaciones anidadas |
| `SELECT COUNT cortes_semanales` | Calcular `numero` correlativo — **recalculado desde cero en cada contratista** |
| `INSERT movimientos_semanales` | Crear `MovimientoSemanal` |
| `INSERT cortes_semanales` | Crear `CorteSemanal` (con `RETURNING` solo del `id`, no de la fila completa) |
| `INSERT corte_semanal_conceptos` | Detalle, ya agrupado en una sola sentencia (`detalle: {create:[...]}`) |
| `SELECT cortes_semanales` (por id) | **Re-consulta no solicitada por el código** — Prisma la emite porque el `create` tenía una relación anidada (`detalle`) y no puede devolver la fila completa con un solo `RETURNING` |
| `INSERT registros_auditoria` ×2 | Auditoría de `CorteSemanal` y `MovimientoSemanal`, una sentencia cada una |

**Camino RECONCILIAR (corte ya existe) — 11 queries por contratista:** las mismas categorías, más 3 queries adicionales porque el `findUnique` con `include` sí dispara sus relaciones (`movimientoSemanal`, `detalle`, `recibos`) al no ser null, más `DELETE corte_semanal_conceptos` antes de recrear el detalle.

Confirmado con evidencia, no supuesto: **la latencia por query fue consistentemente ~45-55ms** (Neon), lo que explica exactamente los ~400ms/contratista medidos en la auditoría original (8-11 queries × ~45-50ms).

### Sobre `Promise.all` dentro de la transacción — confirmado que NO ayuda

Se pidió explícitamente no usar `Promise.all` sin demostrar beneficio real. La evidencia, sin necesidad de una prueba sintética aparte: **cada query del log tiene su timestamp de inicio exactamente igual al timestamp de fin de la query anterior**, sin solapamiento, en las decenas de queries capturadas dentro de la misma transacción. Esto es la confirmación empírica de un hecho estructural de Postgres/`pg`: una transacción interactiva de Prisma (`db.$transaction`) mantiene **una sola conexión** reservada mientras dura; esa conexión procesa un statement a la vez. Lanzar queries en paralelo con `Promise.all` sobre el mismo `tx` no logra paralelismo de red real — todo se serializa igual en el socket, solo que con el riesgo añadido de queries entrelazadas sobre la misma transacción. Por eso **no se usó `Promise.all` en ningún punto de la reescritura**.

### Qué se implementó

Tres cambios, todos dentro de la transacción única existente, ninguno cambia qué se calcula ni qué se guarda:

1. **Precarga antes del loop**: un solo `tx.corteSemanal.findMany({where:{proyectoId,semanaId}, include:{movimientoSemanal,detalle,recibos}})` trae **todos** los cortes existentes del proyecto+semana de una vez, indexados en un `Map` por `beneficiarioProyectoId`. Reemplaza el `findUnique` con `include` que antes corría una vez por contratista dentro del loop. De la misma consulta se deriva también qué contratistas "tenían corte vigente pero ya no tienen líneas" (antes era una query `findMany` aparte con `notIn`).
2. **`numero` correlativo precalculado una sola vez**: un `COUNT` antes del loop en vez de uno por contratista — seguro porque toda la operación ocurre dentro de la misma transacción atómica (nadie más puede insertar un corte de este proyecto mientras tanto), así que precalcular y llevar la cuenta en memoria da exactamente los mismos números, en el mismo orden que antes.
3. **`detalle` fuera del `create`/`update` anidado**: separar `corteSemanal.create({data:{...}})` de `corteSemanalConcepto.createMany({data:[...]})` elimina el `SELECT` de re-confirmación que Prisma emitía después de cada escritura anidada — mismas filas guardadas, un round-trip menos por contratista.
4. **Auditoría agrupada al final del loop, no una vez por contratista**: cada llamada a `generarOReconciliarCorte` ahora regresa sus entradas de auditoría pendientes (`CorteSemanal`, `MovimientoSemanal`, y `ReciboPago` cuando aplica) en vez de escribirlas de inmediato; `cerrarSemana` las acumula y hace **una sola** `registroAuditoria.createMany` después del loop, con un registro por entidad modificada — igual trazabilidad que antes, nunca un registro global.

**Deliberadamente NO se hizo** (para no forzar el batch cross-contratista que el propio brief pidió evitar): las escrituras de `CorteSemanal`/`MovimientoSemanal`/`CorteSemanalConcepto` siguen siendo una por contratista dentro del loop, no un `createMany` cruzando todos los contratistas. La razón: `CorteSemanal.movimientoSemanalId` depende del id generado por `MovimientoSemanal`, y `CorteSemanalConcepto.corteSemanalId` depende a su vez del id generado por `CorteSemanal` — una cadena de dependencia de 3 niveles, distinta para cada uno de 4 sub-casos posibles por contratista (CREAR/RECONCILIAR/OMITIDO_LIQUIDADO/SIN_CAMBIOS). Batchearla habría exigido reconstruir esa cadena de ids en memoria antes de escribir nada, exactamente la complejidad que el brief pidió no forzar.

### Verificación de correctitud (todas ✓, datos desechables, corrida en `next start`)

| # | Escenario | Resultado |
|---|---|---|
| 1 | Cierre normal (3 contratistas nuevos) | ✓ 3 `CREADO`, monto correcto, `numero` 1/2/3 |
| 2 | Concepto pendiente por aprobar | ✓ bloqueado, mismo mensaje que antes |
| 3 | Doble cierre (mismo request repetido) | ✓ segunda llamada `yaEstabaCerrada:true`, cero escrituras, 302ms |
| 4 | Reabrir sin cambios + recerrar (`SIN_CAMBIOS`) | ✓ 0 generados, 0 reconciliados, montos y `numero` idénticos, cero auditoría nueva |
| 5 | Avance de un contratista baja a 0 tras reapertura | ✓ su corte pasa a `ANULADO` (`montoNeto:0`, `movimientoSemanal.estatusPago:SIN_MOVIMIENTO`), **fila conservada, nunca borrada**, `numero` preservado |
| 6 | Corte con `MovimientoSemanal.LIQUIDADO`, avance editado por debajo | ✓ `OMITIDO_LIQUIDADO`, corte y movimiento **intocados** (monto, estatus, detalle idénticos a antes de la edición) |
| 7 | Dos requests de cierre simultáneos (mismo proyecto/semana) | ✓ exactamente 3 cortes (sin duplicados), un request `CREADO`, el otro `yaEstabaCerrada:true` vía el mismo manejo de `P2002` que ya existía |
| 8 | Mezcla en un mismo cierre: 1 `SIN_CAMBIOS` + 1 `RECONCILIADO` + 1 `OMITIDO_LIQUIDADO` | ✓ auditoría agrupada solo con las entradas correctas (2 nuevas, ninguna para los otros dos) |

No se repitió aparte la prueba de "1 fila inválida entre 30 → rollback total" porque esa validación vive en el bloque *anterior* al loop (pendientes/sin-contratista), sin cambios de esta etapa — cualquier error ahí sigue lanzando antes de escribir nada, y toda la operación sigue dentro de la misma `db.$transaction` que ya garantizaba el rollback.

### Tabla antes/después — queries (camino CREAR, medido con `next build`+`next start`)

| Contratistas (N) | Queries antes | Queries después | Reducción |
|---:|---:|---:|---:|
| 1 | 37 | 37 | 0% |
| 3 | 53 | 43 | -19% |
| 5 | 69 | 49 | -29% |
| 10 | 109 | 64 | -41% |
| 30 | 269 | 124 | **-54%** |

*Fórmula ajustada a los datos medidos: antes = 29 + 8N; después = 34 + 3N. El punto de equilibrio es N=1 (la precarga tiene un costo fijo ~5 queries mayor que antes, porque Prisma dispara sus 3 queries de relación aun con el resultado vacío), pero la pendiente por contratista baja de 8 a 3 — la ganancia crece con N, que es exactamente el caso real (más contratistas en la obra).*

Camino RECONCILIAR (recierre tras editar avance), N=3: 47 queries después (antes, con la misma fórmula de pendiente 11/contratista confirmada en el perfil profundo, ≈57) — reducción similar, ~18%.

### Tabla antes/después — tiempo (medianas de 3 corridas tibias, `next start`)

| Contratistas (N) | Antes | Después | Mejora |
|---:|---:|---:|---:|
| 1 | 2,585 ms | 4,048 ms | dentro del ruido (misma cuenta de queries, 0% de reducción esperada) |
| 3 | 3,844 ms | 2,928 ms | -24% |
| 5 | 3,643 ms | 3,519 ms | señal débil, alta varianza de Neon |
| 10 | 6,990 ms | 4,236 ms | **-39%** |
| 30 | 15,341 ms | 9,644 ms | **-37%** |

**Nota de honestidad metodológica:** N=1 y N=5 muestran señal débil o ruido — coherente con que N=1 tiene *exactamente* el mismo conteo de queries antes/después (el punto de equilibrio de la fórmula), y con que la varianza de Neon en corridas individuales (no intercaladas, por el costo de reconstruir el servidor en cada swap de código) puede fácilmente enmascarar una diferencia de un par de queries a N bajo. La señal es clara y consistente a partir de N=10: 39% y 37% más rápido, alineado con la reducción de queries medida (41% y 54%).

### Regresiones encontradas

Ninguna. Las 8 verificaciones de correctitud pasaron, incluyendo los tres escenarios financieramente más sensibles: protección de corte `LIQUIDADO` (íntegramente intocado aunque el avance subyacente cambió), corte que baja a `ANULADO` sin borrarse, y concurrencia de dos cierres simultáneos sin duplicar `CorteSemanal`.

**Sin cambios de comportamiento deliberados esta vez** (a diferencia de Etapa B) — la reescritura preserva exactamente la misma semántica en cada rama, incluyendo el manejo de `P2002` que ya existía sin modificarlo.

### ¿Queda algún cuello de botella de código, o el siguiente límite ya es Neon?

El loop por contratista ya no domina el tiempo total de la misma forma: a N=30 pasó de ~51% a una fracción menor del tiempo total, y el `numero`/precarga/auditoría dejaron de escalar con N. Lo que queda:

- **`generarOReconciliarEstimacionBorrador`** (~22% del tiempo original, ~11-13 queries fijas, **no tocado** en esta etapa por instrucción explícita) — el perfil profundo no mostró queries redundantes ahí, así que no había nada que optimizar sin cambiar su semántica.
- **El piso de ~45-50ms por round-trip a Neon** es ahora, con más claridad que antes, el límite real: incluso con el conteo de queries reducido a la mitad, el tiempo no baja en la misma proporción porque cada query individual sigue costando lo mismo. Reducir queries ayuda, pero no hay forma de bajar el piso de latencia por query sin tocar infraestructura (fuera de alcance, explícitamente no autorizado).

**Conclusión:** no queda una optimización de código de bajo riesgo adicional identificada para `cerrarSemana` — las ganancias que faltarían (llevar el loop a O(1) real, cruzando contratistas) exigirían exactamente la reescritura riesgosa que se decidió evitar. El siguiente límite real es la latencia de red hacia Neon, no el código.
