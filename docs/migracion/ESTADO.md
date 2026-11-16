# Estado de migración GoodLook

Fecha: 2026-11-15. Base: commit ce0a9b0107edbfe61a8b012fdd8a0712edf93f36.

## Contexto confirmado

La aplicación está desplegada, sin usuarios activos; los datos son ficticios y se pueden modificar. Se propone una base de datos nueva versionada para el backend nuevo, sin migración de cuentas ni hashes. El servicio público actual puede presentar riesgos identificados; no se ha modificado ni comprobado dinámicamente.

## Equipo

Se definen agentes de proyecto en `.codex/agents/` para Project Manager, developer, tester y UX/UI. Son configuraciones reutilizables de Codex, no procesos permanentes ni mascotas. En esta sesión se delegó la revisión a tres especialistas y el coordinador integró hallazgos; los resultados fueron análisis estáticos.

## Evaluación inicial

- Frontend: Angular 16 basado en NgModules y builder antiguo; formularios y flujos existentes útiles como referencia. La comparación migración incremental frente a nueva aplicación sigue pendiente de una prueba de compilación y actualización.
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
- Frontend: migración incremental de Angular 16 a 21.2.26; build correcto en Node 24 con avisos NG8107 y presupuestos de tamaño. La actualización a Angular 22 sigue pendiente; no se han ejecutado pruebas de navegador. El frontend sigue conectado al backend legado y no utiliza todavía la API nueva.
- Las rutas de profesionales crean perfiles sin cuenta vinculada; aún no hay invitación de empleados, CRUD de servicios/horarios ni recorrido completo de reserva desde el frontend.

## Avance posterior: 15-11-2026

- Angular actualizado a 22.2.6 y CLI 22.2.7; instalación y compilación pasan en Node 24 con avisos del builder Webpack obsoleto y presupuesto de tamaño. Karma sigue sin arrancar Chromium en este entorno. Los diagnósticos opcionales suprimidos por la migración oficial deben revisarse.
- Ruta `/piloto` aislada conecta la API nueva con cookies mediante proxy de mismo origen; registro, acceso, catálogo, reserva y citas propias. Es un piloto técnico, no está validado en navegador ni es adecuado para clientes: fecha UTC manual, sin selector de huecos ni coincidencia filtrada por profesional/servicio. Consultar `FrontEndGoodLook/PILOTO.md`.
- API: alta de negocio privado con propietario; publicación explícita; creación de profesionales e invitaciones de un uso aceptadas por cuenta; alta/asignación de servicios y horarios; listado de citas propias. Invitaciones son transferibles, entrega manual; actualmente una cuenta solo puede vincularse a un perfil profesional globalmente. No se prueban carreras reales y faltan edición/desactivación, excepciones de horario, revocación e interfaz administrativa completa.
- Pruebas de API: 65 pasan, más 6 del ejecutor con simulaciones; typecheck y build pasan. Se ha añadido suite de integración con MySQL 8 y carrera de dos reservas en Docker aislado; no se pudo ejecutar porque no hay Docker. No se han probado contra MySQL real ni E2E.
- Publicación: propietario autoriza publicar; el proveedor legado usa perfiles IIS/MSDeploy y FTP sin conexión de publicación disponible aquí. No se ha modificado el servidor. Hay perfiles de usuario versionados con material cifrado; comprobar vigencia, rotar credenciales afectadas si procede y planificar limpieza segura, sin publicar valores.

## Continuación: 16-11-2026

- Se añade consulta pública de disponibilidad para negocio publicado, profesional y servicio activos y asociados, con horarios IANA y huecos orientativos; la creación sigue validando de forma transaccional. No se han comprobado consultas ni concurrencia con MySQL real.
- Registro e inicio de sesión incorporan un limitador MySQL compartido y `AUTH_LIMIT_SECRET` obligatorio. Sus límites son preliminares: tras un proxy la IP de socket puede ser común, por lo que antes de desplegar se requieren controles en el borde, calibración y limpieza de contadores.
- El piloto incorpora selector de fecha/hora en zona local del dispositivo, conversión a UTC y rechazo de cambios de hora ambiguos o inexistentes. Sigue pendiente conectar la selección de huecos, pruebas visuales, y verificar el recorrido real.
- Verificación de esta revisión: 78 pruebas del backend y 6 del ejecutor de migraciones con dependencias simuladas, comprobación de tipos y compilación correctas. MySQL real y navegador continúan pendientes.

## Continuación: disponibilidad y protección

- El piloto consulta huecos orientativos para siete días, muestra la zona del negocio y el desfase, descarta respuestas antiguas y exige elegir un hueco devuelto antes de reservar. Se invalida el hueco si el servidor devuelve conflicto. Las pruebas de lógica y la compilación se han realizado; la prueba visual de navegador sigue pendiente.
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
