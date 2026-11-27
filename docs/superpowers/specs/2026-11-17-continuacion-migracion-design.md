# Continuación de la migración de GoodLook

## Propósito y estado

Retomar la migración desde `work/goodlook-migracion` y convertir el piloto en una base verificable para la aplicación completa. El piloto Angular y la API Express ya están en Vercel; MonsterASP alberga el esquema MariaDB nuevo. Se comprobó un recorrido de reserva y una carrera concreta, pero no todos los roles ni los cambios concurrentes de configuración. El frontend heredado no forma parte del piloto publicado. Los apartados cronológicos de `docs/migracion/ESTADO.md` describen el estado de cada fecha y no equivalen todos al estado actual.

## Objetivos y límites

- Organizar las tareas en bloques, subbloques y entregables verificables, partiendo de los documentos existentes y del código real.
- Ejecutar desarrollo, fixtures y pruebas de integración con bases MySQL y MariaDB desechables en Docker, con datos ficticios. La instancia MonsterASP se reserva para releases relevantes o cambios explícitamente destinados a producción; no usarla para las pruebas corrientes ni como destino desechable.
- Mantener la aplicación y la base antiguas intactas. No introducir datos personales, credenciales o cadenas de conexión reales en fixtures, registros o Git.
- No considerar listo para clientes un cambio por el mero hecho de compilar o desplegar; exigir las pruebas y controles de su bloque. La elección de un servicio definitivo de producción y la compra de dominios quedan fuera de este diseño.
- Preview y producción comparten actualmente una base: la protección de preview no proporciona aislamiento de datos. Evitar ejecutar pruebas que escriban desde preview mientras compartan destino; cualquier separación o cambio remoto se identifica y revisa antes de aplicarse.

## Alternativas y decisión

Se consideraron una segunda base remota específica para preview y una base local por ejecución con Docker. El usuario prioriza Docker para probar implementaciones y mantener MonsterASP para releases o cambios de producción: evita instancias externas adicionales. Una segunda base remota puede evaluarse después si es necesaria para validar un release, sin asumir su creación ni su coste.

## Bloques y dependencias

1. **Base de trabajo y aislamiento:** inventariar documentos y verificar su vigencia; asegurar que pruebas locales identifican su contenedor y base antes de escribir; documentar la frontera entre preview compartido y producción. Docker debe utilizar recursos propios, puerto local y limpieza limitada a lo creado para la ejecución.
2. **Datos de muestra:** crear una carga repetible para negocio, servicios, profesionales, asociaciones y horarios sintéticos. Solo debe ejecutarse en una base local aislada verificada; repetirla no duplica ni modifica datos ajenos. Verificar catálogo, disponibilidad, reserva y consulta, y documentar limpieza acotada. Su ejecución en MonsterASP requiere una decisión de release concreta, no queda autorizada por este diseño.
3. **Reservas y concurrencia:** definir y comprobar un protocolo coherente de bloqueos y orden de adquisición para reservas y cambios que alteran disponibilidad; cubrir con transacciones reales en MySQL y MariaDB, incluidos rollback y conflictos. Tratar idempotencia y operaciones de modificación de citas como subbloques con contratos y pruebas propios.
4. **Identidad, seguridad y operación:** verificar aislamiento por negocio y roles, invitaciones y límites de autenticación/disponibilidad detrás de Vercel; definir controles frente a abuso, mantenimiento de contadores y una estrategia de copias y restauración comprobada antes de datos reales.
5. **Experiencia y administración:** evolucionar el piloto por entregables hacia administración de negocio, servicios, profesionales y horarios, agenda y flujos de roles; cubrir accesibilidad y móvil. No conectar pantallas heredadas al backend antiguo como atajo ni afirmar que el piloto cubre funcionalidades no implementadas.
6. **Calidad, integración y entrega:** reparar o caracterizar las pruebas heredadas, ampliar integración y navegador, incorporar comprobaciones automatizadas y actualizar la documentación y el PR con evidencia vigente. Una release mayor debe identificar commit, destino, secretos, migraciones, datos, validación y recuperación antes del cambio.

Las pruebas locales del bloque 1 preceden a la carga de muestra. Los bloques 3 y 4 pueden avanzar en paralelo cuando sus contratos estén definidos; el bloque 5 depende de contratos de API estables. Las tareas que modifiquen los mismos archivos o contratos se secuencian o se dividen por propiedad explícita. El backlog GL-001–GL-024 no aparece definido íntegramente en los documentos locales: no inventar su contenido ni declarar completas tareas sin evidencia.

## Ramas, agentes e integración

- Trabajar desde un commit base identificado de `work/goodlook-migracion`; usar una rama de implementación y un worktree por tarea independiente. Reutilizar worktrees apropiados si existen y usar las herramientas nativas de worktrees cuando estén disponibles.
- Cada encargo define archivos propios, interfaces, pruebas, límites y rama. Los agentes no revierten trabajo ajeno ni cambian ramas principales. Los archivos compartidos (`PilotComponent`, bootstrap, configuración de despliegue, documentación de estado y archivos de dependencias) tienen un único propietario por tanda.
- Crear una skill reutilizable de integración y resolución de conflictos en `.agents/skills/goodlook-integracion/SKILL.md` y un agente integrador en `.codex/agents/` que la referencie. Su procedimiento: comprobar estado limpio y base común; examinar ambos diffs y los contratos; integrar una rama cada vez; resolver cada conflicto preservando las intenciones compatibles; ejecutar pruebas del bloque y del conjunto; documentar resolución y riesgos. No usar `reset --hard`, restauraciones masivas, ni elegir ciegamente `ours`/`theirs`. Si un conflicto tiene implicaciones funcionales o de datos no resolubles por evidencia, detener esa integración y comunicarlo.
- Integrar los bloques verificados en la rama de migración, no directamente en `main` u otra rama principal. El usuario permite push de ramas de implementación; la integración en una rama principal se realiza mediante una pull request con alcance y pruebas para su revisión.

## Criterios de diseño y validación

- El plan detallado identifica rutas, comandos, contratos, pruebas y dependencias por tarea, con un orden que evita conflictos previsibles y sin declarar completadas tareas no verificadas.
- Las pruebas de integración reales se realizan en contenedores aislados y las pruebas de interfaz usan datos sintéticos; se informa con precisión de cualquier prueba no ejecutada.
- Se distingue una demostración del piloto de una release con datos reales. No modificar datos remotos, publicar cambios o ejecutar migraciones remotas como parte de pruebas locales ordinarias.
- Se documentan los límites de la serie MariaDB y de las colaciones, el aislamiento de entornos, las pruebas de reservas y la recuperación; no se modifican silenciosamente migraciones históricas ya aplicadas.
