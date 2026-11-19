# Plan de implementación de GoodLook · primera entrega de producto

> **Para los agentes.** Ejecutar tarea a tarea con `superpowers:subagent-driven-development` o `superpowers:executing-plans`. El coordinador revisa el resultado y las pruebas antes de integrar cada rama.

**Objetivo.** Publicar una única app instalable en la que el negocio configura su oferta, el cliente reserva y el profesional encuentra la cita en su agenda semanal.

**Arquitectura.** Angular independiente con rutas por rol y una API Express del mismo origen. Las escrituras de reservas y configuración comparten un protocolo transaccional en las dos variantes SQL. Las pruebas usan la demo Docker desechable.

**Tecnología.** Angular 22.x, Node 24 compatible con Angular, TypeScript, Express, mysql2, MySQL 8.4, MariaDB 10.11, Playwright y Angular Service Worker. La tarea 6 elige la librería UI.

**Diseño.** [Rediseño y primera entrega](../specs/2026-11-19-goodlook-producto-ux-design.md). [Protocolo anterior de reservas](../../migracion/RESERVAS.md).

## Restricciones y coordinación

- Una sesión HttpOnly y una aplicación. El rol se deriva de la pertenencia activa en el servidor. Las guardas Angular ayudan a navegar. Todas las lecturas privadas usan `Cache-Control: no-store`.
- Tiempo persistido y transportado en UTC, semana de lunes a domingo en la zona IANA del negocio, precio en céntimos enteros y moneda ISO de tres letras. Cada negocio representa un local. Nota de hasta 500 caracteres, acceso por necesidad y sin correo ni teléfono en la agenda.
- Cada dialecto recibe migraciones nuevas con los mismos cambios de esquema. Preservar SQL 001–004, claves foráneas, citas y perfiles históricos. Mantener los contratos del piloto durante la transición.
- Desarrollo y pruebas en localhost con Docker desechable. Los modos de prueba de ambos dialectos usan el mismo puerto 33317 y se ejecutan en serie. MonsterASP y Vercel quedan para la fase de release descrita al final.
- El punto de partida para las ramas de código será el head verificado de `work/goodlook-migracion` más el diseño y este plan. Integrar primero ambos documentos. Crear ramas `codex/gl-ux-*` por bloque, sin reutilizar una rama con cambios ajenos. Solo el coordinador integra en la rama de migración. Paso a `main` por PR.
- Las ramas pueden preparar pruebas y pantallas contra contratos acordados. Los cambios a `runtime.ts`, `app.ts`, `angular.json`, lockfiles y migraciones se integran secuencialmente y se revalidan sobre la rama receptora. No duplicar dependencias o versiones por pantalla.

## Bloques, dependencias y propietarios

| Bloque | Rama | Tareas, propiedad y dependencia |
| --- | --- | --- |
| A. Identidad y persistencia | `codex/gl-ux-identidad` | 1–2. Migraciones 005, identidad y DTO privados. Puede empezar junto a E/6. |
| B. Reservas y disponibilidad | `codex/gl-ux-reservas` | 3. Migraciones 006 y código de reservas. Parte de A. Define el protocolo para C. |
| C. Configuración | `codex/gl-ux-configuracion` | 4. Perfil, equipo, catálogo y horarios de gestión. Se integra tras B. |
| D. Agenda e invitaciones | `codex/gl-ux-agenda-api` | 5. Invitaciones, agenda y DTO de cliente. Se integra tras A; resolver el uso de bloqueos y los cambios en archivos de citas con B–C antes de integrar. |
| E. Sistema visual y app | `codex/gl-ux-base-web` | 6–7. Comparativa, entrada, router, sesión, estilos y componentes compartidos. |
| F. Recorridos web | `codex/gl-ux-cliente`, `codex/gl-ux-agenda-web`, `codex/gl-ux-gestion` | 8–10. Una rama por pantalla. Parten de E y sus API. Solo E controla las entradas del router. |
| G. Instalación y entrega | `codex/gl-ux-pwa-e2e` | 11–12. Build, instalación, automatización y documentación de entrega. Se integra tras F. |

## Contratos comunes

