# Proceso: Administración Semanal de Pagos

## Ciclo semanal
- **Lunes a jueves**: captura de requisiciones/movimientos.
- **Jueves a viernes**: Sergio revisa y autoriza.
- **Viernes**: se ejecutan los pagos.

## Capas de información por proyecto

Cada proyecto maneja tres capas con acceso distinto:

| Capa | Quién la ve | Contenido |
|---|---|---|
| Control de Obra | Andrés y Charles | Cantidades, avance físico, sin precios reales |
| CC Privado | Charles y Sergio (solo ellos) | Precios reales, información financiera sensible |
| Reporte General | Toda la compañía (consolidado) | Vista agregada de todos los proyectos |

Las capas Control de Obra y CC Privado deben mantenerse **sincronizadas en tiempo real**
— es el mismo avance físico visto con o sin precios, no dos fuentes de verdad distintas.

## Permisos por rol

- **Andrés (Supervisor de campo)**: reporta gastos de campo con evidencia fotográfica.
  **No puede capturar ni modificar montos oficiales.**
- **Charles (Administrador)**: realiza toda la captura y validación oficial. Puede
  confirmar/rechazar movimientos.
- **Sergio (Director)**: autorización final y ejecución de pagos. También puede
  confirmar/rechazar movimientos (no es exclusivo de Charles).

## Aditivas (trabajo fuera de contrato)

Cualquier partida fuera del alcance contratado original **requiere autorización previa
de Sergio** antes de agregarse como nueva línea/partida al contrato del contratista.

## Problema de negocio detectado (confirmado)

El ritmo de pago a contratistas puede adelantarse al avance físico real de la obra,
generando riesgo de agotar el presupuesto del contrato antes de terminar el proyecto.
El sistema debe ayudar a hacer visible esta relación (pagado vs. avance real).

## Bitácora (no negociable)

Todo cambio de estado o monto debe quedar registrado. **No se permiten eliminaciones**:
los rechazos se conservan con su comentario/motivo, nunca se borran.
