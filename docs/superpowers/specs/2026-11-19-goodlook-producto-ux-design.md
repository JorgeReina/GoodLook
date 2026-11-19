# GoodLook · rediseño y primera entrega de producto

Fecha: 2026-11-19. Base de partida: `74c9219` de `work/goodlook-migracion`.

## Objetivo y alcance

Evolucionar el piloto a una aplicación de reservas para negocios de belleza y cuidado personal. La primera entrega reúne tres recorridos: reservar una cita, consultar la semana de un profesional y configurar lo necesario para que el negocio pueda recibir reservas. Mantener una sola marca y una experiencia instalable para todos los roles.

Una prueba en Docker deberá demostrar que un responsable configura un servicio con precio, incorpora a un profesional y publica su disponibilidad. Un cliente reserva con ese profesional y la cita aparece tanto en Mis citas como en la agenda de la semana correspondiente.

## Enfoques considerados

- **Una app Angular con espacios por rol.** Comparte sesión, rutas, componentes, instalación y configuración PWA. Una persona puede reservar aunque tenga también un rol en un negocio. Exige separar las vistas, las consultas y los permisos por espacio.
- **Dos apps Angular con marca común.** Da autonomía a las interfaces pública y operativa, a cambio de dos compilaciones, instalaciones y experiencias para quienes alternan entre roles.

Se eligió una app con espacios por rol. La web pública de la nueva app tendrá la entrada principal; `/piloto` conservará un acceso compatible al nuevo recorrido cuando se publique el reemplazo. La transición de rutas se verificará en el build publicado y el backend antiguo permanece separado durante el desarrollo.

## Identidad y navegación

Propuesta visual: fondo marfil, texto verde oscuro, acentos terracota con contraste verificado y fotografía realista de peluquería, estética, barbería y otros servicios. Tipografía expresiva en títulos y legible en controles y datos. El catálogo usa la fotografía para ayudar a descubrir servicios. En áreas privadas se priorizan horas, precios, estados y acciones.

- **Público y cliente.** Explorar negocios publicados, iniciar sesión o registrarse al confirmar, y acceder a Mis citas. Mantener la selección si se autentica durante la reserva y volver a consultar el hueco antes de confirmar.
- **Profesional.** Entrar en Mi agenda y cambiar de semana o negocio autorizado. En móvil, ofrecer una lista agrupada por día; en escritorio, una vista semanal con alternativa en lista. Mostrar zona horaria, huecos de trabajo y citas diferenciados, cliente por nombre visible, servicio, hora, estado y nota breve.
- **Responsable (propietario o administrador).** Entrar en Gestión, seleccionar un negocio autorizado y acceder a perfil y visibilidad, equipo e invitaciones, servicios y precios, asignaciones, horarios y agenda por profesional. Los espacios disponibles se derivan de la sesión y de las pertenencias devueltas por el servidor.

Probar el mismo paso de reserva y vista de agenda con Angular Material/CDK y PrimeNG sobre Angular 22. Material/CDK es el punto de partida propuesto para formularios, diálogos y teclado. Elegir una base principal con una compilación real, compatibilidad de pares, licencia, peso, teclado, zoom al 200 %, móvil y capacidad de aplicar la identidad. Usar una lista accesible como alternativa siempre disponible a la cuadrícula. Verificar la versión estable 22.x disponible al iniciar y actualizar en un cambio separado si es necesario.

## Recorridos y reglas de la primera entrega

### Cliente

Consultar negocios publicados y sus servicios, con duración, precio y moneda. Elegir un profesional activo asignado y un hueco ofrecido por el servidor. Mostrar fecha, zona, importe y profesional antes de confirmar. Si cambia el precio, la moneda o la duración, mostrar las nuevas condiciones y pedir una nueva confirmación. Admitir una nota opcional de hasta 500 caracteres, con un aviso breve para evitar datos sensibles. Mostrar confirmación y resumen de la cita guardada. Si el hueco desaparece, conservar la selección y ofrecer nuevas horas. Mis citas utiliza el precio y la duración guardados al reservar.

### Profesional y negocio

Un propietario puede crear y editar su negocio y cambiar su visibilidad explícitamente. La ficha incluye nombre, sector, dirección del local y zona horaria. Para esta entrega cada negocio representa un local. El panel permite crear y actualizar servicios, incluidos descripción, duración, precio y moneda, y activar o desactivar su oferta. Permite crear y desactivar profesionales sin borrar historial, asignarles servicios, definir tramos semanales y registrar excepciones puntuales de cierre. Los profesionales activos y asignados pueden aparecer como opción pública cuando el negocio está publicado. Una invitación de un solo uso y con caducidad vincula al profesional con una cuenta. El responsable comparte el enlace por el canal acordado fuera de la app durante esta entrega y puede revocarlo o regenerarlo.

El responsable puede consultar la agenda del equipo filtrando por profesional. El profesional vinculado consulta su propia agenda y horario en cada negocio autorizado. Se muestran los datos de cliente necesarios para atender la cita, sin añadir correo ni teléfono. El alcance inicial incluye reservar y consultar. Cancelar y reprogramar requieren una política explícita y se planifican dentro del bloque de reservas antes de ofrecerlos en la interfaz.

### Decisiones propuestas para la primera entrega

