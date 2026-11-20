# Integración con MySQL real

Requisitos: Node 24, dependencias `npm ci`, Docker Engine con Compose y puerto 33317 libre en loopback. Ejecutar desde `backend-node`:

```bash
./scripts/test-mysql-integration.sh
```

El lanzador crea un proyecto Compose aleatorio, MySQL 8.4 en tmpfs, base y credenciales ficticias; espera a que esté preparado y destruye únicamente su proyecto al terminar. Las pruebas solo aceptan el puerto y base fijos de pruebas, verifican el hostname del contenedor creado y que la base esté vacía antes de crear tablas. No usar datos reales. El puerto debe estar libre; no usar una base ya existente. La prueba cubre esquema, sesión real, aislamiento de empresas y dos reservas simultáneas. Las credenciales están diseñadas exclusivamente para el contenedor local efímero.

El comando falla de forma explícita si Docker no está disponible. No se ha ejecutado en el entorno de creación sin Docker; validar en un equipo con Docker antes de considerar comprobados MySQL y concurrencia. No es una prueba integral de navegador (E2E) ni cubre todas las funcionalidades.
