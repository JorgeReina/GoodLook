# Piloto de la nueva API

La ruta `/piloto` utiliza rutas relativas `/api` con cookies HttpOnly, sin localStorage ni token de la versión anterior. Requiere la nueva API y una base aislada con negocios, servicios, asociaciones y horarios de prueba; no funciona con la API .NET. El backend debe permitir el mismo origen del navegador mediante `APP_ORIGIN`.

Para desarrollo local, con la API escuchando en 127.0.0.1:3000 y `APP_ORIGIN=http://localhost:4200`, ejecutar `npx ng serve --host localhost --proxy-config proxy.pilot.json` y abrir `http://localhost:4200/piloto`. Usar localhost de forma coherente: el backend valida el Origin y las cookies son Secure. En producción se necesita un proxy HTTPS mismo origen; no exponer el backend de desarrollo.

El catálogo debe contener datos. El piloto consulta horarios orientativos de los próximos siete días para la combinación seleccionada, mostrados en la zona horaria del negocio con su desplazamiento UTC. La API comprueba de nuevo la disponibilidad al reservar; si hay conflicto hay que actualizar los horarios. Las combinaciones sin asociación pueden rechazarse. El piloto requiere pruebas funcionales de navegador y MySQL antes de utilizarse con clientes.
