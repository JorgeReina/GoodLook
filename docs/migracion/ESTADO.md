# Estado de migración GoodLook

Fecha: 2026-11-15. Base: commit ce0a9b0107edbfe61a8b012fdd8a0712edf93f36.

## Contexto confirmado

La aplicación está desplegada, sin usuarios activos; los datos son ficticios y se pueden modificar. Se propone una base de datos nueva versionada para el backend nuevo, sin migración de cuentas ni hashes. El servicio público actual puede presentar riesgos identificados; no se ha modificado ni comprobado dinámicamente.

## Equipo

Se definen agentes de proyecto en `.codex/agents/` para Project Manager, developer, tester y UX/UI. Son configuraciones reutilizables de Codex, no procesos permanentes ni mascotas. En esta sesión se delegó la revisión a tres especialistas y el coordinador integró hallazgos; los resultados fueron análisis estáticos.

## Evaluación inicial

- Frontend: Angular 16 basado en NgModules y builder antiguo; formularios y flujos existentes útiles como referencia. La comparación migración incremental frente a nueva aplicación sigue pendiente de una prueba de compilación y actualización.
- API antigua: datos de prueba, sin necesidad de conservar contraseñas o compatibilidad insegura. Debe reemplazarse gradualmente sin conectar la nueva API a producción.
- QA: priorizar alta/acceso, roles, reservas, agenda y pruebas negativas de acceso entre usuarios, exposición de hashes y dobles reservas simultáneas.
- UX: corregir etiquetas de formularios, confirmaciones y estados de error; en fase posterior diseñar interfaz móvil y agenda accesibles.

## Seguimiento

- GL-001: parcialmente identificado; estado de uso confirmado por el propietario. Hosting, detalles operativos y credenciales quedan por identificar sin publicar secretos.
- GL-002: riesgos conocidos por lectura estática; mitigación en despliegue existente pendiente. No se ha demostrado explotación.
- GL-003: inventario parcial en documentación; falta matriz completa y validación dinámica.
- GL-004: restauración no realizada. Dado que no hay datos reales que conservar, evaluar si es necesaria antes de sustituir el entorno.
- GL-005 a GL-024: pendientes salvo avances explícitos en commits posteriores.

## Verificación de referencia

El build del frontend legado pasó con avisos usando Node 24 fuera de la matriz soportada de Angular 16. La ejecución de Karma no pudo arrancar Chromium por restricciones de sockets; .NET no está instalado. Detalles y matriz estática de rutas en [BASELINE.md](BASELINE.md).
