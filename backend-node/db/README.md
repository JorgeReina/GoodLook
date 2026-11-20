# Esquema GoodLook — versión inicial

Esta migración establece una base nueva para MySQL 8.0.16+ con InnoDB, UUID suministrados por la aplicación y fechas `DATETIME(3)` en UTC. No ejecutarla sobre la base desplegada sin plan explícito. MySQL DDL realiza commits implícitos: no existe reversión transaccional de la migración. Hacer una copia y restaurar una base aislada para ensayar cualquier despliegue real. La aplicación debe fijar la zona de sesión `+00:00`, y validar las zonas IANA, divisas, entradas, identidad y permisos en runtime.

## Ejecución manual aislada

Crear mediante administración habitual una base **vacía y desechable** denominada `goodlook_test`, usando MySQL 8. No poner contraseñas en archivos, argumentos ni documentación. A continuación, configurar conexión mediante un fichero de opciones del cliente protegido (`~/.my.cnf`) y ejecutar:

```bash
mysql --database=goodlook_test --init-command="SET time_zone = '+00:00'" < backend-node/db/migrations/001_initial.sql
mysql --database=goodlook_test --init-command="SET time_zone = '+00:00'" < backend-node/db/tests/001_invariants.sql
```

`001_initial.sql` es una migración ordenada que debe aplicarse exactamente una vez; para utilizar el historial automático, emplear el ejecutor descrito más abajo y no la aplicación manual. No reintentar sobre una aplicación parcialmente fallida sin inspeccionar el estado, pues las sentencias DDL no son atómicas como conjunto. Las pruebas crean y eliminan un procedimiento `goodlook_test_invariants` y usan IDs fijos dentro de una transacción revertida; no usar sobre una base que contenga información real. Verificar código de salida cero. Ante un error del test, puede quedar el procedimiento de prueba y deberá eliminarse antes de reintentar. Las pruebas requieren permisos CREATE ROUTINE y ALTER ROUTINE, además de CRUD. Este archivo es un test de integración, no una sustitución de una suite E2E ni de pruebas de concurrencia.

## Relaciones y límites

La clave compuesta `(business_id, id)` y las FKs compuestas impiden asociar profesionales, servicios y horarios de otros negocios. `professional_services` determina las combinaciones admitidas en citas. Las restricciones no impiden que una consulta sin filtro lea otro negocio: cada operación debe autorizar al actor y filtrar por empresa y recurso. La tabla `users` es global, y un cliente puede reservar en varias empresas.

Los servicios y profesionales se desactivan en lugar de borrarse para preservar historial. Las citas conservan precio y moneda acordados. No se guardan hashes de tokens de autenticación en texto recuperable: `auth_sessions.token_hash` es SHA-256 del token aleatorio. Los horarios semanales usan horas locales y día ISO de negocio; excepciones, descansos, precios por profesional y cambios de sede son trabajo futuro.

**Solapamientos:** MySQL no ofrece aquí una restricción automática para intervalos. Toda creación/reprogramación debe realizar en la misma transacción un bloqueo `SELECT ... FOR UPDATE` de la fila del profesional, volver a consultar sus reservas activas con `existing.start_at < requested.end_at AND existing.end_at > requested.start_at` y solo después insertar; todos los caminos de escritura deben cumplir el mismo protocolo. Los cambios de estado que liberen o restauren un hueco también deben coordinarse con ese bloqueo. Hay que probar solicitudes concurrentes reales contra MySQL antes de declarar lista la función.

## Ejecutor versionado

### Base fijada de MonsterASP

El lanzador `db/monsterasp-migrate.mjs` apunta exclusivamente a `db80496.public.databaseasp.net/db80496` con TLS y certificado verificado. Esa identidad es la base que hoy comparten el preview y la producción de Vercel. El lanzador no arranca sin `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES` y, antes de escribir, exige MariaDB 10.11, cifrado de sesión y un esquema vacío. No sirve para la base de preview: ignora `DATABASE_URL`. Si falla, no repetir sin inspeccionar el estado porque el DDL puede quedar parcialmente aplicado.

