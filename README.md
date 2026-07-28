# SST · Cumplimiento de requisitos — prototipo

Prototipo del caso técnico de Buk: modelar y calcular el cumplimiento de requisitos
de Seguridad y Salud en el Trabajo por colaborador, para poder responder ante una
fiscalización.

Responde las tres preguntas del enunciado:

1. **¿Qué requisitos cumple cada empleado hoy?** → tablero y detalle por empleado.
2. **¿Qué requisitos no cumple?** → mismo lugar, distinguiendo *no cumple* de
   *evidencia en revisión*.
3. **¿Hubo períodos sin cumplimiento?** → `Incumplimientos`, con el tramo exacto de
   días y el motivo, aunque hoy el empleado esté al día.

## Puesta en marcha

```bash
npm install
cp .env.example .env      # pega la URL y la anon key de tu proyecto Supabase
npm run dev
```

Después, en el **SQL Editor** de Supabase, copiar y ejecutar en este orden:

1. `supabase/migrations/0001_sst_schema.sql` — enums, tablas, índices y grants.
2. `supabase/seed.sql` — 10 empleados, 8 requisitos y 23 evidencias con escenarios
   comentados. Las fechas son relativas a `current_date`, así que la demo no caduca.

Es un paso manual: la publishable key no puede ejecutar DDL. Ambos scripts van en una
transacción, así que o se aplican completos o no se aplican.

> **Si el proyecto Supabase comparte esquema con otra aplicación:** los `grant` están
> enumerados tabla por tabla, no con `on all tables in schema public`, para no abrir
> las tablas ajenas al rol `anon`. Los nombres que crea el módulo son `employees`,
> `requirements`, `requirement_versions`, `employee_requirement_assignments`,
> `requirement_periods`, `evidences`, `evidence_files`,
> `period_evidence_coverages`, `current_compliance` y `compliance_gaps`, más los 8
> enums. Si alguno ya existe, la transacción falla sin dejar nada a medias.

El seed deja las tablas derivadas vacías a propósito. Al abrir la app se ejecuta el
recálculo una vez y el tablero se llena.

```bash
npm run check:engine   # 37 comprobaciones del motor de cumplimiento, sin base de datos
```

## Cómo está modelado

Diagrama en dbdiagram.io: pega el contenido de [`docs/schema.dbml`](docs/schema.dbml).

El modelo separa tres cosas que en el problema se confunden con facilidad:

| Concepto | Tabla | Por qué existe separado |
| --- | --- | --- |
| Qué se exige | `requirements` + `requirement_versions` | La identidad del requisito es estable; la periodicidad cambia. Versionar evita reescribir la historia. |
| A quién se le exige | `employee_requirement_assignments` | No todos los requisitos aplican a todos. Sin una fila acá, no se exige nada. |
| Qué se revisa | `requirement_periods` | Las ventanas que mira el fiscalizador, derivadas de la periodicidad. |
| Qué se acredita | `evidences` | El documento, con **su propia vigencia**, que no tiene por qué coincidir con la periodicidad. |
| El cruce | `period_evidence_coverages` | Qué tramo de qué período cubre qué evidencia. Es la traza auditable del cálculo. |
| Las respuestas | `current_compliance`, `compliance_gaps` | Proyecciones de lectura para responder sin recalcular. |

### La distinción central del enunciado

Periodicidad del requisito ≠ vigencia de la evidencia. Un examen exigido **cada 6
meses** con validez de **12 meses** cubre dos períodos:

```text
Requisito semestral   |---- S1 2026 ----|---- S2 2026 ----|
Evidencia (12 meses)         |===============================>
Resultado              gap   |  cubierto  |    cubierto
                       S1: parcial          S2: cumplido
```

Además, `evidence_effective_policy` decide **desde cuándo** cuenta una evidencia:

- `document_validity` — desde la fecha que declara el documento.
- `submitted_at` — desde que se cargó al sistema. Es el caso *"subió tarde y hubo
  días sin cumplimiento"*: el acta dice regir desde el 1, se cargó el 16, y los 15
  días intermedios quedan como gap.
- `approved_at` — desde que un revisor la aprobó.

## Cómo se calcula

Todo el negocio vive en una función pura, [`src/domain/compliance.ts`](src/domain/compliance.ts),
aislada de la base de datos. Tres pasos:

1. **Generar períodos** — a partir de la periodicidad y el `period_alignment`
   (`assignment_start` cuenta desde que el requisito aplica al empleado;
   `fixed_anchor` alinea a un calendario común, como trimestres civiles). Cada tramo
   se recorta con la ventana de la versión que estaba en vigor, así los períodos
   históricos conservan su regla original. No se generan períodos futuros.
2. **Proyectar cada evidencia** a su intervalo efectivo según la política. Solo las
   `approved` generan cobertura.
3. **Cruzar** — la cobertura de un período es la intersección de ambos; el gap es la
   resta. Un período se juzga solo hasta hoy: el futuro no se puede incumplir.

Todo se reduce a álgebra de intervalos sobre strings `YYYY-MM-DD` en UTC
([`src/lib/intervals.ts`](src/lib/intervals.ts)), lo que elimina la clase de bugs de
zona horaria y hace que `<` ya ordene cronológicamente. Dos evidencias contiguas
(una termina el 31, la otra empieza el 1) se fusionan: si no, cada renovación
generaría un gap falso.

