-- ============================================================================
-- Seed de demostración. Ejecutar DESPUÉS de 0001_sst_schema.sql.
-- Todas las fechas son relativas a current_date para que la demo no caduque.
--
-- Las tablas derivadas (requirement_periods, period_evidence_coverages,
-- current_compliance, compliance_gaps) se dejan VACÍAS a propósito: las llena
-- el recalculador desde la app (botón "Recalcular"), que es lo que en
-- producción correría como job en background.
-- ============================================================================

begin;

truncate table compliance_gaps, current_compliance, period_evidence_coverages,
               evidence_files, evidences, requirement_periods,
               employee_requirement_assignments, requirement_versions,
               requirements, employees
  restart identity cascade;

-- ---------------------------------------------------------------------------
-- Empleados (tabla preexistente del monolito)
-- ---------------------------------------------------------------------------
insert into employees (id, full_name, national_id, job_title, status) values
  (1,  'Juan Pérez Soto',        '12.345.678-9', 'Chofer',             'active'),
  (2,  'María González Rivas',   '13.456.789-0', 'Operaria',           'active'),
  (3,  'Carlos Rojas Díaz',      '14.567.890-1', 'Bodeguero',          'active'),
  (4,  'Ana Silva Contreras',    '15.678.901-2', 'Soldadora',          'active'),
  (5,  'Pedro Muñoz Lagos',      '16.789.012-3', 'Chofer',             'active'),
  (6,  'Luisa Fernández Ortiz',  '17.890.123-4', 'Enfermera',          'active'),
  (7,  'Diego Torres Bravo',     '18.901.234-5', 'Electricista',       'active'),
  (8,  'Camila Vargas Núñez',    '19.012.345-6', 'Operaria',           'inactive'),
  (9,  'Jorge Castro Aravena',   '10.123.456-7', 'Supervisor de obra', 'active'),
  (10, 'Valentina Reyes Pinto',  '11.234.567-8', 'Operaria',           'active');

-- ---------------------------------------------------------------------------
-- Requisitos
-- ---------------------------------------------------------------------------
insert into requirements (id, code, is_active) values
  (1, 'LIC-COND',     true),
  (2, 'EXA-VIS',      true),
  (3, 'CERT-MED-INI', true),
  (4, 'EXA-MED-OCU',  true),
  (5, 'CAP-ALTURA',   true),
  (6, 'EPP-ENTREGA',  true),
  (7, 'CHARLA-IND',   true),
  (8, 'EXA-PSICO',    true);

insert into requirement_versions
  (id, requirement_id, version_number, name, description,
   recurrence_unit, recurrence_interval, period_alignment, anchor_date,
   evidence_effective_policy, effective_from, effective_until)
