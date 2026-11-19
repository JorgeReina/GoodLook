# GoodLook: aislamiento, integración y datos de muestra — plan de implementación

> **Para los agentes:** usar `superpowers:subagent-driven-development` o `superpowers:executing-plans` según corresponda. Los pasos con casillas registran el avance y cada tarea requiere revisión antes de integrarse.

**Objetivo:** permitir que el equipo trabaje en ramas aisladas y ejecute el piloto con datos ficticios reproducibles en Docker, sin modificar MonsterASP ni el servicio antiguo.

**Arquitectura:** un agente integrador y una skill describen el protocolo de integración; un lanzador local crea su propio proyecto Compose y valida el contenedor antes de migrar y cargar una semilla idempotente. Las tareas se desarrollan en worktrees separados y el coordinador integra los commits uno a uno.

**Tecnologías:** Git y worktrees, Node 24, Angular 22, Express, Docker Compose, MySQL 8.4 y MariaDB 10.11.

**Diseño:** `docs/superpowers/specs/2026-11-17-continuacion-migracion-design.md`.

## Restricciones globales

- Rama de integración: `work/goodlook-migracion`; no integrar directamente en ramas principales. Cada agente recibe una rama `codex/` y ownership explícito.
- Preparar worktrees con la herramienta nativa `create_worktree`, reutilizando los adecuados; no sobrescribir cambios existentes ni borrar recursos ajenos.
- No usar ni alterar MonsterASP, el despliegue antiguo ni credenciales reales en pruebas locales. No hacer despliegues o migraciones remotas como parte de este tramo.
- MySQL y MariaDB usan proyectos Compose aleatorios, loopback `127.0.0.1:33317` y `tmpfs`; si el puerto está ocupado, fallar sin adoptar ni parar ningún contenedor.
- No modificar las migraciones históricas; la semilla solo actúa sobre el esquema migrado del proyecto local creado para ella.
- Comprobar resultados, registrar limitaciones, hacer commits pequeños y permitir push de ramas de implementación. La integración en una rama principal se hace mediante PR.

## Riesgos que las pruebas deben cubrir

1. Un destino remoto o contenedor ajeno se hace pasar por demo: rechazarlo antes de escribir (tarea 2).
2. Una fila con UUID reservado tiene contenido distinto o relaciones ajenas: fallar sin alterar datos (tarea 3).
3. La segunda carga duplica relaciones o cambia datos posteriores: comprobar idempotencia y preservación (tarea 3).
4. Dos ramas modifican el mismo contrato o migración: preservar intenciones o detener la integración sin elegir una versión por defecto (tarea 1).
5. Una prueba concurrente o una interrupción dejan contenedores ajenos afectados: verificar identidad y limitar limpieza al proyecto propio (tareas 2 y 4).

## Mapa de bloques y dependencias

| Bloque | Subbloques | Dependencia / salida |
| --- | --- | --- |
| 1. Aislamiento y muestras | Agente integrador; lanzador local; semilla; recorrido local; actualización documental | Este plan. Tareas 1 y 2 son paralelas; 3 depende de 2; 4 depende de 2–3; 5 integra. |
| 2. Reservas | Contrato y orden de bloqueos; pruebas reales de cambios de configuración; idempotencia y cambios de estado | Plan propio tras el bloque 1; archivos de servicio de reservas y catálogo tienen un único propietario. |
| 3. Seguridad y operación | Autorización y roles; IP y límites tras Vercel; limpieza; copias y restauración | Plan propio; pruebas locales y decisiones de infraestructura explícitas. |
| 4. Experiencia y administración | Gestión de negocio, servicios, profesionales y horarios; agenda; invitaciones; accesibilidad | Depende de contratos de API estables; integración secuencial del bootstrap y componentes compartidos. |
| 5. Calidad y entrega | Pruebas heredadas; CI; cobertura E2E; revisión de releases y actualización de PR | Avance paralelo solo con propiedad de archivos clara; la salida no implica promoción automática. |

## Tarea 1: Skill y agente de integración de ramas