Reservar rutas aditivas para la interfaz nueva. Los routers actuales mantienen las rutas de piloto; delegan en la misma lógica de permisos y disponibilidad donde corresponda. Todas las respuestas de error usan `{code}` en las rutas nuevas. Usar `400 invalid_input`, `401 unauthenticated`, `403 forbidden`, `404 not_found` para recursos públicos invisibles y `409` con código funcional para conflictos.

| Contrato | Campos |
| --- | --- |
| `Membership` | `businessId, businessName, timezone, role: owner\|admin\|professional, professionalId: string\|null` |
| `PublicBusiness` | `id, name, sector, address, timezone`. Los datos nuevos de filas anteriores pueden ser nulos hasta completar su perfil. |
| `Service` | `id, businessId, name, description, durationMinutes, priceCents, currency, active` |
| `Staff` | `id, displayName, active, linked, serviceIds: string[]` |
| `Hours` | `weekday: 1..7, startTime, endTime` en hora local `HH:mm`, con `24:00` como fin del día. |
| `Closure` | `id, professionalId, startAt, endAt` en UTC. Bloquea el intervalo semiabierto. |
| `Quote` | `priceCents, currency, durationMinutes`. El servidor compara los tres valores bajo bloqueo. |
| `AgendaItem` | `id, startAt, endAt, status, serviceName, customerName, notes` |
| `CustomerAppointment` | `id, businessId, businessName, timezone, professionalId, professionalName, serviceId, serviceName, startAt, endAt, status, priceCents, currency` |

Cliente y API mantienen los nombres de los DTO en `backend-node/src/product/contracts.ts` y `FrontEndGoodLook/src/app/product/api/contracts.ts`. La prueba HTTP de cada tarea fija su forma y la prueba Angular comprueba el contrato consumido. `GET /api/auth/me` conserva su respuesta. Usar `/api/me/memberships` para obtener roles.

## Focos de revisión

1. La misma persona puede recibir dos reservas en locales distintos aunque cada local bloquee su propio perfil. Una sola confirma y la otra nunca recibe información del negocio ajeno (tarea 3).
2. Un cambio de oferta entre selección y confirmación exige revisión y una nueva confirmación incluso si el hueco sigue libre (tareas 3 y 8).
3. Un cierre puede dejar citas ya confirmadas fuera de la jornada. Mostrar el impacto y conservar esas citas incluso si apareció otra mientras el panel estaba abierto (tarea 4).
4. Una semana con cambio de hora no tiene siempre 168 horas. Calcular sus dos límites por calendario en la zona del local y probar medianoche, hora ambigua y hora inexistente (tareas 3, 5 y 9).
5. El service worker puede seguir controlando una sesión tras cerrar sesión o perder la red. Verificar que el navegador no recupera citas ni datos de sesión desde caché y nunca muestra éxito offline (tarea 11).

## Tarea 1 · Evolución del esquema y aislamiento

**Archivos.** Crear `backend-node/db/migrations/005_product_profiles.sql`, su homóloga en `migrations-mariadb` y `backend-node/test/integration/product-schema.ts`. Adaptar `backend-node/test/integration/mysql.test.ts`, `backend-node/db/demo-seed.mjs` y sus dos pruebas de semilla.

- [ ] Añadir pruebas para migrar desde 004 con un negocio y citas existentes, vincular una cuenta en dos negocios y rechazar un segundo perfil para la misma cuenta y negocio. Probar también esquema limpio y segunda ejecución de migraciones.
- [ ] Ejecutar la suite Docker de ambos motores y verificar que falla por ausencia del nuevo esquema.
- [ ] Añadir `businesses.sector VARCHAR(80) NULL`, `businesses.address VARCHAR(250) NULL`, `services.description VARCHAR(500) NULL` y `professional_invitations.revoked_at DATETIME(3) NULL`. Añadir `businesses.first_published_at DATETIME(3) NULL` y rellenar las filas públicas existentes con `created_at`. Mantener `uq_prof_business_user` y todas las FK, y crear `ix_prof_user_business (user_id,business_id,id)` no único. La restricción global está en la consulta del servicio de invitaciones y se elimina en la tarea 5. Usar datos existentes para verificar las FK.
- [ ] Vincular la semilla de los profesionales a cuentas ficticias de la propia demo con contraseña no utilizable y pertenencia activa. La semilla sigue ofreciendo dos profesionales y dos servicios, preserva citas creadas y conserva la guarda e idempotencia. Ajustar pruebas del piloto que construían un profesional sin vínculo y no cambiar las migraciones históricas.
- [ ] Añadir el fixture de actualización al arnés de `mysql.test.ts`. En un contenedor propio vacío, aplicar el prefijo 001–004 con el ejecutor, insertar datos compatibles con 004, aplicar la secuencia completa y repetirla. Ejecutar `bash ./scripts/test-mysql-integration.sh mysql` y `bash ./scripts/test-mysql-integration.sh mariadb` desde `backend-node`. Ejecutar además `./scripts/demo-local.ps1 -Dialect mysql -Mode test` y su variante `mariadb` para la semilla. Verificar versiones, limpieza y diff. Commit `Add product profile schema for both SQL dialects`.