values
  -- Anual contado desde que el requisito aplica al empleado.
  (1, 1, 1, 'Licencia de conducir vigente',
   'Copia de licencia municipal clase A. Se exige renovación anual.',
   'year', 1, 'assignment_start', null, 'document_validity', date '2015-01-01', null),

  -- Trimestral alineado a calendario: el fiscalizador revisa por trimestre
  -- civil, no según la fecha de contratación de cada empleado.
  (2, 2, 1, 'Examen visual',
   'Control de agudeza visual para operarios de maquinaria.',
   'month', 3, 'fixed_anchor', date '2015-01-01', 'document_validity', date '2015-01-01', null),

  -- De una sola vez: no se renueva nunca.
  (3, 3, 1, 'Certificado médico inicial',
   'Certificado de aptitud emitido al ingreso. No requiere renovación.',
   'once', 1, 'assignment_start', null, 'document_validity', date '2015-01-01', null),

  -- Requisito versionado: era anual y la empresa lo pasó a semestral este año.
  -- Los períodos históricos conservan la periodicidad que estaba en vigor.
  (4, 4, 1, 'Examen médico ocupacional (anual)',
   'Versión histórica: se exigía una vez al año.',
   'year', 1, 'fixed_anchor', date '2015-01-01', 'document_validity',
   date '2015-01-01', date_trunc('year', current_date)::date - 1),
  (5, 4, 2, 'Examen médico ocupacional (semestral)',
   'Versión vigente: se exige cada 6 meses aunque el examen tenga validez de 12 meses. '
   'Es el caso del enunciado: una sola evidencia cubre dos períodos.',
   'month', 6, 'fixed_anchor', date '2015-01-01', 'document_validity',
   date_trunc('year', current_date)::date, null),

  -- La evidencia solo cuenta desde que fue APROBADA, no desde la fecha del
  -- documento: una capacitación no acredita nada mientras está en revisión.
  (6, 5, 1, 'Capacitación trabajo en altura',
   'Curso con certificado de organismo administrador. Acredita desde su aprobación.',
   'year', 1, 'fixed_anchor', date '2015-01-01', 'approved_at', date '2015-01-01', null),

  -- La evidencia cuenta desde que se SUBIÓ: si el encargado carga el acta de
  -- entrega con retraso, esos días quedan como incumplimiento.
  (7, 6, 1, 'Entrega de EPP',
   'Acta mensual de entrega de elementos de protección personal.',
   'month', 1, 'assignment_start', null, 'submitted_at', date '2015-01-01', null),

  (8, 7, 1, 'Charla de inducción de seguridad',
   'Registro de asistencia a la charla de inducción (art. 21 DS 40).',
   'once', 1, 'assignment_start', null, 'document_validity', date '2015-01-01', null),

  (9, 8, 1, 'Examen psicosensotécnico',
   'Exigido a conductores cada 6 meses desde su ingreso.',
   'month', 6, 'assignment_start', null, 'document_validity', date '2015-01-01', null);

-- ---------------------------------------------------------------------------
-- Asignaciones. Cada bloque comenta el escenario que ilustra.
-- ---------------------------------------------------------------------------
insert into employee_requirement_assignments
  (id, employee_id, requirement_id, applies_from, applies_until, status, assignment_source)
values
  -- Juan (chofer): licencia con 3+ años de historia, incluido un año que se
  -- renovó tarde.
  (1,  1, 1, current_date - 1280, null, 'active',   'cargo:Chofer'),
  (2,  1, 3, current_date - 1280, null, 'active',   'ingreso'),
  (3,  1, 8, current_date - 400,  null, 'active',   'cargo:Chofer'),
  -- María (operaria): examen visual trimestral + EPP mensual.
  (4,  2, 2, current_date - 400,  null, 'active',   'cargo:Operaria'),
  (5,  2, 6, current_date - 400,  null, 'active',   'cargo:Operaria'),
  -- Carlos (bodeguero): al día en todo lo que le aplica.
  (6,  3, 3, current_date - 700,  null, 'active',   'ingreso'),
  (7,  3, 7, current_date - 700,  null, 'active',   'ingreso'),
  -- Ana (soldadora): requisito versionado (anual → semestral) y capacitación
  -- que solo acredita desde su aprobación.
  (8,  4, 4, current_date - 800,  null, 'active',   'cargo:Soldadora'),
  (9,  4, 5, date_trunc('year', current_date)::date, null, 'active', 'cargo:Soldadora'),
  -- Pedro (chofer): nunca subió la licencia. Incumplimiento total.
  (10, 5, 1, current_date - 120,  null, 'active',   'cargo:Chofer'),
  (11, 5, 7, current_date - 120,  null, 'active',   'ingreso'),
  -- Luisa (enfermera): su evidencia fue rechazada, quedó descubierta.
  (12, 6, 4, date_trunc('year', current_date)::date, null, 'active', 'cargo:Enfermera'),
  -- Diego (electricista): capacitación de altura con cobertura continua.
  (13, 7, 5, current_date - 500,  null, 'active',   'cargo:Electricista'),
  (14, 7, 6, current_date - 40,   null, 'active',   'cargo:Electricista'),
  -- Camila: empleada inactiva (finiquitada). La asignación quedó cerrada.
  (15, 8, 2, current_date - 200,  current_date - 30, 'inactive', 'cargo:Operaria'),
  -- Jorge (supervisor): inducción hecha; examen visual recién asignado, aún
  -- sin evidencia → ya acumula días de incumplimiento.
  (16, 9, 7, current_date - 900,  null, 'active',   'ingreso'),
  (17, 9, 2, current_date - 10,   null, 'active',   'cargo:Supervisor de obra'),
  -- Valentina: ingresó hace 5 días, nada cargado aún.
  (18, 10, 7, current_date - 5,   null, 'active',   'ingreso'),
  (19, 10, 6, current_date - 5,   null, 'active',   'cargo:Operaria');

