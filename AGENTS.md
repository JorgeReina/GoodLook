# GoodLook: instrucciones de proyecto

- Leer docs/migracion/ESTADO.md y los documentos de planificación aplicables antes de trabajar.
- Trabajar por tareas pequeñas, manteniendo el alcance y comprobando el estado de Git. No sobrescribir cambios ajenos.
- Roles disponibles en `.codex/agents/`: project_manager, developer, tester y ux_designer. Usar subagentes cuando el entorno y la tarea lo permitan; un coordinador integra y verifica su trabajo.
- No usar credenciales ni datos reales en fixtures, registros o commits. Toda operación sensible, autorización, disponibilidad y aislamiento se valida en el servidor.
- Comprobar los cambios con pruebas adecuadas e indicar cualquier limitación. No afirmar que funcionan pruebas no ejecutadas.
- Crear un commit por tarea completada cuando Git esté disponible, manteniendo el árbol de trabajo de otros usuarios intacto.
- Mantener el despliegue antiguo y las bases remotas sin cambios mientras se desarrolla localmente; documentar cualquier corte propuesto.