El motor lo ejecuta [`src/data/recalculate.ts`](src/data/recalculate.ts), que
materializa las cuatro tablas derivadas de forma **idempotente** y **acotada a un
scope** (una asignación, un empleado o un requisito).

## Cómo escala

El punto de partida es que **la lectura no calcula nada**. Con 5.000 empleados × 300
requisitos hay ~1,5 M de asignaciones y, con historia, decenas de millones de
períodos. Recalcular al vuelo para pintar un tablero no es viable, así que el estado
se materializa una vez y se lee por índice:

- **Preguntas 1 y 2** → `select status, count(*) from current_compliance where employee_id = $1`.
  Una fila por asignación, índice `(employee_id, status)`. El tablero por requisito
  usa el mismo dato por el otro índice, `(requirement_id, status)`.
- **Pregunta 3** → `compliance_gaps` indexada por `(employee_id, gap_start, gap_end)`.
  Los gaps se escriben una vez y no se recorren períodos para responder.

El costo se traslada a la escritura, que se mantiene chica porque el recálculo es
incremental:

- **Por evento** — subir, aprobar o rechazar una evidencia recalcula **una**
  asignación. Asignar o desasignar un requisito, las de ese empleado. Publicar una
  versión nueva, las de ese requisito.
- **Por día** — solo las asignaciones cuya cobertura vence hoy, que se encuentran con
  el índice `evidences (status, valid_until)` y con `current_compliance.covered_until`.
  No es un barrido de la empresa completa: es la cola de vencimientos del día.
- **Los períodos no se generan hacia el futuro**, así que la tabla crece con el paso
  del tiempo real, no con el horizonte.

Qué cambiaría de acá a producción:

- **El motor se porta a SQL** (función o job en background). Hoy corre en el cliente
  porque es un prototipo; el algoritmo es el mismo y está aislado justamente para
  poder moverlo sin tocar la UI.
- **`company_id` en todas las tablas del módulo**, con RLS. El esquema del enunciado
  no lo incluye y acá se respetó, pero es la primera columna que agregaría: es la
  clave de particionamiento natural y el límite de seguridad.
- **Paginación en el servidor.** La app carga el dataset completo y filtra en
  memoria, lo que sirve para 10 empleados y no para 5.000.
- **Particionar `requirement_periods` y `compliance_gaps` por año**, para que la
  historia antigua no encarezca las consultas del período vigente.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Las tablas derivadas quedan desactualizadas y el tablero miente | Recálculo idempotente + `calculated_at` visible en la UI. Un job de reconciliación nocturno recalcula todo y compara. |
| Cambiar la periodicidad reescribe la historia y "borra" incumplimientos pasados | `requirement_versions`: la versión vigente se cierra y se abre una nueva. Los períodos apuntan a la versión con que se evaluaron. |
| Zonas horarias corren los bordes de período en un día | Todo el cálculo es sobre fechas UTC sin hora. Los `timestamptz` se convierten a día calendario en un único punto. |
| Renovaciones contiguas generan gaps falsos de cero días | Los intervalos contiguos se fusionan explícitamente. Cubierto en `npm run check:engine`. |
| Un empleado finiquitado sigue contando como incumplidor | `current_compliance.status = 'inactive'` cuando el empleado, la asignación o su ventana están cerrados; no entra en los indicadores. |
| Culpar al encargado SST por evidencia que el revisor no aprobó | Estado `pending` separado de `non_compliant`, con su propio contador. |
| Borrar una evidencia oculta un incumplimiento | Deberían anularse, no borrarse (`superseded` ya existe en el enum). El prototipo permite borrar para facilitar la demo. |
| El recálculo masivo bloquea la base | Acotado por scope e insertado por lotes. En producción va en background, con la cola de vencimientos del día como unidad de trabajo. |

## Qué está simulado

Es un prototipo; estas partes están deliberadamente resueltas de la forma más simple:

- **No hay login ni autorización.** Se asume un único super admin que puede todo. Las
  escrituras se atribuyen a un `user_id` fijo.
- **La subida de archivos es falsa.** Se pide un nombre y se registra la metadata en
  `evidence_files` con una `storage_key` ficticia; no se sube nada a Storage. El
  contrato es el mismo que tendría la versión real.
- **No hay cron.** El recálculo es un botón (`Recalcular todo`) y se dispara además
  después de cada escritura. El scope acotado es real; lo que falta es el disparador.
- **RLS está deshabilitado** y el rol `anon` tiene acceso completo, para que la app
  funcione sin sesión.
- **`employees` se crea acá** solo para que el prototipo sea ejecutable; representa la
  tabla de Empleados que ya existe en el monolito. `empresas` se omitió porque el
  esquema del enunciado no incluye `company_id`.
- **El motor corre en el navegador**, no en el servidor.

## Estructura

```text
src/
  domain/compliance.ts    ← motor: períodos, cobertura, estados y gaps (función pura)
  lib/intervals.ts        ← álgebra de intervalos de fechas
  lib/dates.ts            ← aritmética de fechas en UTC
  data/recalculate.ts     ← materializa las tablas derivadas (el "cron")
  data/repo.ts            ← queries a Supabase
  data/selectors.ts       ← vistas para la UI, con la query real anotada en cada una
  pages/                  ← tablero, detalle de empleado, requisitos, evidencias, gaps
scripts/engine-check.ts   ← 37 comprobaciones del motor
supabase/                 ← migración y seed
docs/schema.dbml          ← para dbdiagram.io
```