-- ---------------------------------------------------------------------------
-- Evidencias. Las ventanas se solapan levemente con los bordes de período
-- porque en la vida real se renueva antes de vencer.
-- ---------------------------------------------------------------------------
insert into evidences
  (id, assignment_id, requirement_version_id, status, valid_from, valid_until,
   submitted_at, approved_at, rejected_at, rejection_reason,
   uploaded_by_user_id, reviewed_by_user_id)
values
  -- Juan / licencia: primer año cubierto…
  (1, 1, 1, 'approved', current_date - 1280, current_date - 910,
   (current_date - 1278)::timestamptz, (current_date - 1275)::timestamptz, null, null, 99, 99),
  -- …la renovación del segundo año se cargó con retraso → días sin cumplimiento.
  (2, 1, 1, 'approved', current_date - 875, current_date - 505,
   (current_date - 873)::timestamptz, (current_date - 870)::timestamptz, null, null, 99, 99),
  -- …y desde ahí la cobertura es continua hasta hoy.
  (3, 1, 1, 'approved', current_date - 510, current_date - 140,
   (current_date - 508)::timestamptz, (current_date - 505)::timestamptz, null, null, 99, 99),
  (4, 1, 1, 'approved', current_date - 145, current_date + 220,
   (current_date - 143)::timestamptz, (current_date - 140)::timestamptz, null, null, 99, 99),

  -- Juan / certificado médico inicial: requisito "once", cubierto para siempre.
  (5, 2, 3, 'approved', current_date - 1280, null,
   (current_date - 1279)::timestamptz, (current_date - 1277)::timestamptz, null, null, 99, 99),

  -- Juan / psicosensotécnico semestral: el último venció hace 20 días y no hay
  -- reemplazo → incumple hoy.
  (6, 3, 9, 'approved', current_date - 400, current_date - 20,
   (current_date - 398)::timestamptz, (current_date - 395)::timestamptz, null, null, 99, 99),

  -- María / examen visual trimestral con validez de 6 meses: cada evidencia
  -- cubre dos trimestres, pero la última dejó de estar vigente hace 25 días.
  (7, 4, 2, 'approved', current_date - 400, current_date - 215,
   (current_date - 398)::timestamptz, (current_date - 395)::timestamptz, null, null, 99, 99),
  (8, 4, 2, 'approved', current_date - 220, current_date - 25,
   (current_date - 218)::timestamptz, (current_date - 215)::timestamptz, null, null, 99, 99),
  -- …y el reemplazo está cargado pero pendiente de revisión: no cubre nada
  -- todavía, aunque la app lo muestra como "en revisión".
  (9, 4, 2, 'pending', current_date - 24, current_date + 156,
   (current_date - 3)::timestamptz, null, null, null, 99, null),

  -- María / EPP mensual con política submitted_at: el acta del mes anterior se
  -- subió 15 días después de que empezó a regir → esos días no acreditan.
  (10, 5, 7, 'approved', current_date - 70, current_date - 41,
   (current_date - 55)::timestamptz, (current_date - 54)::timestamptz, null, null, 99, 99),
  (11, 5, 7, 'approved', current_date - 40, current_date + 30,
   (current_date - 12)::timestamptz, (current_date - 11)::timestamptz, null, null, 99, 99),

  -- Carlos: ambos requisitos "once", cumplidos al ingreso.
  (12, 6, 3, 'approved', current_date - 700, null,
   (current_date - 699)::timestamptz, (current_date - 698)::timestamptz, null, null, 99, 99),
  (13, 7, 8, 'approved', current_date - 700, null,
   (current_date - 699)::timestamptz, (current_date - 698)::timestamptz, null, null, 99, 99),

  -- Ana / examen médico ocupacional: EL CASO DEL ENUNCIADO. El examen se tomó
  -- hace 100 días con validez de 12 meses, sobre un requisito que ahora es
  -- semestral → una sola evidencia cubre el semestre actual y parte del anterior.
  (14, 8, 4, 'approved', current_date - 500, current_date - 135,
   (current_date - 498)::timestamptz, (current_date - 495)::timestamptz, null, null, 99, 99),
  (15, 8, 5, 'approved', current_date - 100, current_date + 265,
   (current_date - 98)::timestamptz, (current_date - 95)::timestamptz, null, null, 99, 99),

  -- Ana / capacitación de altura (política approved_at): el certificado dice
  -- ser válido desde el 1 de enero, pero se aprobó hace 10 días. Todo lo
  -- anterior a la aprobación NO acredita cumplimiento.
  (16, 9, 6, 'approved', date_trunc('year', current_date)::date, current_date + 305,
   (current_date - 14)::timestamptz, (current_date - 10)::timestamptz, null, null, 99, 99),

  -- Pedro: sin evidencia de licencia. Solo la inducción.
  (17, 11, 8, 'approved', current_date - 118, null,
   (current_date - 117)::timestamptz, (current_date - 116)::timestamptz, null, null, 99, 99),

  -- Luisa: subió el examen pero fue rechazado por ilegible → no cubre nada.
  (18, 12, 5, 'rejected', current_date - 60, current_date + 305,
   (current_date - 40)::timestamptz, null, (current_date - 35)::timestamptz,
   'Documento ilegible, falta firma del médico', 99, 99),

  -- Diego: dos capacitaciones consecutivas → cobertura continua, cumple hoy.
  (19, 13, 6, 'approved', current_date - 500, current_date - 20,
   (current_date - 498)::timestamptz, (current_date - 495)::timestamptz, null, null, 99, 99),
  (20, 13, 6, 'approved', current_date - 25, current_date + 340,
   (current_date - 30)::timestamptz, (current_date - 28)::timestamptz, null, null, 99, 99),
  -- Diego / EPP: acta del mes al día.
  (21, 14, 7, 'approved', current_date - 40, current_date + 45,
   (current_date - 40)::timestamptz, (current_date - 39)::timestamptz, null, null, 99, 99),

  -- Camila (inactiva): tenía su examen visual vigente al momento del finiquito.
  (22, 15, 2, 'approved', current_date - 200, current_date - 20,
   (current_date - 198)::timestamptz, (current_date - 195)::timestamptz, null, null, 99, 99),

  -- Jorge: inducción cumplida. El examen visual recién asignado no tiene nada.
  (23, 16, 8, 'approved', current_date - 899, null,
   (current_date - 898)::timestamptz, (current_date - 897)::timestamptz, null, null, 99, 99);

-- Archivos simulados: en el prototipo no se sube nada a Storage, solo se
-- registra la metadata con una storage_key ficticia.
insert into evidence_files (evidence_id, storage_key, original_filename, content_type, size_bytes)
select
  e.id,
  'sst/demo/evidence-' || e.id || '.pdf',
  'evidencia-' || e.id || '.pdf',
  'application/pdf',
  120000 + e.id * 137
from evidences e;

select setval(pg_get_serial_sequence('employees', 'id'), (select max(id) from employees));
select setval(pg_get_serial_sequence('requirements', 'id'), (select max(id) from requirements));
select setval(pg_get_serial_sequence('requirement_versions', 'id'), (select max(id) from requirement_versions));
select setval(pg_get_serial_sequence('employee_requirement_assignments', 'id'), (select max(id) from employee_requirement_assignments));
select setval(pg_get_serial_sequence('evidences', 'id'), (select max(id) from evidences));

commit;