- El propietario edita el perfil del negocio y su visibilidad. Propietarios y administradores autorizados gestionan equipo, servicios, horarios y agenda. La interfaz incorpora profesionales mediante invitación. El alta y la revocación de administradores se aplazan.
- El catálogo ofrece únicamente profesionales vinculados a una cuenta, activos, asignados y con horario configurado. La primera publicación exige al menos una oferta configurada. Si después el negocio queda sin huecos u oferta reservable, la ficha publicada muestra un estado de disponibilidad vacía.
- La misma cuenta profesional no puede aceptar citas simultáneas en dos negocios. El servidor bloquea y comprueba ocupación por identidad profesional vinculada. Cada negocio solo ve sus citas y los intervalos reservables; nunca recibe detalles de citas de otro negocio.
- Un cierre, un cambio de horario o la desactivación de un servicio o profesional afectan a nuevas reservas. Las citas confirmadas se conservan y el panel avisa de futuras citas afectadas antes de aplicar el cambio. Los administradores conservan acceso a esas citas. El cambio de zona horaria se rechaza mientras haya citas futuras confirmadas.

## Backend y datos

Reutilizar la sesión con cookie y las API actuales donde cubran el contrato. Añadir una lectura privada de pertenencias y negocios, catálogo y equipo de gestión (incluye registros privados e inactivos), mutaciones faltantes, disponibilidad por asignación y una respuesta tipada de agenda. La vista pública filtra por estado y solo expone datos públicos. La API debe poder representar que la misma cuenta trabaja en varios negocios; revisar la restricción global del vínculo profesional existente y preservar la unicidad por negocio. La agenda normaliza fechas ISO en UTC y devuelve únicamente los campos necesarios para el rol y el negocio autorizado; la semana visible se calcula en la zona IANA del negocio, incluso durante cambios de hora.

Todas las lecturas privadas y operaciones de edición autorizan por pertenencia activa y, para el profesional, por vínculo con su perfil. Los cambios que afectan a disponibilidad respetan el mismo protocolo transaccional que la reserva. El bloque 2 de migración aporta el orden de bloqueos, excepciones e idempotencia para los reintentos. Se deben probar carreras entre reservas y entre una reserva y cambios en servicio, horario o publicación. Las citas existentes conservan historial, precio, moneda y duración; los cambios de catálogo afectan a reservas futuras. Las migraciones serán incrementales y se probarán en MySQL y MariaDB. Usar datos sintéticos y recursos Docker aislados.

## Instalación y estados de red

La compilación de producción del piloto desactiva el service worker aunque la app anterior incluya un manifiesto. El build de la nueva app debe emitir su propia configuración de instalación con nombre, iconos, comienzo, alcance y estrategia de actualización verificados. Servir por HTTPS. La caché se limita a los recursos de interfaz; las respuestas de API, citas, sesión y datos personales se mantienen fuera de la caché. Sin conexión, informar del estado y ofrecer volver a intentar cuando se recupere la red. Confirmar una reserva requiere respuesta del servidor. Verificar instalación, apertura, actualización y sesión en Android/Chrome e iOS/Safari. La propuesta inicial cubre instalación desde el navegador; las tiendas se pueden evaluar como entrega independiente si se requieren.

## Entregas siguientes

1. **Operación.** Confirmación y recordatorio por correo con cola persistente, reintentos y estado de entrega. Informes mensuales con citas completadas, cancelaciones y clientes únicos por negocio y profesional, usando la zona horaria del negocio. Decidir proveedor, financiación y canales antes de contratarlos. Completar permisos, retención, observabilidad, copias y restauración según el bloque 3.
2. **Descubrimiento y confianza.** Búsqueda manual por ciudad y ubicación opcional, distancia aproximada y filtros de servicio y precio. Una reseña verificable por cita completada, edición, denuncia, moderación y respuesta. Mostrar media y cantidad de reseñas antes de incorporar ranking. Seleccionar geocodificación tras validar coste, licencia y datos requeridos.
3. **Calidad y publicación.** Incorporar E2E de los tres roles a CI y documentar comprobaciones y recuperación. Reservar MonsterASP para la release y atender el acceso compartido entre preview y producción antes de usar datos reales en preview. La aceptación local y la publicación son hitos distintos.

## Aceptación de la primera entrega

- El propietario crea un negocio privado y configura un servicio y su precio. El profesional acepta su invitación y el responsable configura su asignación y horario. Después el propietario publica la ficha. Un visitante ve solo la oferta publicada.
- El cliente elige ese servicio, profesional y hueco, inicia sesión si procede, añade una nota opcional y confirma. Mis citas conserva la cita y su importe tras recargar. Un reintento de la misma operación no duplica la cita y dos clientes no ocupan el mismo hueco.
- El profesional ve esa cita en su semana y solo accede a sus propios datos de agenda. El administrador puede filtrarla y un usuario ajeno queda excluido. Los cambios de precio mantienen intactos los importes de las citas ya creadas. Una reserva en otro negocio no puede ocupar el mismo intervalo de la cuenta vinculada y los cierres no cancelan citas existentes.
- Los flujos tienen estados de carga, vacío, error y confirmación, se completan con teclado y se comprueban en móvil, escritorio y zoom al 200 %. Se guarda evidencia de instalación en los dispositivos objetivo.
- Las pruebas de API, migración y carreras se ejecutan en Docker con datos sintéticos. La comprobación de la instalación en dispositivos y el posterior despliegue se registran por separado.

## Organización para el plan

Separar contratos y permisos de negocio, integridad de reservas y cambios de disponibilidad, interfaz pública y privada, y PWA y pruebas. El contrato de API y los componentes compartidos se integran antes de unir el catálogo, la agenda y Gestión. Cada rama tiene propietario de archivos, pruebas propias y punto de integración en la rama de migración. Para la rama principal se prepara un PR.

El plan de implementación fijará nombres definitivos de endpoints y rutas, componentes concretos, orden de migraciones, datos sintéticos y herramientas de prueba. Las decisiones de primera entrega sobre un local, precios por servicio, sesión requerida para confirmar, invitación manual y PWA de navegador se presentan como propuestas de alcance para revisión.
