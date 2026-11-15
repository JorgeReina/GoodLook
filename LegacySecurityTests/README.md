# Prueba de seguridad de respuestas del backend legado

Con .NET SDK 8, ejecutar desde la raíz:

```bash
dotnet run --project LegacySecurityTests/LegacySecurityTests.csproj
```

La prueba ejecuta los mapeadores de respuesta reales de UserController (signup, userlist) y AdminController (createAdmin, createBarber) con datos sintéticos. Comprueba que el JSON contiene los campos públicos esperados, pero nunca la propiedad password ni el hash. No usa una base de datos ni reproduce las peticiones HTTP; no demuestra que la autorización sea correcta.

La prueba usa EF Core InMemory con datos sintéticos para comprobar el rechazo de identificadores ajenos en perfil, edición, borrado, listados de citas y creación; también comprueba los flujos propios, acceso de administración a perfiles y el subject de un JWT firmado. No inicia el servidor ni verifica la capa HTTP, MySQL, reservas simultáneas o autorización de todas las rutas. El listado global de usuarios sigue expuesto a varios roles y requiere corrección separada.

El token de sesión incorpora ahora el identificador estable en `sub`: el backend rechaza los tokens anteriores sin `sub`, por lo que, si se despliega, todos los usuarios deben iniciar sesión de nuevo. El despliegue requiere validar antes el comportamiento del frontend ante esa expiración.
