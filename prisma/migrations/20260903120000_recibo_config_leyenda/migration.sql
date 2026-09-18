-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "reciboMostrarLeyenda" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reciboTituloLeyenda" TEXT NOT NULL DEFAULT 'DECLARACIONES Y ACEPTACIÓN DE LA ESTIMACIÓN';

-- Backfill: precarga el texto legal ya definido para Grupo Conkuali, y
-- únicamente para esa Empresa (id = 'conkuali', su llave primaria real —
-- mismo identificador ya usado en el backfill de privadoHabilitado de la
-- migración 20260901090000_master_empresa_modulos, en vez de un match por
-- nombre/razón social, que sería frágil ante un rename futuro). Empresas
-- nuevas o distintas conservan reciboLeyenda = NULL (sin leyenda
-- configurada) y los defaults de columna (reciboMostrarLeyenda = true,
-- reciboTituloLeyenda = 'DECLARACIONES Y ACEPTACIÓN DE LA ESTIMACIÓN') —
-- este UPDATE nunca se usa como default global.
UPDATE "empresas"
SET "reciboLeyenda" = 'I. EL CONTRATISTA reconoce que los trabajos descritos en la presente estimación corresponden a trabajos efectivamente ejecutados durante el periodo señalado y que las cantidades, avances e importes aquí indicados han sido revisados para efectos de su estimación y pago.

II. LAS PARTES reconocen que la relación existente es de carácter civil por prestación de servicios y/o ejecución de obra determinada, bajo el esquema y condiciones establecidas para los trabajos contratados. EL CONTRATISTA ejecuta dichos trabajos de manera independiente y con sus propios medios y personal, salvo aquellos recursos que expresamente sean proporcionados por EL CONTRATANTE.

III. El importe señalado como "Total de esta estimación" corresponde exclusivamente a los trabajos reconocidos en el periodo indicado. Su pago no constituye finiquito ni liquidación total del contrato, ni libera obligaciones pendientes de EL CONTRATISTA respecto de trabajos no concluidos, correcciones, garantías o responsabilidades derivadas de los trabajos ejecutados. Cuando corresponda a la estimación final, dicha condición deberá señalarse expresamente.

IV. EL CONTRATISTA manifiesta su conformidad con las cantidades e importes reconocidos en esta estimación. Cualquier trabajo adicional, extraordinario o modificación al alcance contractual deberá contar con la autorización correspondiente para ser considerado en estimaciones posteriores.

V. La relación entre EL CONTRATANTE y EL CONTRATISTA no constituye por sí misma una relación laboral entre EL CONTRATANTE y el personal que EL CONTRATISTA utilice para la ejecución de sus trabajos. EL CONTRATISTA será responsable de la dirección y administración de dicho personal y del cumplimiento de las obligaciones que legalmente le correspondan.

VI. Cuando EL CONTRATANTE facilite la incorporación ante el IMSS del personal asignado por EL CONTRATISTA a la obra, EL CONTRATISTA deberá proporcionar oportunamente y por escrito la información y documentación necesaria para realizar dicho registro. Las responsabilidades específicas de cada parte en materia de seguridad social, riesgos de trabajo y seguridad en obra se sujetarán a lo pactado contractualmente y a la legislación aplicable.

Con la firma del presente documento, EL CONTRATISTA y EL SUPERVISOR manifiestan su conformidad con los trabajos, cantidades e importes correspondientes a esta estimación, sin perjuicio de las obligaciones contractuales que continúen vigentes.',
    "reciboMostrarLeyenda" = true,
    "reciboTituloLeyenda" = 'DECLARACIONES Y ACEPTACIÓN DE LA ESTIMACIÓN'
WHERE "id" = 'conkuali';