## Tarea 2 · Pertenencias y autorización

**Archivos.** Crear `backend-node/src/product/contracts.ts`, `membership-store.ts`, `routes.ts` dentro del mismo subdirectorio y `backend-node/test/product-memberships.test.ts`. Conectar `backend-node/src/app.ts` y `runtime.ts`.

- [ ] Probar `GET /api/me/memberships` con dos negocios, perfil profesional en ambos, pertenencia inactiva excluida y visitante con 401. Probar que cliente autenticado sin pertenencias recibe `[]`.
- [ ] Ejecutar `node --import tsx --test test/product-memberships.test.ts` y confirmar fallo inicial.
- [ ] Implementar `listMemberships(actorId: string): Promise<Membership[]>`. Añadir consulta `getActiveMembership(connection, actorId, businessId)` reutilizable en transacciones. El endpoint obtiene `actorId` de la cookie y responde con `no-store`.
- [ ] Ejecutar la prueba dirigida, `npm test` y `npm run typecheck` en `backend-node`. Commit `Expose active GoodLook memberships`.

## Tarea 3 · Reserva, oferta e idempotencia

**Archivos.** Crear `backend-node/src/appointments/booking-locks.ts`, `backend-node/db/migrations/006_booking_integrity.sql` y su equivalente MariaDB. Modificar `backend-node/src/appointments/{service,routes,public-availability,availability}.ts` y añadir `backend-node/test/booking-integrity.test.ts` y `backend-node/test/integration/booking-integrity.ts`. Añadir su ejecución al arnés de integración.

- [ ] Añadir pruebas con dos conexiones y barreras explícitas para mismo profesional y local, misma cuenta y dos locales, intervalo adyacente, cierre, cambio de horario, precio y visibilidad, rollback y reintento sin duplicado. Añadir casos de jornada partida y cambio de hora. Confirmar que el protocolo actual falla al menos en carrera entre locales e idempotencia.
- [ ] Crear `professional_closures` con FK compuesta al perfil y `appointment_requests` con PK `(customer_user_id, request_key)`, hash del cuerpo normalizado y referencia a la cita. Añadir `professional_services.active BOOLEAN NOT NULL DEFAULT TRUE` para desasignar conservando la FK histórica. La consulta de ocupación por identidad incluye perfiles inactivos con citas vigentes.
- [ ] Implementar `lockBusiness(connection,businessId)`, `lockProfessionalUsers(connection,userIds)` y `lockProfessionalProfiles(connection,businessId,professionalIds)`. Orden global: clave idempotente si aplica, negocio, cuentas profesionales por ID, perfiles por ID, configuración y ocupación. Descubrir candidatos bajo negocio y revalidar la relación al adquirir sus bloqueos. Las escrituras de C y la vinculación de D respetan el protocolo. Consulta de ocupación actual bajo bloqueo, con solape `start_at < fin AND end_at > inicio`. Mantener bloqueantes `booked, completed, no_show`. Reintentar transacción completa hasta dos veces ante deadlock transitorio, con rollback antes de reintentar y sin repetir resultado incierto fuera de la clave idempotente.
- [ ] Exponer `POST /api/bookings` con cabecera `Idempotency-Key` UUID y cuerpo `{businessId,professionalId,serviceId,startAt,notes,quote}`. Devolver 201 y la cita si confirma, 200 con la misma cita si repite la misma solicitud, 409 `idempotency_conflict` si cambia el cuerpo, `offer_changed` con `quote` vigente si cambian condiciones o `slot_unavailable` si se pierde el hueco. Al informar de `offer_changed`, liberar por rollback la clave sin completar la reserva. La lógica anterior sigue disponible durante la transición.
- [ ] Exponer `GET /api/catalog/businesses`, `GET /api/catalog/businesses/:id/services`, `GET /api/catalog/businesses/:id/professionals?serviceId=…` y reutilizar `GET /api/appointments/availability`. Proyectar solo fichas públicas y profesionales activos vinculados, asignados con horario. Disponibilidad excluye cierres y ocupación en otros locales sin devolver detalles. Para la reserva, conservar la ventana UTC máxima de 168 horas y mostrar sus límites en la zona del negocio. Para la agenda usar la semana local completa aunque dure 167 o 169 horas.
- [ ] Ejecutar pruebas unitarias y ambos dialectos Docker. Volver a ejecutar las carreras con las mutaciones de C integradas y actualizar `RESERVAS.md` con el resultado. Commit `Serialize bookings and protect quoted terms`.