**Rama / ownership:** `codex/goodlook-integracion`; crear `.agents/skills/goodlook-integracion/SKILL.md` y `.codex/agents/integrator.toml`; no modificar código de producto ni documentación de estado.

**Interfaz:** el agente lee la skill y recibe del coordinador rama de origen, rama de destino, base y pruebas requeridas. Devuelve commits integrados, conflictos, decisión por conflicto, resultados y bloqueos.

- [ ] Leer `superpowers:writing-skills`, `superpowers:test-driven-development` y la guía de creación de skills; realizar una prueba base con un agente en repositorios sintéticos antes de escribir la skill.
- [ ] En repositorios temporales, probar conflictos textuales compatibles, conflictos semánticos y árbol sucio; registrar si el agente base conserva ambas intenciones y se detiene cuando no puede decidir.
- [ ] Escribir la skill y el agente TOML con comprobaciones de `git status`, merge-base y diffs; integración de una rama por vez; revisión de las tres etapas de conflicto; prohibición de `reset --hard`, `ours`/`theirs` masivos y reescritura de migraciones aplicadas. El agente se detiene ante riesgo de datos, ambigüedad funcional o pruebas fallidas.
- [ ] Repetir los tres escenarios con la skill: conservar cambios compatibles, detenerse en ambigüedad y rechazar árbol sucio. Validar frontmatter con `quick_validate.py`, TOML con `python -c "import tomllib; tomllib.load(open('.codex/agents/integrator.toml','rb'))"` y `git diff --check`.
- [ ] Commit de la tarea y entregar rama y evidencia al coordinador.

## Tarea 2: Lanzador y guardas de demo local

**Rama / ownership:** `codex/goodlook-demo-runtime`; crear `backend-node/scripts/demo-local.ps1`, `backend-node/db/demo-guard.mjs` y pruebas propias en `backend-node/db/tests/demo-guard.test.mjs`. No editar `mysql.test.ts` ni la skill.

**Interfaces:** `validateDemoTarget({containerId, hostname, database, host, port})` acepta solo un ID de 64 caracteres hex, su prefijo de 12 como hostname, `goodlook_disposable_test`, host `127.0.0.1` y puerto `33317`; el wrapper obtiene el ID por Compose y confirma mediante `docker inspect` etiquetas del proyecto, imagen, loopback y tmpfs. La conexión usa host y puerto fijos; no admite `DATABASE_URL` arbitraria.

- [ ] Escribir pruebas negativas para ID inválido, hostname, base, host o puerto distintos, y una positiva para el destino propio; ejecutar `node --test db/tests/demo-guard.test.mjs` desde `backend-node` y confirmar fallo antes de implementar.
- [ ] Implementar la guarda y el wrapper PowerShell con `-Dialect mysql|mariadb` y `-Mode test|interactive`; `test` termina y `interactive` mantiene los recursos hasta Ctrl+C. En `finally` retirar solo el proyecto Compose generado. Rechazar puerto ocupado y fallos de identidad antes de migrar o escribir.
- [ ] Ejecutar la suite de guardas y comprobar que se rechazan destinos remotos o no identificados. Inspeccionar los contenedores existentes antes de ejecutar los modos reales de la tarea 4.
- [ ] Commit y entregar rama y resultados; coordinar con tarea 3 la firma definitiva antes de integrarla.

## Tarea 3: Semilla sintética idempotente

**Rama / ownership:** `codex/goodlook-demo-seed`, iniciada desde el resultado integrado de tarea 2. Crear `backend-node/db/demo-seed.mjs`, `backend-node/db/tests/demo-seed.test.mjs` y `backend-node/test/integration/demo-seed.test.ts`; no editar archivos de la tarea 1.

**Interfaz:** `seedDemo(connection, expectedContainerId)` usa la guarda de tarea 2 en la misma conexión y exige historial de migraciones completo y aplicado. Inserta en una transacción un negocio «DEMO LOCAL», dos profesionales activos, dos servicios, asociaciones y horarios semanales con UUID reservados; no crea cuentas ni contraseñas predeterminadas.

