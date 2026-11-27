# Vinculación de profesionales

Contrato vigente, montado por el proceso de `backend-node`. Índice: [`backend-node/README.md`](../../README.md). Rutas: [`openapi.yaml`](../../openapi.yaml).

Una persona administradora con membresía activa emite un token aleatorio por perfil activo y sin vincular. La base conserva su SHA-256. El token caduca a los siete días y puede consumirse una sola vez. El responsable recibe el token para compartirlo por un canal privado. El enlace de producto lleva el token en el fragmento, que el cliente elimina al leerlo. Mantenerlo fuera de la ruta, la consulta, los registros y las analíticas. La persona invitada inicia sesión y envía el token en el cuerpo POST.

Rutas disponibles para montaje en `/api/invitations`:
- POST `/` con `{businessId, professionalId}` devuelve el token al propietario o administrador activo y revoca invitaciones vigentes para el mismo perfil.
- POST `/accept` con `{token}` vincula a la persona de la sesión.
- DELETE `/api/manage/businesses/:id/staff/:professionalId/invitation` revoca las invitaciones vigentes del perfil y responde 204 al responsable autorizado.

Las tres operaciones requieren origen y sesión y responden con `Cache-Control: no-store`. El servidor bloquea negocio, cuenta y perfil en ese orden al aceptar, y comprueba el token dentro de la transacción. Conserva el rol de una membresía activa existente. La misma cuenta puede vincularse a un perfil por negocio. Se rechazan membresías inactivas, perfiles ocupados o inactivos, y tokens inválidos, expirados, revocados o consumidos.

La revocación usa la columna `revoked_at` de la migración 005 en ambos dialectos. La limpieza de invitaciones expiradas y la protección específica contra abuso se contemplarán en el trabajo de operación.
