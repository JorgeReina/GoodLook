# Referencia técnica inicial

Base `ce0a9b0`, revisión 15-11-2026. Los datos de la instalación son ficticios, según confirma el propietario.

## Compilación y pruebas del frontend legado

- `npm ci --ignore-scripts --no-audit --no-fund`: completado.
- `npm run build`: completado con avisos por presupuesto de estilos y bundle, y dos selectores CSS omitidos. Node 24.22.1 se usó para este ensayo; Angular 16 no declara soporte para Node 24, por lo que el resultado no equivale a un entorno soportado.
- `npm test -- --watch=false --browsers=ChromeHeadless`: la compilación de tests terminó, pero Chromium no pudo arrancar por `socket() failed: Operation not permitted`. No se ejecutaron los casos. No hay SDK .NET en este entorno y no se ha ejecutado el backend legado.

## Inventario de controladores

| Método y ruta legada | Roles declarados | Alcance existente / decisión |
|---|---|---|
| POST api/User/signup, POST api/User/login | Público | Registro y acceso; rehacer sin entregar hashes ni preservar contraseñas ficticias. |
| GET api/User/userlist | user, barber, admin | Listado incluye hash; no replicar exposición global. |
| GET api/User/getuser | user, admin, barber, invitado | Recibe ID; verificar autorización de objeto y limitar campos. |
| POST api/User/updateUser; DELETE api/User/deleteUser | user | Reciben userId del cliente; derivar identidad en servidor. |
| GET api/Admin/barberList | admin, user, barber, invitado | Lista profesionales, sustituir por consultas acotadas a negocio. |
| GET api/Admin/getBarber; POST api/Admin/createAdmin, createBarber; DELETE api/Admin/deleteBarber | admin | Administración; exigir rol por negocio, transacción y no devolver hashes. |
| GET api/Barber/dateList | barber | Recibe ID de usuario; nueva API solo debe devolver agenda autorizada. |
| GET api/Date/dateList | user, admin, invitado | Recibe ID; verificar propietario y alcance de negocio. |
| GET api/Date/getDate | user, admin | Consulta horario por email y hora; sustituir por disponibilidad basada en intervalos. |
| POST api/Date/createDate | user, admin, invitado | Recibe ID ajeno y no protege contra carrera; derivar identidad y reservar atómicamente. |

Esto es un inventario estático, no una prueba de que todas las rutas funcionen ni una especificación definitiva. GuestController no declara endpoints HTTP propios en el código revisado.

## Próximos pasos

1. Hacer funcionar las pruebas del frontend en un entorno compatible con la versión legada y disponer de .NET + MySQL aislados para caracterización, si aporta valor frente a una reconstrucción controlada.
2. Completar contrato OpenAPI del backend nuevo, esquemas y pruebas de autorización antes de conectarlo al frontend.
3. Comparar migración mayor a mayor con una nueva base Angular utilizando la guía oficial y registrando pruebas de ambas opciones; no sustituir aún el frontend existente.
4. Modelar empresas, miembros, profesionales, servicios y reservas con pruebas de aislamiento y solapamiento; usar datos sintéticos nuevos.