## Tarea 4 · Gestión de negocio y cambios de configuración

**Archivos.** Crear `backend-node/src/product/{management-routes,management-service,management-store}.ts` y `backend-node/test/product-management.test.ts`. Adaptar `backend-node/src/catalog/{routes,service,mysql-store}.ts` y `backend-node/src/professionals/{service,mysql-store}.ts` para compartir las mutaciones transaccionales.

- [ ] Probar permisos por rol, lectura de negocio privado propio, denegación ajena, publicación incompleta, desactivación con citas futuras, cambio de zona rechazado, publicación sin huecos después de desactivar y preservación de precio histórico. Añadir carrera entre revisión del impacto, reserva y escritura.
- [ ] Ejecutar `node --import tsx --test test/product-management.test.ts` y confirmar fallo inicial.
- [ ] Montar `/api/manage/businesses`. `POST /` crea una ficha privada y otorga propiedad al creador. `GET /:id` devuelve `{business, services, staff}` incluidas entidades privadas e inactivas. `PATCH /:id/profile` edita `{name,sector,address,timezone}`; `PUT /:id/visibility` cambia `{isPublic}`. Edición y publicación reservadas al propietario. Una primera publicación exige ficha completa y al menos una oferta habilitada.
- [ ] Como propietario o administrador, usar `POST /:id/services`, `PATCH /:id/services/:serviceId`, `POST /:id/staff`, `PATCH /:id/staff/:professionalId`, `PUT /:id/staff/:professionalId/services` con `{serviceIds}` y `GET/PUT /:id/staff/:professionalId/hours` con `{hours}`. Gestionar cierres por `GET/POST /:id/staff/:professionalId/closures` y `DELETE /:id/staff/:professionalId/closures/:closureId`. Desasignar mediante `professional_services.active` y reactivar la misma fila si se vuelve a asignar. Al publicar por primera vez fijar `first_published_at` en la transacción de visibilidad.
- [ ] Desactivar, retirar asignaciones y alterar horas o cierres con impacto mediante `409 impact_confirmation_required` con `{affectedCount, impactToken}`. Reenviar la misma mutación con `X-GoodLook-Impact`. Vincular el token a actor, negocio, operación y conjunto de citas afectadas, y revalidarlo bajo el bloqueo de B. Si cambia el impacto, devolver una vista nueva. Mantener las citas y rechazar `409 timezone_has_bookings` para cambio de zona con citas futuras confirmadas.
- [ ] Aplicar el mismo bloqueo a rutas antiguas que hagan esas escrituras, conservar su compatibilidad de respuesta durante la transición con adaptadores explícitos y probar que no pueden saltarse las reglas nuevas. Ejecutar suite dirigida, regresión de negocio y ambas integraciones. Commit `Manage published offers and staff safely`.

## Tarea 5 · Agenda privada e invitaciones

**Archivos.** Crear `backend-node/src/product/agenda-routes.ts`, `backend-node/src/product/agenda-store.ts` y `backend-node/test/product-agenda.test.ts`. Ampliar `backend-node/src/invitations/{routes,service,mysql-store}.ts` y sus pruebas. Ampliar la proyección de citas propias con consultas acotadas.

