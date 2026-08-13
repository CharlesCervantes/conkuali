# Proceso: Control de Obra y Módulos de Soporte

## Control de Obra (dos versiones sincronizadas)

Todo proyecto requiere **dos versiones paralelas**, sincronizadas en tiempo real:
1. **Versión supervisor** — cantidades y avance, sin precios reales.
2. **Versión privada** — precios reales, solo Charles y Sergio.

## Ciclo operativo semanal (lunes a sábado)

Tareas asignadas por día a Charles y Andrés (ver calendario de actividades documentado
en sesión). Resumen:
- Charles: cortes de estados de cuenta, cotización de materiales, entrega de
  estimaciones a clientes, actualización del Reporte General, corte con Sergio para
  reponer gastos.
- Andrés: actualización real de pagos vs. estimaciones, requisición de materiales
  (a más tardar martes temprano), levantamiento de materiales reales, entrega de
  pre-estimaciones de contratistas, supervisión detallada de obra, actualización de
  programas de obra, listado de pendientes administrativos, revisión de contratos.

## Reporte General — sistema de estatus (4 colores, exclusivo)

- **Neutral** = sin movimiento aún.
- **Rojo** = confirmado, pendiente de pago.
- **Naranja** = pagado usando fondos de Sergio o de la empresa como puente.
- **Verde** = liquidado por completo.

El Reporte General consolida: proyectos formales, obras momentáneas (con reporte
simplificado del supervisor) y una partición "Oficina" para gastos administrativos
generales.

> Nota: la estructura real del Reporte General (entidades Contratista / Proveedor /
> Administración, columnas por semana, etc.) está detallada en
> `03-modulo-reporte-general.md`.

## Recibo de Pago

- Se genera **después** de que Sergio aprueba una estimación.
- Flujo actual (Opción A): se imprime, se firma físicamente, se escanea y se sube
  como evidencia.
- **Folios únicos a nivel compañía** (no por proyecto).
- Aplica a: contratistas formales, jornaleros informales, y pagos
  administrativos/honorarios (estos últimos requieren validación de lenguaje legal
  antes de usarse en producción).
- Se requiere historial acumulado de pagos por contratista.

## Control de Préstamos

Módulo documentado — pendiente de detallar en próxima sesión si aplica.

## Gastos Semanales

- Supervisores suben foto de ticket/factura con: monto, método de pago (tarjeta
  de la empresa → requiere factura formal; o tarjeta personal → se repone en
  efectivo), y comentario explicativo.
- **Charles debe autorizar cada gasto** antes de que entre al Reporte General en
  estatus rojo.

## Requisición de Materiales

1. Supervisor genera la orden de compra el **lunes**.
2. Charles cotiza el mismo día.
3. Sergio paga durante la semana.
4. Se refleja en Control de Obra **solo después de confirmado el pago** (no antes).

> **Especificación detallada del módulo:** la estructura completa de proyectos,
> Control Contractual Cliente, Estimación Cliente, contratos y estimaciones de
> contratistas, partidas, conceptos, aditivas, versiones normal/privada y
> generación de reportes se documenta en `04-modulo-control-de-obra.md`.
>
> Este documento (`02-control-de-obra.md`) conserva únicamente la visión general
> del proceso y su relación con los demás módulos.