- [ ] Añadir pruebas que rechacen historial incompleto y colisiones de UUID antes de escribir, y que verifiquen rollback ante fallo; ejecutar y confirmar fallo inicial.
- [ ] Implementar consultas parametrizadas y comparaciones exactas de las columnas y filas propiedad de la semilla. Si todas faltan, insertar; si coinciden, no-op; si un ID reservado difiere o el conjunto es parcial, abortar sin alterar filas. No usar `ON DUPLICATE KEY UPDATE` ni borrado por nombre.
- [ ] Añadir prueba de integración que cargue dos veces sin duplicados, preserve una fila centinela ajena y una cita creada posteriormente para el negocio de muestra, rechace una colisión y verifique catálogo y disponibilidad; ejecutar en MySQL y MariaDB locales mediante el wrapper de tarea 2.
- [ ] Commit y entregar rama, pruebas y resultados; no cargar MonsterASP.

## Tarea 4: Recorrido local completo

**Rama / ownership:** `codex/goodlook-demo-e2e`, tras integrar tareas 2–3. Crear pruebas propias bajo `backend-node/test/integration/` y documentación de uso en `FrontEndGoodLook/PILOTO.md`; coordinar cualquier cambio al lanzador con el integrador.

- [ ] Verificar Docker, puerto libre y contenedores preexistentes; arrancar únicamente el proyecto demo propio y confirmar ID, tmpfs y destino antes de ejecutar migraciones.
- [ ] Registrar una cuenta sintética nueva, seleccionar negocio/servicio/profesional, consultar huecos, reservar y listar la cita mediante el piloto en navegador local; repetir la consulta para comprobar persistencia durante la demo.
- [ ] Repetir semilla y pruebas de integridad en ambos motores; comprobar que Ctrl+C o modo test eliminan exclusivamente el proyecto creado. Comunicar cualquier prueba de navegador no ejecutada.
- [ ] Documentar comandos de arranque y parada, credenciales ficticias, alcance local y resultados; `git diff --check` y commit.

## Tarea 5: Integración y seguimiento

**Ownership:** coordinador/integrador; actualizar `docs/migracion/ESTADO.md` solo después de integrar y verificar; ningún otro agente edita ese archivo en esta tanda.

- [ ] Revisar ramas y diffs; integrar primero tareas 1 y 2, después 3 y 4, una a una, usando la skill creada. Resolver conflictos preservando contratos, sin operaciones destructivas.
- [ ] Ejecutar las pruebas del backend y migrador, las suites de integración MySQL/MariaDB y las pruebas de piloto afectadas; registrar conteos, fallos y pruebas no ejecutadas.
- [ ] Actualizar estado vigente y plan del siguiente bloque; señalar la deuda documental histórica sin borrar su contexto. Hacer commit y push de la rama de implementación si el estado lo permite.
- [ ] Mantener los planes detallados de bloques 2–5 separados, con interfaces y criterios verificados cuando corresponda; no tratarlos como completados por figurar en la tabla.

## Resultado del bloque inicial (19-11-2026)

Las cinco tareas se han ejecutado e integrado en la rama de migración. La skill del integrador se verificó con repositorios sintéticos. Las guardas y la semilla pasaron en MySQL 8.4 y MariaDB 10.11. Se comprobó el recorrido en Chrome Headless y la limpieza en una consola Windows. La automatización de navegador fue temporal.

El diseño del lanzador cambió durante la revisión. PowerShell delega en un proceso Node que crea recursos mediante Docker Engine, conserva sus IDs y concede acceso a la migración y a la semilla dentro del propio proceso. Compose aporta la configuración. La limpieza usa únicamente los IDs devueltos por Docker. En modo interactivo se puede cerrar con Enter y se verificó también Ctrl+C en una consola PTY. Las instrucciones están en FrontEndGoodLook/PILOTO.md.

El protocolo de reservas y los demás bloques conservan sus dependencias y requieren sus propios planes. Los commits de esta tanda se conservan localmente, ya que el push de la rama de migración desencadena una compilación en Vercel.