- [ ] Probar enlaces caducados, revocados o regenerados, dos aceptaciones simultáneas, misma cuenta en dos locales, administrador ajeno, profesional que pide otra agenda y cita futura de un perfil desactivado visible al administrador. Probar semana con DST y ausencia de email, teléfono y detalles de otros negocios.
- [ ] Ejecutar las pruebas dirigidas de agenda e invitaciones y confirmar los fallos de contrato.
- [ ] Extender emisión existente `POST /api/invitations`, revocación `DELETE /api/manage/businesses/:id/staff/:professionalId/invitation` y aceptación `POST /api/invitations/accept`. Reemitir marca las invitaciones pendientes anteriores con `revoked_at`. Conservar vigencia de siete días y almacenar solo hash. El enlace lleva el fragmento `/invitacion#token=…`. El cliente lo elimina tras leerlo, guarda el token en memoria hasta confirmar y evita registrarlo. Localizar el negocio por hash mediante una lectura inicial y volver a validar el token bajo los bloqueos de B. Limitar la comprobación de perfil asignado a `(business_id,user_id)` y mantener roles activos preexistentes.
- [ ] Implementar `GET /api/agenda?businessId&professionalId&weekStart`, con `weekStart` lunes local `YYYY-MM-DD`. Derivar límites UTC vía zona IANA en servidor y devolver `{timezone,from,to,hours,closures,appointments: AgendaItem[]}`. Profesionales solo ven perfil propio de una pertenencia activa. Propietarios y administradores ven los del negocio, incluidos perfiles históricos. Derivar nombres por joins acotados y devolver tiempos ISO.
- [ ] Implementar `GET /api/me/bookings?from&to&cursor` con fechas ISO y respuesta `{items: CustomerAppointment[], nextCursor: string|null}`. Devolver hasta 100 citas por página, ordenadas por `startAt,id`. Limitar cada consulta a 31 días y validar el cursor. Consultar por identidad de sesión y conservar precio y moneda guardados y la duración derivada de inicio y fin. Mantener `/api/appointments/me` compatible.
- [ ] Ejecutar `npm test`, `npm run typecheck` y las pruebas Docker de roles y carreras de invitaciones. Commit `Expose scoped weekly agenda and invitations`.

## Tarea 6 · Prueba de librerías y dirección visual

**Archivos.** Prototipos temporales en worktrees aislados de `FrontEndGoodLook`. Conservar `FrontEndGoodLook/docs/decision-ui.md` como evidencia y registrar licencia/origen de fotografías y fuentes que pasen al producto.

- [ ] Verificar versión estable de Angular 22 y las peer dependencies de Material/CDK y PrimeNG. Reproducir `npm run build -- --configuration=pilot` como referencia. Si hay actualización imprescindible, aislarla en un commit y repetir la referencia.
- [ ] Implementar en ambos prototipos el mismo selector de hueco con confirmación y la misma agenda semanal con lista alternativa. Probar 360 px y escritorio, tabulación, foco de diálogo, contraste y zoom 200 %. Medir el peso inicial y del chunk diferido en builds equivalentes.
- [ ] Elegir un único kit según las mediciones. Usar el resultado de la comparación para definir tokens de marfil, verde oscuro y terracota, títulos y cuerpo legibles, imágenes realistas con derechos claros. Revisar que las fotos no sugieran que representan a un establecimiento concreto sin evidencia.
- [ ] Guardar versiones, resultados, límites y elección. Ejecutar `git diff --check` y commit `Record GoodLook UI framework decision`.

## Tarea 7 · Entrada, navegación y sesión Angular

**Archivos.** Crear `FrontEndGoodLook/src/app/product/{shell.component,product.routes,session.service}.ts`, `product/api/{contracts,product-api.service}.ts`, `src/main.product.ts`, `src/index.product.html`, `src/styles.product.css` y `tsconfig.product.json`. Configurar target `product` en `angular.json`, sin cambiar aún el build de publicación. Mantener tests de producto en `src/app/product`.

