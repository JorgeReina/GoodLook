# Estado de migración GoodLook

> **Aviso.** Este archivo es un registro histórico de la migración. El diario se conserva en el tiempo verbal de cada jornada. Las frases en presente sobre el frontend que ya no describen el estado actual están marcadas con **[histórico]**. El estado vigente del frontend está en [FrontEndGoodLook/README.md](../../FrontEndGoodLook/README.md). La decisión del [issue #17](https://github.com/JorgeReina/GoodLook/issues/17) deja la aplicación heredada congelada e histórica, sin borrarla, y mantiene `/piloto` durante el corte como entrada temporal. El borrado queda en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34).

Fecha: 2026-11-15. Base: commit ce0a9b0107edbfe61a8b012fdd8a0712edf93f36.

## Contexto confirmado

La aplicación está desplegada, sin usuarios activos; los datos son ficticios y se pueden modificar. Se propone una base de datos nueva versionada para el backend nuevo, sin migración de cuentas ni hashes. El servicio público actual puede presentar riesgos identificados; no se ha modificado ni comprobado dinámicamente.

## Equipo

Se definen agentes de proyecto en `.codex/agents/` para Project Manager, developer, tester y UX/UI. Son configuraciones reutilizables de Codex, no procesos permanentes ni mascotas. En esta sesión se delegó la revisión a tres especialistas y el coordinador integró hallazgos; los resultados fueron análisis estáticos.

## Evaluación inicial

- Frontend: Angular 16 **[histórico]** basado en NgModules y builder antiguo; formularios y flujos existentes útiles como referencia. La comparación migración incremental frente a nueva aplicación sigue pendiente de una prueba de compilación y actualización **[histórico]**.
- API antigua: datos de prueba, sin necesidad de conservar contraseñas o compatibilidad insegura. Debe reemplazarse gradualmente sin conectar la nueva API a producción.
- QA: priorizar alta/acceso, roles, reservas, agenda y pruebas negativas de acceso entre usuarios, exposición de hashes y dobles reservas simultáneas.
- UX: corregir etiquetas de formularios, confirmaciones y estados de error; en fase posterior diseñar interfaz móvil y agenda accesibles.

## Seguimiento

- GL-001: parcialmente identificado; estado de uso confirmado por el propietario. Hosting, detalles operativos y credenciales quedan por identificar sin publicar secretos.
- GL-002: riesgos conocidos por lectura estática; mitigación en despliegue existente pendiente. No se ha demostrado explotación.
- GL-003: inventario parcial en documentación; falta matriz completa y validación dinámica.
- GL-004: restauración no realizada. Dado que no hay datos reales que conservar, evaluar si es necesaria antes de sustituir el entorno.
- GL-005 a GL-024: pendientes salvo avances explícitos en commits posteriores.

## Verificación de referencia

El build del frontend legado pasó con avisos usando Node 24 fuera de la matriz soportada de Angular 16. La ejecución de Karma no pudo arrancar Chromium por restricciones de sockets; .NET no está instalado. Detalles y matriz estática de rutas en [BASELINE.md](BASELINE.md).

## Primera base de API

`backend-node` incorpora Express 5 y TypeScript estricto, endpoint de salud, 404 JSON y gestión inicial de errores. El 15-11-2026 se ejecutaron tres pruebas HTTP (salud, ruta inexistente y JSON inválido), typecheck y compilación con resultado satisfactorio. Es únicamente un esqueleto: no incluye autenticación, persistencia, autorización ni citas, y no debe desplegarse como sustituto del sistema actual. GL-009 sigue en curso: faltan CI, observabilidad, validación adicional y revisión de seguridad.

## Avance de migración: 15-11-2026

- API nueva: registro, inicio/cierre de sesión y consulta de identidad; profesionales activos y alta autorizada; creación de cita propia y agenda autorizada. Sesiones mediante cookie, hashes de contraseñas y de tokens, y origin restringido para operaciones de escritura. Falta limitación de intentos compartida, recuperación y controles operativos; no es apta aún para producción.
- MySQL: esquema inicial y ejecutor de migraciones con bloqueo, registro de estado y política TLS. No se han ejecutado sobre servidor MySQL real: los tests utilizan conexiones simuladas. Se requiere una base MySQL 8 aislada para probar integridad y concurrencia con dos conexiones.
- Citas: validación de disponibilidad, bloqueo transaccional propuesto y comprobación de solapamientos; soporte para cierre a medianoche. Todas las operaciones que alteran disponibilidad tendrán que respetar el mismo protocolo; todavía no se ha verificado una carrera real.
- Backend anterior: eliminación de hashes en respuestas y controles de identidad sobre perfil, agendas y creación de cita. Compilación y pruebas de controladores/JWT pasan; no hay prueba HTTP completa, y las sesiones anteriores deberán iniciar sesión de nuevo. Continúan pendientes listado global de usuarios, competencia entre reservas y configuración de JWT/CORS. Estas correcciones no se han desplegado.
- Verificaciones: API 34 tests, typecheck y build; migraciones 6 tests simulados; backend .NET 10 verificaciones de regresión. No hay pruebas de integración MySQL ni E2E completas.
- Frontend: migración incremental de Angular 16 a 21.2.26; build correcto en Node 24 con avisos NG8107 y presupuestos de tamaño. La actualización a Angular 22 sigue pendiente **[histórico]**; no se han ejecutado pruebas de navegador **[histórico]**. El frontend sigue conectado al backend legado y no utiliza todavía la API nueva **[histórico]**.
- Las rutas de profesionales crean perfiles sin cuenta vinculada; aún no hay invitación de empleados, CRUD de servicios/horarios ni recorrido completo de reserva desde el frontend.

## Avance posterior: 15-11-2026

- Angular actualizado a 22.2.6 y CLI 22.2.7; instalación y compilación pasan en Node 24 con avisos del builder Webpack obsoleto y presupuesto de tamaño. Karma sigue sin arrancar Chromium en este entorno **[histórico]**. Los diagnósticos opcionales suprimidos por la migración oficial deben revisarse.
- Ruta `/piloto` aislada conecta la API nueva con cookies mediante proxy de mismo origen; registro, acceso, catálogo, reserva y citas propias. Es un piloto técnico, no está validado en navegador **[histórico]** ni es adecuado para clientes: fecha UTC manual, sin selector de huecos ni coincidencia filtrada por profesional/servicio **[histórico]**. Consultar `FrontEndGoodLook/PILOTO.md`.
- API: alta de negocio privado con propietario; publicación explícita; creación de profesionales e invitaciones de un uso aceptadas por cuenta; alta/asignación de servicios y horarios; listado de citas propias. Invitaciones son transferibles, entrega manual; actualmente una cuenta solo puede vincularse a un perfil profesional globalmente. No se prueban carreras reales y faltan edición/desactivación, excepciones de horario, revocación e interfaz administrativa completa.
- Pruebas de API: 65 pasan, más 6 del ejecutor con simulaciones; typecheck y build pasan. Se ha añadido suite de integración con MySQL 8 y carrera de dos reservas en Docker aislado; no se pudo ejecutar porque no hay Docker. No se han probado contra MySQL real ni E2E.
- Publicación: propietario autoriza publicar; el proveedor legado usa perfiles IIS/MSDeploy y FTP sin conexión de publicación disponible aquí. No se ha modificado el servidor. Hay perfiles de usuario versionados con material cifrado; comprobar vigencia, rotar credenciales afectadas si procede y planificar limpieza segura, sin publicar valores.

## Continuación: 16-11-2026

- Se añade consulta pública de disponibilidad para negocio publicado, profesional y servicio activos y asociados, con horarios IANA y huecos orientativos; la creación sigue validando de forma transaccional. No se han comprobado consultas ni concurrencia con MySQL real.
- Registro e inicio de sesión incorporan un limitador MySQL compartido y `AUTH_LIMIT_SECRET` obligatorio. Sus límites son preliminares: tras un proxy la IP de socket puede ser común, por lo que antes de desplegar se requieren controles en el borde, calibración y limpieza de contadores.
- El piloto incorpora selector de fecha/hora en zona local del dispositivo, conversión a UTC y rechazo de cambios de hora ambiguos o inexistentes. Sigue pendiente conectar la selección de huecos, pruebas visuales, y verificar el recorrido real **[histórico]**.
- Verificación de esta revisión: 78 pruebas del backend y 6 del ejecutor de migraciones con dependencias simuladas, comprobación de tipos y compilación correctas. MySQL real y navegador continúan pendientes.

## Continuación: disponibilidad y protección

- El piloto consulta huecos orientativos para siete días, muestra la zona del negocio y el desfase, descarta respuestas antiguas y exige elegir un hueco devuelto antes de reservar. Se invalida el hueco si el servidor devuelve conflicto. Las pruebas de lógica y la compilación se han realizado; la prueba visual de navegador sigue pendiente **[histórico]**.
- La consulta de huecos une intervalos ocupados, limita volumen y aplica control compartido de 30 consultas/minuto por IP del socket. La autenticación limita primero por IP y evita crear contadores de identidad cuando ya se ha excedido; se dispone de limpieza por lotes de entradas antiguas.
- Estos límites requieren configuración del proxy y limpieza programada; una IP compartida afecta a varios usuarios. No son protección suficiente contra tráfico distribuido. No se han ejecutado pruebas con MySQL real y el cálculo de disponibilidad es orientativo hasta confirmar la reserva.

## Continuación: evaluación de MonsterASP

- Se creó una base gratuita nueva y separada para pruebas, sin conectar el backend ni alterar la base antigua. El acceso remoto se desactivó después de las comprobaciones; la base nueva seguía sin tablas y no se ejecutó el migrador en ella.
- Una consulta de solo lectura al servidor identificó MariaDB 10.11.19 y confirmó que no ofrece la colación `utf8mb4_0900_ai_ci` utilizada por la migración inicial. En un contenedor MariaDB 10.11.19 desechable, sin red y con almacenamiento temporal, un `CREATE TABLE` con esa colación falló con `ERROR 1273: Unknown collation`. Se eliminó el contenedor tras la prueba.
- Por tanto, se evitó aplicar allí la serie original de MySQL: además del fallo esperado, el ejecutor habría registrado la migración como interrumpida. Se requería una estrategia compatible sin modificar silenciosamente migraciones ya aplicadas. La prueba local anterior con MySQL 8.4 no demostraba compatibilidad con MariaDB.

## Continuación: migraciones en MonsterASP

- Se añadió una serie de migraciones MariaDB separada, sin modificar los archivos históricos de MySQL. Las migraciones, la agenda y la carrera de reservas se comprobaron en contenedores desechables de MySQL 8.4 y MariaDB 10.11. Las colaciones de ambos motores no son semánticamente idénticas y requieren evaluación adicional antes de producción.
- En la base aislada de prueba `db80496` de MonsterASP, MariaDB 10.11, el lanzador específico comprobó identidad, conexión TLS verificada y esquema vacío antes de ejecutar las migraciones. Se verificó que las versiones 001–004 constan como `applied` y que existen 12 tablas. El acceso remoto se deshabilitó después.
- La credencial local se guarda en un archivo `.env` excluido de Git; no se incluye en el repositorio. El migrador no se ha probado contra datos reales ni se ha desplegado el backend nuevo. La prueba de reservas simultáneas contra MonsterASP y el recorrido completo en navegador siguen pendientes.

## Continuación: piloto en Vercel y pruebas remotas

- Se preparó un despliegue preview público del piloto y de la API en Vercel, con rutas `/api` del mismo origen y conexión TLS a la base MariaDB de pruebas de MonsterASP. Las credenciales se configuran como variables del entorno; no se suben archivos `.env`. Este preview es una demostración técnica, no un despliegue de producción ni una sustitución del servicio antiguo.
- Con datos sintéticos se verificaron en navegador el registro, inicio de sesión, selección de negocio, profesional y servicio, consulta de disponibilidad, confirmación de una reserva y listado de citas. El primer intento reveló que la interfaz no se actualizaba tras operaciones asíncronas; se corrigió y se repitió el recorrido. No se declara cobertura completa de todos los roles ni casos de error.
- En el mismo preview y contra MonsterASP se enviaron dos reservas simultáneas para un hueco idéntico: las respuestas fueron 201 y 409, y el listado confirmó una única cita para ese hueco. Esto verifica esa carrera concreta; no cubre cambios simultáneos de horario, servicios, cancelaciones o reprogramaciones.
- Se comprobó que las relaciones pertenecían a los datos sintéticos y se eliminaron de forma acotada y transaccional el negocio, sus registros relacionados y las cuentas de prueba. Una consulta posterior confirmó que no quedaban esas entidades. No se modificaron el esquema ni los contadores de limitación compartidos.
- Siguen pendientes las garantías y controles para producción: protocolo de bloqueo compartido frente a cambios de configuración, idempotencia, evaluación de la IP del cliente y limitadores detrás del proxy, protección contra abuso, copias y restauración, compatibilidad y colaciones MariaDB, revisión de seguridad y verificaciones más amplias. El plan gratuito de la base no dispone de copias automáticas.

## Continuación: despliegue de producción

- Vercel informa del despliegue de producción `good-look.vercel.app` como READY, construido desde el commit `dc57584`. Las comprobaciones posteriores obtuvieron HTTP 200 para `/piloto`, HTTP 200 y catálogo vacío para `/api/businesses`, HTTP 401 sin sesión en `/api/auth/me` y HTTP 400 para una solicitud de acceso inválida. Estas comprobaciones no sustituyen un recorrido completo en producción.
- Los entornos preview y producción apuntan a la misma base `db80496`; el catálogo sintético utilizado en las pruebas se eliminó. El acceso remoto a la base está habilitado por el usuario. Compartir base implica que las escrituras de ambos entornos afectan a los mismos datos: se necesita separación antes de usar preview con datos reales.
- Continúan las limitaciones de seguridad, copias y concurrencia indicadas arriba. El despliegue anterior y su base no se han modificado.

## Tarea pendiente: datos de muestra para el piloto

- **Objetivo:** disponer de un negocio ficticio con servicios, profesionales asociados y horarios que permitan probar el registro, la selección de huecos, la reserva y la consulta de citas de principio a fin.
- **Alcance:** preparar una carga reproducible con datos sintéticos identificables y sin credenciales ni datos personales reales; incluir relaciones válidas, zona horaria y horarios con huecos futuros. La tarea está pendiente: no se han insertado estos datos de muestra.
- **Aislamiento y seguridad:** ejecutar solo sobre un entorno de prueba identificado y verificado, separado de datos reales y del sistema antiguo. Antes de cargar, resolver la base compartida entre preview y producción; no asumir que el destino actual es desechable. La ejecución debe ser idempotente y no modificar ni eliminar registros ajenos; la limpieza, si se necesita, debe limitarse a los identificadores creados para la muestra.
- **Criterios de aceptación:** repetir la carga sin duplicados, comprobar desde el catálogo que negocio, servicios y profesionales aparecen y están asociados, y completar una reserva y su consulta desde el piloto. Documentar el destino, cómo cargar y retirar los datos de muestra, y los resultados de las pruebas sin incluir secretos.

## Continuación: demo local aislada (19-11-2026)

- Las pruebas de desarrollo utilizan Docker local. MonsterASP queda reservado para releases o cambios destinados a producción. Preview y producción siguen compartiendo la base remota; por ello el recorrido de desarrollo utiliza el piloto local.
- La demo crea un negocio ficticio, dos servicios, dos profesionales, sus asociaciones y horarios semanales. La carga se ejecuta en una transacción. Repetirla conserva las filas existentes, y un UUID reservado con datos divergentes o un conjunto parcial detiene la carga.
- El lanzador comprueba el contexto de Docker, el puerto de loopback, el almacenamiento temporal y la identidad de la conexión. Crea la red y el contenedor con Docker Engine y conserva los IDs que recibe. La migración y la semilla requieren una capacidad privada de esa ejecución, y la limpieza se limita a esos IDs. Compose se usa como fuente de configuración.
- La semilla pasó su integración en MySQL 8.4 y MariaDB 10.11. En la rama de migración también pasaron 87 pruebas de API, 33 de base de datos, la comprobación de tipos y la compilación del backend.
- El recorrido local en Chrome Headless con MySQL 8.4 completó registro, inicio de sesión, consulta de huecos, reserva y consulta de la cita tras recargar. El guion de navegador fue temporal. El cierre interactivo con Enter y Ctrl+C retiró los recursos propios en una consola de Windows. Una interrupción forzada sin consola requirió retirar manualmente los dos recursos identificados.
- La regresión de migraciones, aislamiento y reservas simultáneas pasó en ambos motores, cada uno en un contenedor local desechable. El siguiente bloque pendiente es el protocolo de reservas frente a cambios de configuración.

## Retirada del código .NET del repositorio

- Se retiran el backend anterior (`BackEndGoodLook`) y su suite de regresión (`LegacySecurityTests`). Las menciones de .NET en los apartados anteriores registran el estado histórico.
- El piloto de Vercel usa Angular y la API Node. El frontend anterior conserva su integración histórica con el servicio legado alojado fuera de este repositorio. La retirada de código no cambia ese servicio, su base de datos ni el historial de Git.

## Inicio de la primera entrega de producto (19-11-2026)

- El [diseño aprobado](../superpowers/specs/2026-11-19-goodlook-producto-ux-design.md) y el [plan por tareas](../superpowers/plans/2026-11-19-goodlook-primera-entrega.md) están integrados en la rama local de migración.
- Tarea 1. La migración 005 añade los campos de ficha, la marca de primera publicación, la revocación de invitación y el índice de perfiles por cuenta. MySQL 8.4.13 y MariaDB 10.11.19 pasaron la actualización desde 004 con una cita histórica, la reaplicación, la carrera de reservas existente y la semilla desde una base vacía. La vinculación desde la API de invitaciones se aborda en la tarea 5. La tarea 4 debe contemplar negocios que el piloto publique con first_published_at nulo después de 005.
- Tarea 2. La API expone `GET /api/me/memberships` con pertenencias activas de la sesión y cabecera `Cache-Control: no-store`. Pasaron 92 pruebas de API, 33 de base de datos, comprobación de tipos y compilación con Node 24.22.3. Se comprobó la ruta HTTP con sesión real, dos pertenencias activas y una inactiva en ambos motores Docker. Ese guion fue temporal.
- Tarea 6. Se elige Angular Material/CDK a partir de una prueba local de reserva, diálogo y agenda con lista, a 360 px, en escritorio y con zoom al 200 %. PrimeNG 22 se evaluó con documentación y ejemplos públicos. La compilación y las métricas de peso de PrimeNG quedaron pendientes por falta de una clave PrimeUI. [Decisión y resultados de interfaz](../../FrontEndGoodLook/docs/decision-ui.md).
- Siguientes tareas del plan. Protocolo de reservas y disponibilidad (3), y carcasa Angular con rutas y sesión (7). Las pruebas se ejecutaron en recursos Docker locales, retirados después de las comprobaciones. Esta tanda se conserva localmente y no se aplicó a MonsterASP ni a Vercel.

## Reservas concurrentes y carcasa Angular (19-11-2026)

- Tarea 3. El protocolo serializa reservas de la misma cuenta profesional entre locales y usa la clave idempotente del cliente para recuperar el resultado de un reintento. La 006 añade cierres, asignaciones activas e historial de solicitudes. Pasaron 93 pruebas de API, 33 de base de datos y tres integraciones por motor en MySQL 8.4.13 y MariaDB 10.11.19. Las pruebas contra cambios de configuración usaron transacciones SQL. Se repetirán con las rutas de Gestión en la tarea 4.
- Tarea 7. La carcasa Material/CDK compila como producto independiente. Incluye acceso, registro y navegación por pertenencia, con catálogo preliminar. Pasaron ocho pruebas de producto en Chrome. La suite general presenta los seis fallos legados reproducidos en la base del cambio. Las pantallas de reserva, agenda, gestión e invitación continúan en las tareas posteriores **[histórico]**.
- Para publicar la tanda, servir la carcasa en `/producto/` y el piloto en `/piloto`. La API es del mismo origen. La compilación genera primero el piloto y después el producto en un subdirectorio. Mantener `/api` y los recursos estáticos fuera del fallback de navegación. La instalación PWA y el corte de la entrada principal siguen en el plan posterior **[histórico]**.
- Antes de promover, verificar copia lógica y restauración aislada, así como el historial y TLS de MonsterASP. Aplicar únicamente 005 y 006 tras verificar los checksums de 001–004. Si hubiera que volver a una versión anterior del backend tras activar escrituras dependientes de 006, detener las reservas afectadas antes de volver al código que ignora las reglas nuevas. La reversión de Vercel conserva el esquema aditivo.

## Recorridos conectados y carreras de Gestión (20-11-2026)

- Se completaron las tareas 4, 5 y 8–10. En `/producto/` funcionan el catálogo y la reserva con Mis citas, la agenda semanal, las invitaciones de un solo uso y Gestión de negocios, servicios, profesionales, horarios y cierres.
- En Chrome y MySQL desechable se verificaron una ficha privada, la introducción de precio, el vínculo por invitación, la publicación, la reserva del cliente, su consulta tras recargar y su aparición en la agenda profesional. También se comprobó que el aviso de impacto recibe el foco, que los campos se bloquean mientras está pendiente y que confirmar el cierre conserva la cita.
- Pasaron 105 pruebas de API, 33 de base de datos, 17 de producto en Chrome y los builds de backend, piloto y producto. Pasaron cinco integraciones por motor en MySQL 8.4.13 y MariaDB 10.11.19, incluidas carreras HTTP de Gestión y aceptación concurrente de invitaciones. [Contrato y verificación de reservas](RESERVAS.md).
- Esta tanda usa el esquema 006 existente. La verificación se realizó en Docker local sin cambios en bases remotas. La instalación PWA y el empaquetado final de entrega siguen en las tareas 11–12 **[histórico]**.

## PWA y paquete de entrega (20-11-2026)

- El build incorpora un manifiesto instalable y un service worker de alcance `/producto/`. Precarga la interfaz y los iconos y deja fuera las respuestas de API. Durante una interrupción de red la aplicación muestra su estado y bloquea la confirmación. Una actualización espera la acción explícita del usuario y la resolución de cualquier intento de reserva pendiente.
- La configuración candidata dirige `/` a `/producto/`, conserva la entrada `/piloto` y empaqueta ambos builds. El verificador del paquete revisa el manifiesto, los iconos, los recursos precargados y la separación del piloto. [Guía de ejecución y corte](../../FrontEndGoodLook/PILOTO.md).
- Se añadió un flujo de GitHub Actions para compilación, pruebas Angular y Node, integración Docker en ambos dialectos y aceptación Playwright. En local pasaron 21 pruebas Angular, 105 de API, 33 de base de datos, cinco integraciones por motor y cuatro recorridos Playwright. Chromium comprobó la instalabilidad, la recarga sin red, la ausencia de respuestas de API en la caché, el cierre de sesión y la actualización explícita.
- Pendientes para la publicación: registrar instalación y actualización en Android con Chrome e iOS con Safari físicos sobre HTTPS aislado, ejecutar GitHub Actions y aprobar el PR de entrega. Esta tanda se comprobó localmente con el esquema 006.

## Catálogo público: tope y caché de borde

- Los GET de `/api/catalog/businesses`, `/services` y `/professionals` (y los listados públicos del piloto en `/api/businesses` y `/api/services`) aplican `LIMIT`/`OFFSET`, validan `page` y `limit` (50/100) y, en 200, envían `s-maxage` con `stale-while-revalidate`. El array JSON no cambia de forma. Las rutas autenticadas de catálogo siguen en `private, no-store`. Contrato en [CATALOGO.md](CATALOGO.md).

## Limitadores detrás de Vercel (20-11-2026)

- Los limitadores de acceso (registro e inicio de sesión) y de disponibilidad dejan de usar la IP del socket cuando `VERCEL=1`. En ese modo la clave es la primera IP de `x-vercel-forwarded-for`, la cabecera que el borde de Vercel fija y que no se sustituye por `X-Forwarded-For`. `trust proxy` sigue apagado. Sin `VERCEL=1` se mantiene la IP del socket y se ignoran las cabeceras de reenvío. Una cabecera ausente o inválida en Vercel responde 503, sin caer al socket compartido.
- La comprobación local fueron 114 pruebas de API, la comprobación de tipos y la compilación. No se ejecutó la integración MySQL/MariaDB en Docker en esta tanda: el SQL del limitador no cambió. No se modificaron Vercel, MonsterASP ni datos remotos.
- Sigue el riesgo de NAT, de un proxy delante de Vercel y de la base compartida entre preview y producción. La ráfaga manual de 429 queda documentada en `backend-node/README.md` y no debe lanzarse mientras ambos entornos escriban la misma tabla.

## Separación de preview y producción (20-11-2026)

- El diagnóstico de código confirma lo ya anotado: preview y producción eligen la base solo con `DATABASE_URL`. Nada en el repositorio les obliga a usar destinos distintos, y el estado documentado es que ambos apuntan a `db80496`. Esta revisión no ha abierto Vercel ni MonsterASP.
- La API no asigna el papel `development` cuando faltan `GOODLOOK_DATA_ENV` y `VERCEL_ENV`: sin papel, una base remota impide el arranque. La identidad de producción está solo en `backend-node/config/production-database.json`. La base nueva y el cambio de variables siguen siendo manuales. Procedimiento, coste orientativo y vuelta atrás: [ENTORNOS.md](ENTORNOS.md).
