# Prueba de seguridad de respuestas del backend legado

Con .NET SDK 8, ejecutar desde la raíz:

```bash
dotnet run --project LegacySecurityTests/LegacySecurityTests.csproj
```

La prueba ejecuta los mapeadores de respuesta reales de UserController (signup, userlist) y AdminController (createAdmin, createBarber) con datos sintéticos. Comprueba que el JSON contiene los campos públicos esperados, pero nunca la propiedad password ni el hash. No usa una base de datos ni reproduce las peticiones HTTP; no demuestra que la autorización sea correcta.
