# API GoodLook: base inicial

Servicio independiente en desarrollo con Node 24, Express 5 y TypeScript. Solo ofrece `GET /health` y respuestas de error JSON. Todavía no tiene autenticación, base de datos, lógica de reservas ni preparación para producción; no sustituye a la API .NET.

```bash
npm ci
npm test
npm run typecheck
npm run build
npm start
```

`PORT` es opcional; el valor por defecto es 3000. No configurar credenciales en este repositorio.