- [ ] Probar navegación con visitante, cliente, profesional y dueño, recarga directa en ruta privada, sesión expirada y acceso cruzado. Confirmar fallo inicial.
- [ ] Crear rutas diferidas `/`, `/negocios/:id`, `/reservar/:id`, `/acceso`, `/mis-citas`, `/mi-agenda`, `/gestion`, `/invitacion`, y alias `/piloto` hacia el catálogo. Usar páginas mínimas compilables en las rutas cuya pantalla desarrollan las tareas 8–10. La tarea 7 implementa la pantalla de acceso en `product/access/access-page.ts`. Usar sesión HttpOnly existente y caché en memoria de pertenencias, invalidada al salir o recibir 401. Permitir retorno exclusivamente a rutas internas del router. Si un responsable tiene un perfil profesional vinculado, mostrar también Mi agenda para ese perfil. La carcasa muestra navegación por rol, marca, conexión y foco inicial al navegar.
- [ ] Crear tokens y componentes para formularios, carga, estado vacío, error y confirmación. Aplicar la dirección visual a pantallas nuevas. Mantener los secretos y la sesión fuera de almacenamiento web. Usar el target para dev con proxy mismo origen.
- [ ] Ejecutar `npm run build -- --configuration=product` y pruebas Angular de producto con `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/product/**/*.spec.ts'`. Verificar también build `pilot`. Commit `Add role-based GoodLook Angular shell`.

## Tarea 8 · Catálogo, reserva y Mis citas

**Archivos.** Crear componentes y pruebas en `FrontEndGoodLook/src/app/product/customer/` (`catalog-page`, `business-page`, `booking-page`, `my-bookings-page`).

- [ ] Probar orden servicio → profesional → hueco, acceso con recuperación de la selección en memoria, descarte de respuesta obsoleta, `offer_changed`, `slot_unavailable`, reintento con la misma clave cuando la respuesta es incierta y lectura del precio histórico tras recargar. Confirmar fallo inicial.
- [ ] Consumir catálogo, disponibilidad y `POST /api/bookings`. Mostrar precio, fecha, profesional y zona antes de confirmar. Tras registrarse, iniciar sesión explícitamente porque la API de registro no crea sesión. Conservar selección si falla el hueco y pedir nueva aceptación cuando cambien condiciones. Generar clave al iniciar una confirmación y conservarla durante reintentos del mismo cuerpo. Mostrar estado de la cita únicamente tras respuesta del servidor.
- [ ] Construir Mis citas desde `GET /api/me/bookings` con próximas citas y navegación de periodos. Mostrar confirmación y detalle con etiquetas y mensajes de error identificables por lector de pantalla. Mantener nota opcional y advertencia breve.
- [ ] Pasar pruebas de producto, build `product` y recorrido cliente con Docker. Commit `Build customer catalog and appointment flow`.

## Tarea 9 · Mi agenda semanal

**Archivos.** Crear componentes y pruebas en `FrontEndGoodLook/src/app/product/agenda/` (`weekly-agenda-page`, `agenda-list`, `agenda-grid`, `week-navigation`).

- [ ] Probar semana con DST, negocio con zona distinta a la del dispositivo, dos pertenencias, semana vacía y visualización del estado y notas. Confirmar fallo inicial.
- [ ] Consumir `GET /api/agenda`. Navegar fechas locales de lunes a domingo, sin sumar a instantes UTC una cantidad fija de horas. Diferenciar horario, cierres y citas. Lista por día como vista móvil y alternativa de la cuadrícula por teclado. Reutilizar `agenda-list` en Gestión.
- [ ] Pasar pruebas de producto, build y navegación semana anterior/siguiente con un profesional ficticio. Commit `Build professional weekly agenda`.

## Tarea 10 · Gestión

**Archivos.** Crear componentes y pruebas en `FrontEndGoodLook/src/app/product/management/` (`management-page`, `business-profile`, `service-editor`, `staff-editor`, `schedule-editor`, `team-agenda`, `invitation-page`).

- [ ] Probar creación privada y publicación, precio con entrada decimal en la UI, período semanal, cierre con aviso actualizado, invitación copiable/revocable y ausencia de botones de propietario para administrador. Confirmar fallo inicial.
- [ ] Consumir `/api/manage/businesses` y acciones de invitación. Editar ficha, servicios, equipo y asignaciones, tramos y cierres. Convertir texto introducido a céntimos enteros sin multiplicar un decimal binario sin validación. Mostrar impacto antes de confirmar y el motivo si se rechaza un cambio de zona. El selector de equipo alimenta la agenda común.
- [ ] Pasar las pruebas de producto, build y recorrido del responsable en Docker. Commit `Build business management and staff onboarding`.

