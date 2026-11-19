# Base de interfaz de GoodLook

## Decisión

Usar **Angular Material/CDK** como único kit para el producto. El prototipo compiló con las versiones fijadas en el piloto y permitió probar la selección de hueco, el diálogo y la agenda con teclado, a 360 px y con zoom real del 200 %. El kit tiene licencia MIT. Mantener radios, tabla y lista en HTML semántico, y reservar Material/CDK para botones, diálogos y controles que necesiten su comportamiento. Diferir las rutas de reserva y agenda.

La comparación de versiones y licencias cubre ambos kits. La compilación, las medidas de peso y la prueba en navegador corresponden al piloto y al prototipo Material en los alcances indicados abajo. Para PrimeNG se revisaron los ejemplos públicos y la documentación del proveedor. La versión compatible requiere una clave PrimeUI válida y no había una disponible para esta evaluación.

## Versiones y licencias

Consulta del registro npm público el 19 de noviembre de 2026. El tag `latest` de Angular Core y CLI era **22.3.0**. La referencia de `9e1ddc8` fijaba Angular **22.2.6**, CLI y builder **22.2.7**, TypeScript **6.0.3** y RxJS **7.8.2**. Se compiló con Node **24.22.3** y npm **11.17.0**. Los rangos publicados de ambos kits estables admiten la base de Angular existente, por lo que se conservó para la prueba. [Matriz oficial de Angular](https://angular.dev/reference/versions)

| Opción | Pares declarados relevantes | Licencia y evidencia |
| --- | --- | --- |
| Material y CDK **22.3.0** | Angular `^22.0.0 \|\| ^23.0.0` y RxJS `^6.5.3 \|\| ^7.4.0`. Material pide CDK **22.3.0** exacto. | MIT según los paquetes instalados y el repositorio de Angular. Instalación con comprobación normal de pares y compilación local correctas. [Licencia de Angular Components](https://github.com/angular/components/blob/main/LICENSE) |
| PrimeNG **22.1.5** y PrimeUIX Themes **3.1.1** | PrimeNG pide Angular y CDK `^22.1.0` y RxJS `^6.0.0 \|\| ^7.8.1`. | Ambos archivos `LICENSE.md` del registro remiten a PrimeUI. Community exige elegibilidad y renovación anual. Commercial se licencia por desarrollador. La guía de instalación exige clave. [Guía de instalación](https://primeng.dev/installation) · [Licencias PrimeUI](https://primeui.dev/licenses) |
| PrimeNG **21.1.10 Community** | Core `^21.0.7` y CDK, Common, Forms, Router y Platform Browser `^21.0.0`. | MIT en la sección Community de `LICENSE.md`. Los pares excluyen Angular 22. [Cambio de licencia por versión](https://primeui.dev/nextchapter) |

Para repetir la comprobación, ejecutar `npm view <paquete>@latest version peerDependencies license --json` con `@angular/core`, `@angular/cli`, `@angular/material`, `@angular/cdk`, `primeng` y `@primeuix/themes`. Para leer la licencia publicada, usar `npm pack primeng@22.1.5 primeng@21.1.10 @primeuix/themes@3.1.1` en una carpeta temporal y extraer `package/LICENSE.md` de cada archivo.

## Controles y prueba en navegador

En la reserva Material, tres radios nativos agrupan las horas bajo una etiqueta. Un botón abre `MatDialog` con título, resumen, Volver y Confirmar. La agenda presenta los mismos datos sintéticos en una tabla semanal de siete columnas y en una lista por días. Usa botones Material con `aria-pressed` para alternar. La lista se abre por defecto al entrar con un ancho de hasta 700 px y se puede elegir a cualquier ancho. Horario, cierre, cita y estado se distinguen también por texto.

| Perfil | Comprobaciones en Material |
| --- | --- |
| Escritorio, Chrome Headless **157.0.8103.79**, 1280 × 900 CSS px | La reserva se completó con flechas, Tab y Enter. El botón se habilitó al elegir hora y el mensaje de estado confirmó la simulación. La agenda abrió en tabla y se pudo pasar a lista con Espacio. |
| Móvil emulado, mismo Chrome, 360 × 800 CSS px | El diálogo y las acciones quedaron dentro del área visible. La agenda abrió en lista. Al elegir la cuadrícula, el desplazamiento horizontal quedó dentro de su contenedor y se pudo accionar con teclado. |
| Zoom real al 200 %, Chromium Headless **156**, ventana de 1280 × 900 | Una extensión local aplicó `chrome.tabs.setZoom(tabId, 2)` y el navegador informó 640 × 450 CSS px y DPR 2. Se pudo confirmar y alternar entre ambas vistas. El documento conservó su ancho en los tres perfiles. |

En los tres perfiles el foco visible se verificó en Revisar cita, el diálogo enfocó Volver al abrir, Tab y Mayús+Tab circularon entre las dos acciones, y Escape, Volver y Confirmar devolvieron el foco al botón de origen. La prueba automatizada esperó la actualización del DOM tras la selección antes de enviar Tab. Se revisaron visualmente el diálogo a 360 px, la cuadrícula de escritorio y la lista al 200 %.

Se ejecutó axe-core **4.11.1** en reserva, diálogo, cuadrícula y lista para los tres perfiles. La herramienta informó cero infracciones, con comprobaciones incompletas en `aria-hidden-focus` para el fondo y los centinelas del diálogo, y en `color-contrast` para algunas celdas fuera del área visible y el resumen del diálogo móvil. El recorrido por teclado confirmó la contención y devolución del foco. Se comprobó el contraste de las parejas de colores indicadas abajo mediante luminancia relativa sRGB. [Diálogo de Angular Material](https://github.com/angular/components/blob/main/src/material/dialog/dialog.md) · [Contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Contraste de componentes](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

Para PrimeNG, los ejemplos públicos muestran un diálogo de confirmación y un ejemplo adaptable. La documentación describe nombre accesible, foco contenido, Tab y Escape, y pide relacionar explícitamente el disparador con el diálogo. Los ejemplos de radio documentan entrada nativa y navegación por flechas. La tabla aporta estructura tabular, pero la agrupación por día y la vista en lista requieren composición propia, igual que en Material. El modo con estilos admite tokens semánticos y por componente. Estas capacidades son una referencia de diseño. El teclado, la restauración de foco, el contraste, el zoom y el peso de un prototipo PrimeNG quedan sin medir. [Diálogo](https://primeng.dev/dialog) · [Radio](https://primeng.dev/radiobutton) · [Tabla](https://primeng.dev/table) · [Temas](https://primeng.dev/theming)

## Peso del build

Bytes exactos de los archivos JS y CSS emitidos, con gzip nivel 9 por archivo mediante `node:zlib`. Se excluyeron HTML, aviso de licencias, mapas, imágenes y otros medios. La cifra del piloto describe su build existente con Webpack, estilos y scripts de Bootstrap y polyfills. El prototipo usa un inicio mínimo zoneless con `@angular/build:application` y las dos rutas diferidas. Se registran por separado porque difieren en contenido y builder.

| Build y punto de carga | Bytes emitidos | Bytes gzip |
| --- | ---: | ---: |
| Piloto, carga inicial con `npm run build -- --configuration=pilot` | 573 502 | 139 647 |
| Material, carga inicial de la carcasa | 247 567 | 75 862 |
| Material, abrir reserva desde la carcasa | 144 654 | 34 440 |
| Material, abrir agenda desde la carcasa | 68 125 | 15 541 |
| Material, abrir agenda tras reserva | 2 590 | 1 149 |
| PrimeNG, carga inicial y diferida | Sin medir | Sin medir |

El build del piloto terminó con el aviso de obsolescencia del builder Webpack. Se midieron sus cinco JS/CSS iniciales en `dist/front-end-good-look`. El build Material se ejecutó con `ng build --configuration production --stats-json`, optimización de scripts y estilos, y optimización de fuentes desactivada. Para medirlo se sirvió `dist/browser` por loopback y se registraron los JS/CSS con respuesta satisfactoria. La carga fría de cada ruta incluye un chunk compartido de **65 535 B** y no lo suma otra vez al navegar de una ruta a la otra. Para reproducir la medición, abrir una sesión sin caché en `/`, registrar los recursos JS/CSS, repetir para `/reserva` y `/agenda` y sumar únicamente los archivos adicionales de cada ruta. Pesar los archivos con `readFileSync(path)` y `gzipSync(datos, { level: 9 }).length`. La compresión efectiva depende del servidor.

Los archivos temporales de este ensayo se crearon en `$env:TEMP\goodlook-ui-9e1ddc8`, con el build en `material/dist/browser` y el guion de Playwright Core **1.65.1** en `tools/check.cjs`. Mientras se conserven, `npm run build` en `material` y `node tools/check.cjs` desde esa carpeta temporal raíz permiten repetir el ensayo con los navegadores indicados.

## Dirección visual para implementar

| Uso | Token | Contraste sobre el fondo de referencia |
| --- | --- | --- |
| Fondo marfil y superficie | `#FBF7EF`, `#FFFDF8` | — |
| Texto verde oscuro y anillo de foco | `#17382D` | 11,98:1 sobre marfil y 12,60:1 sobre superficie |
| Texto secundario propuesto | `#456255` | 6,28:1 sobre marfil |
| Terracota para acciones | `#A04731` | 5,71:1 sobre marfil y 6,00:1 sobre superficie. Usar superficie como texto en botones sólidos. |
| Terracota para interacción propuesto | `#813826` | 8,17:1 con texto `#FFFDF8` |
| Bordes y divisores relevantes | `#728477` | 3,72:1 sobre marfil y 3,91:1 sobre superficie |

El prototipo aplicó la paleta mediante `mat.theme-overrides` y estilos compartidos. El resumen del diálogo quedó en `#43483F` sobre `#FFFDF8` (9,23:1). Usó Georgia con alternativa `serif` para títulos y `system-ui` con alternativa `sans-serif` para controles, textos y datos. Estas familias se solicitaron al sistema sin distribuir archivos de fuentes. El foco se marcó con un contorno de 3 px. Los controles de ambas vistas usan subrayado y negrita en la opción activa.

Para catálogo, usar fotografías realistas propias o con derechos verificados y asociar a un negocio solo las que lo representen. Identificar como ilustrativas las imágenes que muestren un sector o servicio. Registrar autor, origen y licencia de cada fotografía y fuente externa antes de incorporarlas. El ensayo se hizo con tipografía local y sin fotos. Las vistas privadas priorizan servicio, hora, precio y estado.

La selección del kit aporta una prueba de interfaz con datos fijos. Queda por verificar en pantallas de producto el manejo de foco al cambiar de ruta, los estados de carga, disponibilidad vacía y error, la agenda con semanas reales, los lectores de pantalla, el tacto en dispositivos, Safari y la instalación PWA. Las medidas de peso sirven como referencia del prototipo.