Para un ensayo histórico sobre una base vacía con esa identidad, crear `backend-node/.env.monsterasp` local (ignorado por Git) con `GOODLOOK_DB_PASSWORD="..."` y `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES`, en privado, sin copiar la contraseña a documentación, terminal o chat. Con Node 24 y acceso remoto autorizado, desde `backend-node` ejecutar `node --env-file=.env.monsterasp db/monsterasp-migrate.mjs`. Si el servidor presenta un certificado no confiable la conexión debe fallar; no desactivar la verificación. El lanzador no realiza pruebas de reservas ni aprovisiona datos. La base `db80496` ya tiene esquema: este lanzador se detendrá en la comprobación previa.

Desde la raíz de `backend-node`, tras `npm ci`, configurar `DATABASE_URL` como URL `mysql://...` y declarar explícitamente `GOODLOOK_MIGRATION_TARGET=test`, `development` o `preview`; usar variables de entorno inyectadas de forma segura. La conexión requiere `MYSQL_TLS=true`, con verificación del certificado TLS. Solo para loopback (`localhost`, `127.0.0.1` o `::1`) puede permitirse conexión sin TLS mediante `MYSQL_ALLOW_INSECURE_LOCAL=true` explícito. `preview` aplica la serie al destino de la URL y rechaza el host, el nombre o el usuario de `config/production-database.json`. Sin ese archivo, un destino que no sea `production` rechaza una base remota. El procedimiento completo está en [ENTORNOS.md](../../docs/migracion/ENTORNOS.md). Ejecutar:

Para MariaDB 10.11 establecer además `GOODLOOK_MIGRATION_DIALECT=mariadb`; sin esta variable se usa la serie histórica MySQL. El ejecutor comprueba la versión del servidor antes de escribir y rechaza un motor distinto del seleccionado. Las series están en `migrations` y `migrations-mariadb` y sus checksums son independientes: no cambiar de serie sobre una base ya migrada. Las futuras migraciones deben mantenerse y verificarse en ambas series. La colación MariaDB `utf8mb4_unicode_520_ci` no es idéntica a la colación MySQL `utf8mb4_0900_ai_ci`; las comparaciones de texto y unicidad pueden diferir y requieren validación específica antes de producción.

```bash
node db/migrate.mjs
node --test db/tests/migrate.test.mjs
```

El ejecutor toma un bloqueo asesor MySQL exclusivo por nombre de base, crea `schema_migrations`, registra el checksum y el estado `applying` **antes** del DDL y cambia a `applied` después. Un proceso concurrente debe fallar al no obtener el bloqueo. No se repiten versiones ya aplicadas y se rechazan archivos alterados, ausentes, huecos e intentos que encuentren una migración interrumpida. El control de ejecución depende de que todos los procesos usen este ejecutor. MySQL puede haber aplicado parcialmente las sentencias antes de una interrupción: **nunca borrar ni cambiar a mano la marca `applying` para continuar**. Detener las aplicaciones, revisar el estado real y restaurar una copia verificada, o recrear la base exclusivamente si es desechable; después repetir el ensayo. Documentar y revisar manualmente cualquier otra recuperación.

La ejecución de destino `production`, o con `NODE_ENV=production`, está bloqueada salvo que además se proporcione la señal explícita `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES`. Los destinos `test`, `development` y `preview` rechazan además la identidad de `config/production-database.json`, también si la excepción está activa. Si ese archivo no está, esos destinos rechazan una base remota. Hay que confirmar el destino antes de ejecutar. Para aplicar a producción se necesita un plan específico, copia y restauración ensayadas; no se recomienda usar la excepción de forma rutinaria. La suite aislada puede ejecutarse con `bash scripts/test-mysql-integration.sh mysql` o `bash scripts/test-mysql-integration.sh mariadb`; prueba el migrador real, restricciones y una carrera de reservas, no sustituye la validación E2E ni cubre todas las operaciones concurrentes.