## Tarea 11 · Instalación y caché

**Archivos.** Crear `FrontEndGoodLook/src/manifest.product.webmanifest`, `FrontEndGoodLook/ngsw-product.json`, iconos y `FrontEndGoodLook/src/app/product/install/update.service.ts`. Integrar en `angular.json`, entrada de producto y shell.

- [ ] Probar que el build genera manifiesto, iconos de 192 y 512 px, service worker y recursos iniciales. En Playwright, probar actualización, navegación offline, cierre de sesión, recarga offline y petición fallida de reserva.
- [ ] Aplicar `start_url: /`, `scope: /`, nombre GoodLook y presentación standalone. Cachear recursos de interfaz y excluir `/api/**` de navegación y almacenamiento del worker; las respuestas privadas se mantienen fuera de caché. Detectar falta de red y ofrecer reintento. Informar al usuario antes de recargar una actualización para preservar una reserva en curso.
- [ ] Verificar en navegador sobre loopback o HTTPS. Registrar por separado instalación, apertura, actualización, sesión y offline en Android/Chrome e iOS/Safari reales. Para dispositivos reales usar HTTPS con backend aislado de producción. Registrar modelo, navegador y resultado o falta de dispositivo. Commit `Package GoodLook as an installable PWA`.

## Tarea 12 · Aceptación, CI y preparación de release

**Archivos.** Crear `FrontEndGoodLook/playwright.config.ts`, `FrontEndGoodLook/e2e/product-flow.spec.ts` y `.github/workflows/goodlook-product.yml`; adaptar el runner Docker de `backend-node/db/demo-local.mjs` para automatización si necesita una forma de espera y parada comprobable; documentar en `FrontEndGoodLook/PILOTO.md` y `docs/migracion/ESTADO.md`.

- [ ] Automatizar registros sintéticos y ciclo propietario → invitación → profesional → publicación → cliente → Mis citas → agenda. Crear un contexto por sesión. Cubrir precio modificado, reintento, acceso ajeno y relectura después de recargar. Datos temporales, sin dependencia de cuentas remotas.
- [ ] Añadir CI con Node compatible, compilación, pruebas de frontend, API y migrador, MySQL y MariaDB en serie con Docker y Playwright. Ejecutar el E2E con build local del target producto y mismo origen. Comprobar limpieza tras error y recoger artefactos sin cookies ni notas privadas.
- [ ] Preparar los cambios de `package.json` y `vercel.json` como commit separado para el corte, con salida del build `product`, rutas de assets y API intactas, soporte de rutas directas y compatibilidad con `/piloto`. La revisión de este commit documenta SHA, migraciones nuevas, copia y restauración verificadas, revisión de proxy y protección de sesión, entornos preview separados para pruebas que escriban y chequeo HTTP posterior. Si falla una migración DDL, conservar su estado y aplicar el procedimiento de recuperación probado con la copia. Los DDL pueden hacer commit implícito. Mantener despliegues anteriores y MonsterASP durante el desarrollo. Integrar a `main` mediante PR y publicar en una acción de release específica.
- [ ] Actualizar estado con resultados observados y registrar por separado la verificación en dispositivos. Commit `Automate GoodLook product acceptance`.

## Seguimiento tras la primera entrega

- **Operación.** Definir estados de cita y políticas de cancelación/reprogramación antes de usarlos en informes y disparadores. Preparar un plan para correo con cola persistente, idempotencia, reintentos y registros de entrega y otro para informes mensuales por negocio y profesional con clientes únicos. Seleccionar proveedor y canales con costes acordados. Recoger retención, alertas, copias y restauración en el bloque de seguridad y operación.
- **Descubrimiento.** Preparar un plan para ciudad, geolocalización opcional, distancia aproximada y filtros de precio/servicio. Definir uso de coordenadas y validar proveedor, licencia y coste.
- **Confianza.** Tras existir el estado verificable de cita completada, definir una reseña por cita, edición, moderación, denuncia, respuesta y métricas de media y volumen. Incorporar ranking tras validar esos datos.
