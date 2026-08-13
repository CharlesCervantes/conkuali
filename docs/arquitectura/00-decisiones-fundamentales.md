# Decisiones Fundamentales de Arquitectura

Este documento captura decisiones estructurales tomadas antes de empezar a codificar.
Cambiarlas después implica reescritura significativa — deben respetarse en todo el
sistema desde el primer módulo.

---

## 1. El sistema es multi-tenant desde el día 1

Aunque hoy el único cliente real es Grupo Conkuali, el sistema se construye para
soportar **múltiples empresas/clientes** desde la base de datos hacia arriba. Conkuali
es el "tenant #1", no un caso especial ni hardcodeado.

### Jerarquía de datos

```
Empresa (tenant)
 └── Usuarios (con rol dentro de esa empresa)
 └── Proyectos
      └── Contratistas / Proveedores / Administración / Movimientos semanales
 └── Plan contratado (define qué módulos puede usar)
 └── Tema (colores/marca)
```

**Todo** dato de negocio (proyectos, contratistas, movimientos, bitácora, etc.) debe
llevar referencia a la Empresa dueña del dato. No debe existir ninguna tabla de
negocio sin esa relación.

### Estrategia de aislamiento

- Base de datos **compartida** con `empresa_id` en cada tabla relevante (no una base
  de datos separada por cliente — más simple de mantener a este tamaño de proyecto).
- Toda consulta debe filtrar por `empresa_id` del usuario autenticado. Esto debe
  resolverse en una capa central (no repetir el filtro manualmente en cada endpoint),
  para evitar fugas de datos entre empresas por error humano.

### Roles

Los roles deben modelarse de forma **genérica**, no como "Sergio", "Charles",
"Andrés" (esos son personas de Conkuali, no roles del sistema). Roles genéricos
sugeridos, mapeados a lo ya documentado:

| Rol genérico | Equivalente en Conkuali |
|---|---|
| Dueño/Director | Sergio |
| Administrador | Charles |
| Supervisor de campo | Andrés |

Cada empresa nueva definirá sus propios usuarios con estos roles (o roles adicionales
en el futuro).

**Jerarquía tentativa de permisos dentro de una empresa (a confirmar en detalle al
diseñar Usuarios/Login):**
- **Supervisor de campo** — el más limitado; reporta pero no captura montos oficiales.
- **Administrador** — permisos amplios y configurables (puede otorgar/quitar permisos
  a otros usuarios de su empresa).
- **Director** — acceso total dentro de su empresa.

### Rol de plataforma: Master / Super Admin (fuera de cualquier tenant)

Además de los roles anteriores (que existen *dentro* de una Empresa), se requiere un
rol de plataforma — **Master**, exclusivo del equipo que opera el sistema (no de una
empresa cliente) — que puede ver y administrar **todas las empresas/tenants** dadas
de alta: sus usuarios, su plan contratado, su paleta de colores/logo, etc. Este rol no
pertenece a la jerarquía de roles de una empresa; opera en un nivel superior, cruzando
tenants. Falta definir su modelo de datos exacto (ej. si un usuario Master vive fuera
de la tabla Usuario-Empresa o es un flag especial) al diseñar Usuarios/Login.

### Plan contratado y permisos por módulo

Cada Empresa tiene un **Plan** que determina qué módulos puede usar (ej. una empresa
podría no tener acceso a "Control de Préstamos" si no lo contrató). El sistema de
permisos debe consultar el plan de la empresa, no solo el rol del usuario. Aunque hoy
Conkuali tiene "todo incluido", el mecanismo de permisos por módulo debe existir desde
el primer módulo (login) para no volverse a tocar después.

### Personalización visual (branding)

Cada Empresa tiene su propia paleta de colores/logo, aplicada dinámicamente en la
interfaz (variables de tema, no colores fijos en el código). Conkuali usará su propia
paleta como primer caso de uso real de este mecanismo.

**Decidido (refinado):** no todos los usuarios tienen un dominio de correo propio de
empresa — algunos usan correos personales (Gmail, Hotmail, etc.), que no pueden usarse
para distinguir tenants (`gmail.com` no es exclusivo de ninguna empresa). Por lo tanto:

- La relación **Usuario → Empresa es explícita y obligatoria** en el registro del
  Usuario (`empresaId`), asignada por un Administrador/Master al crear la cuenta — no
  se infiere del dominio del correo al iniciar sesión. El login resuelve el tenant
  directamente desde el registro del Usuario (el correo ya es único a nivel
  plataforma), no parseando el dominio.
- El **dominio de correo por Empresa** (`DominioCorreo`) se conserva como dato
  opcional y secundario: sirve para casos donde la empresa sí tiene dominio propio
  (ej. autocompletar/asignar automáticamente la empresa al invitar un nuevo usuario
  bajo ese dominio). No es el mecanismo de autorización.

---

## 2. Estrategia móvil: API-first, apps nativas en fase 2

- **Fase 1 (ahora):** Web, pero el backend se construye como una **API** separada de
  la lógica de interfaz — no lógica de negocio embebida directo en páginas web.
  Cualquier acción (ej. Andrés subiendo una foto de gasto) debe poder resolverse vía
  llamada a la API, no solo desde un formulario web.
- La web debe ser usable cómodamente desde el navegador de un celular (diseño
  responsive) mientras no exista la app nativa — así Andrés ya puede subir evidencia
  desde campo sin esperar a la fase 2.
- **Fase 2 (después de que la web esté estable):** apps iOS/Android que consuman la
  misma API. Se evaluará en su momento si se construyen nativas o con un framework
  multiplataforma (ej. React Native/Expo) para compartir código con el equipo web.
- **Implicación práctica desde ahora:** no meter lógica de negocio dentro de
  componentes de interfaz web. Debe poder llamarse igual desde web o desde una futura
  app sin duplicar reglas.

---

## 3. Resumen de impacto en módulos ya documentados

- `03-modulo-reporte-general.md` (en `/docs/negocio`) sigue siendo válido en su
  lógica de negocio, pero toda entidad ahí descrita (Proyecto, Contratista,
  Proveedor, Administración, Movimiento Semanal) cuelga de una Empresa como se
  describe en la sección 1 de este documento.
- El módulo de **Usuarios/Login** (el primero a construir) debe incluir desde el
  inicio: entidad Empresa, relación Usuario-Empresa-Rol, y el mecanismo base de
  permisos por módulo/plan — aunque la pantalla de "administrar planes" no se
  construya todavía.
