# Vinculación de profesionales

Una persona administradora con membresía activa emite un token aleatorio por perfil activo y no vinculado. En la base solo se conserva su SHA-256; el token caduca a los siete días y solo puede consumirse una vez. Se devuelve una sola vez al administrador para que lo entregue por un canal privado. No se envía correo automáticamente. **No incluir el token en URL, logs ni analíticas**; la persona invitada debe tener sesión iniciada y enviarlo en el cuerpo POST.

Rutas disponibles para montaje en `/api/invitations`:
- POST `/` con `{businessId, professionalId}`; emisor debe ser owner/admin activo, devuelve token.
- POST `/accept` con `{token}`; acepta explícitamente el usuario de la sesión. No acepta un ID de usuario arbitrario.

Ambas operaciones requieren origen y sesión, las respuestas son `no-store`. La aceptación bloquea la cuenta, token y profesional dentro de una transacción; crea la membresía solo si no existe, sin elevar ni rebajar roles. Rechaza membresía inactiva, perfil ocupado o inactivo, cuenta ya asociada a cualquier otro perfil, token inválido, expirado o consumido. Rechazar una cuenta ya vinculada en otra empresa es una política provisional acordada para esta fase; si el producto permite multiempresa habrá que revisarla junto con una restricción de concurrencia apropiada.

Esta protección depende de que todas las vías de vinculación respeten el bloqueo de la fila de usuario. MySQL real, carreras con dos conexiones, limpieza de invitaciones expiradas, revocación y rate limiting siguen pendientes. No desplegar sin pruebas de integración ni protección contra abuso. La migración `002_professional_invitations.sql` debe aplicarse después de `001_initial.sql`.
