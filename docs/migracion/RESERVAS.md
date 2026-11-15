# Disponibilidad y reservas: contrato de implementación

## Cálculo de disponibilidad

`backend-node/src/appointments/availability.ts` es una función de dominio pura. Trabaja con intervalos semiabiertos `[inicio, fin)` expresados como milisegundos de época UTC, comprueba rangos y valores enteros, calcula huecos dentro de un intervalo laboral y excluye cualquier cita ocupada que lo solape. Adyacencia es válida: una cita que termina a las 10:30 no se solapa con una que empieza a las 10:30. El paso de generación se alinea al inicio del intervalo laboral. Cada resultado es informativo y puede dejar de estar disponible inmediatamente.

La fuente de horarios, estado de citas y permisos aún no está conectada. La conversión de horarios locales y excepciones del negocio a UTC debe implementarse explícitamente con su zona IANA, tratar los cambios de hora y las horas inexistentes o ambiguas; el módulo no convierte zonas horarias. No calcula descansos salvo que el llamador los aporte como intervalos ocupados. No limitarse a una comprobación previa en el navegador.

## Protocolo de creación y estado

1. Autenticar al solicitante; obtener su identidad de la sesión y comprobar permiso de reserva para el negocio, sin confiar en un identificador de cliente suministrado arbitrariamente.
2. Validar fechas, duración, negocio, servicio activo y relación con profesional activo, horarios y reglas de la reserva, sin devolver datos de otros negocios. El precio y duración se toman del servidor y se guardan como instantánea.
3. En una única transacción de MySQL, hacer `SELECT ... FOR UPDATE` sobre la fila del profesional **del negocio**, manteniendo el bloqueo hasta el commit o rollback. Todas las escrituras que puedan alterar disponibilidad deben adquirir los mismos bloqueos y usar un orden global estable: creación, reprogramación (bloquear profesional de origen y destino en orden determinista), cancelación, reactivación, cambios de duración o asignación de servicios, horarios y excepciones, activación de profesionales y zona horaria del negocio. Los cambios de servicio o zona que afecten a varios profesionales necesitan un protocolo de bloqueo compartido con todas las reservas: por ejemplo, bloquear un recurso común de negocio antes de todos los profesionales involucrados, manteniendo el mismo orden para cada operación. La implementación actual todavía no adquiere ese recurso común: este requisito sigue pendiente, por lo que no hay garantía de seguridad frente a cambios concurrentes de configuración. Ningún acceso directo debe saltarse el protocolo.
4. Revalidar servicio, disponibilidad, reglas y permisos cuando puedan cambiar; consultar intervalos ocupados activos del mismo profesional y negocio con una **lectura actual bloqueante**. Hay solapamiento cuando `start_at < nuevo_fin AND end_at > nuevo_inicio`. Estados cancelados no bloquean; concretar todos los estados bloqueantes antes de implementar. La comprobación y escritura no pueden separarse de la transacción.
5. Insertar con FKs de negocio y commit. Conflicto devuelve respuesta 409 sin filtrar información ajena; ante error rollback. Definir identificador de idempotencia para reintentos de cliente y estrategias frente a interbloqueos.

Bloquear filas de citas existentes no protege por sí solo cuando no existe una cita previa. La serialización depende de que **todas** las operaciones de escritura bloqueen siempre la fila estable del profesional. Revisar niveles de aislamiento, lecturas y orden de bloqueo con la implementación real y transacciones concurrentes sobre MySQL; no se han ejecutado esas pruebas todavía. El esquema propuesto no garantiza exclusión temporal por sí solo.

## Pruebas imprescindibles antes de exponer reservas

- Citas contiguas, solapamiento parcial y total, duración y límites de jornada; descanso, excepción, horario partido, cambio de hora y estado cancelado.
- Identidad, propietario, profesional y servicio de otro negocio rechazados; roles sin permiso rechazados; respuestas sin detalles sensibles.
- Dos transacciones concurrentes para el mismo profesional y horario: como máximo una confirmada; también creación frente a reprogramación o reactivación.
- Rollback, reintentos idempotentes, caída de conexión, cambio simultáneo de horarios y servicio; reloj y zona horaria del negocio.

Se ha añadido `backend-node/src/appointments/service.ts` como servicio interno, sin exponer endpoints: inicia transacción, bloquea el profesional y comprueba servicio, jornada, solapamiento y precio antes de insertar. La identidad debe llegar desde la sesión autenticada del servidor. La agenda comprueba membresía activa y restringe al profesional a su propia agenda. La comprobación de horarios convierte instantes a la zona del negocio; admite terminar exactamente a las 24:00 si el horario llega a esa hora; rechaza cruzar medianoche o un cambio de offset. No hay aún soporte para excepciones, vacaciones, pausa ni políticas de antelación más allá de exigir cita futura.

Las pruebas usan una conexión simulada: comprueban secuencia, rollback, consulta acotada y permisos, pero **no validan SQL, aislamiento ni concurrencia reales**. Faltan integración con mysql2 y autenticación HTTP, pruebas sobre MySQL real, pruebas de carreras, idempotencia, reprogramación/cancelación y observabilidad. Las operaciones futuras que modifiquen disponibilidad deben usar el mismo protocolo de bloqueo. No desplegar el servicio antes de esas verificaciones.
