# Plan de renovación visual — WebPorcicola

Objetivo: llevar a todos los módulos el lenguaje ya aplicado en el selector de galpones, el padrón de animales y el menú principal: tarjetas ordenadas y simétricas, iconos SVG, acciones de igual ancho, estados de carga, vacío y error, y modales utilizables en móvil.

Referencias ya implementadas:
- Selector de galpones: `barn-*` en `src/style.css`.
- Padrón: `animal-card*` y `useCompactLayout()` en `ModuloAnimales.tsx`.
- Menú: `menu-app-*` en `MenuPrincipal.tsx` y `src/style.css`.
- Modal compartido: `ModalDialog.tsx` y `AnimalWorkspace.tsx`.

## 0. Base compartida (hacer primero)

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| C1 | `src/components/ModalDialog.tsx` | En pantallas de hasta 640 px el diálogo pasa a hoja completa: alto 100dvh, cabecera y pie fijos, cuerpo con scroll propio y acciones del pie apiladas a ancho completo. Mantener portal, `inert`, foco inicial, Escape y bloqueo de scroll. |
| C2 | Nuevo `ModuleTabs.tsx` | Extraer las 7 barras de pestañas duplicadas (`admin-tabs`) a un componente con `role="tablist"`: 2 columnas en móvil, 3 o 4 en ancho, icono y contador opcional. Sustituir en Inventario, Alimentación, Sanidad, Reproducción, Finanzas, Reportes, Alertas, Configuración y Administración. |
| C3 | Nuevo `ModuleToolbar.tsx` | Barra única de módulo: título, subtítulo, botón Actualizar con icono y giro al cargar, acción primaria. En móvil los botones quedan como icono con `aria-label`, igual que `AnimalToolbar`. |
| C4 | Nuevo `DataState.tsx` | Estados estándar de carga (esqueleto de 3 tarjetas), vacío y error con icono SVG, mensaje y botón Reintentar. Usarlo en cada listado. |
| C5 | Nuevo `Pagination.tsx` | Extraer la paginación simétrica del padrón (Anterior, rango, Siguiente) fuera del área con scroll y reutilizarla en Kardex de inventario, agenda de vacunas, agenda de alertas e historial de administración. |
| C6 | Sistema de tarjetas `.data-card*` | Unificar estilos de tarjeta de datos: cabecera con título y estado, cuadrícula de metadatos de 2 o 3 columnas, pie de acciones `repeat(auto-fit, minmax(0,1fr))`. `.animal-card` pasa a ser una variante de esta base sin cambiar sus clases para no romper pruebas. |
| C7 | `src/components/AnimalPicker.tsx` | Resultados como filas con código, arete, tipo y estado; chips de seleccionados; estados de carga, sin resultados y error; en múltiple, contador visible. |
| C8 | Iconografía | Revisión global: todo botón de regreso o cancelar usa `IconArrowLeft` o `IconX`; ninguno usa símbolos de texto. Verificar `Volver a retiros`, `Volver a ciclos`, `Volver a lista`, `Cancelar` y cierres de modal. |

## 1. Shell y ventanas globales

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| G1 | `Navbar.tsx` | El acceso a Inicio ya existe en la marca; hacerlo evidente con icono de casa y texto Inicio, y añadir flecha de regreso cuando se esté dentro de un módulo. En móvil truncar el nombre del módulo con elipsis y dejar la cuenta como rol abreviado. |
| G2 | `BottomNav.tsx` | 5 destinos fijos con icono y etiqueta, indicador activo en píldora, respeto de `safe-area-inset-bottom`. Ya tiene 5; solo uniformar alto y estado activo. |
| G3 | `main.tsx` — comprobación de sesión | Sustituir el bloque de texto por tarjeta centrada con icono, mensaje y botón Reintentar con flecha circular. |
| G4 | `main.tsx` — acceso denegado | Ya tiene Volver al Inicio con flecha; convertir el aviso en tarjeta con icono de candado y botón secundario. |
| G5 | `PwaControls.tsx` / `PwaInstallButton.tsx` | Aviso de actualización con icono y texto en dos líneas, botón Actualizar visible y modal de confirmación con acciones apiladas en móvil. El aviso de sin conexión vive en `Navbar`; igualar su estilo al banner de tarjeta. Instalación como tarjeta en el menú. |
| G6 | `BocetoLogin.tsx` | Tarjeta central con campos apilados, icono para mostrar u ocultar contraseña, botón de envío con giro de carga y error en bloque destacado. Prioridad baja. |

## 2. Animales (base tomada; quedan ventanas)

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| A1 | Panel de filtros `ModuloAnimales.tsx` | Plegarlo tras un botón Filtros con contador de filtros activos; chips removibles de filtros aplicados sobre el listado. |
| A2 | Ficha, pestañas | Resumen, Pesajes, Trazabilidad y Operaciones como pestañas simétricas con icono; scroll horizontal solo si no caben. |
| A3 | Ficha, pestaña Resumen | Métricas en tarjetas de 2 columnas; “Datos técnicos y genealogía” de tabla a lista de definiciones; origen y genealogía en tarjetas. |
| A4 | Ficha, pestaña Pesajes | Tabla de historial a tarjetas con fecha, peso, ganancia y origen del registro; estado vacío. |
| A5 | Ficha, pestaña Trazabilidad | Línea de tiempo con icono por tipo de evento, fecha y detalle; sin tabla. |
| A6 | Ficha, pestaña Operaciones | Lista de operaciones en tarjetas con tipo, fecha, responsable y resultado. |
| A7 | Alta y edición | Formulario dividido en tarjetas: Identificación, Datos zootécnicos, Origen y genealogía, Observaciones. Pie fijo con Guardar y Cancelar a ancho completo. |
| A8 | Modal Eliminar animal | Motivo como campo obligatorio con contador, aviso de reversibilidad y acción de peligro a ancho completo. |
| A9 | Modal Devolución de venta | Misma estructura: resumen del animal, motivo y confirmación; resultado en aviso de éxito. |
| A10 | Carga de ficha | Esqueleto dentro de `AnimalWorkspace` mientras llega el detalle, con Cancelar activo. |

## 3. Inventario

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| I1 | Pestañas | Existencias, Registrar, Movimientos y Traslado con `ModuleTabs`; 2 columnas en móvil. |
| I2 | Existencias, resumen por etapa | Tabla a tarjetas por etapa: cantidad, machos, hembras, peso promedio. |
| I3 | Existencias, saldos por grupo | Tarjetas por grupo con cabecera y desglose; el desglose por sexo pasa a barras o pares de datos, no tabla. |
| I4 | Registrar movimiento | Formulario en tarjetas: tipo, animal o grupo, destino, fecha, motivo. Pie fijo con Guardar y Cancelar. |
| I5 | Movimientos (Kardex) | Tabla a tarjetas: tipo con color, cantidad con signo, origen y destino, fecha y responsable; corrección como acción secundaria de la tarjeta. |
| I6 | Corregir movimiento | Panel inline a modal con resumen del original y advertencia de movimientos posteriores. |
| I7 | Traslado y conciliación | Selector de modo como pestañas de 2; formulario por tarjetas; resultado con diferencia y confirmación. |
| I8 | Paginación y estados | `Pagination` fuera del listado; esqueleto, vacío y error con `DataState`. |

## 4. Alimentación

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| AL1 | Pestañas | Raciones, Stock, Turnos y Registrar con `ModuleTabs`. |
| AL2 | Raciones, cobertura por etapa | Tabla a tarjetas por etapa con ración, animales y cobertura en días; color si la cobertura es crítica. |
| AL3 | Raciones, demanda por alimento | Tabla a tarjetas por alimento con cantidad diaria y stock disponible. |
| AL4 | Stock, existencias por lote | Tabla a tarjetas por almacén y lote con cantidad, unidad y vencimiento. |
| AL5 | Stock, Kardex | Tabla a tarjetas de movimiento con entrada o salida diferenciadas por color. |
| AL6 | Stock, administrar almacenes | Tabla a tarjetas con acciones Editar y Desactivar; alta en formulario plegable. |
| AL7 | Programar alimentación | Formulario por tarjetas (fecha, turno, etapa, ración); la programación del día como lista de tarjetas, no tabla. |
| AL8 | Turnos servidos | Tabla a tarjetas con turno, hora, etapa, cantidad y estado. |
| AL9 | Conversión alimenticia | Tabla a tarjetas por etapa con FCR y variación. |
| AL10 | Registrar movimiento | Formulario en tarjetas con pie fijo de acciones. |

## 5. Sanidad

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| S1 | Pestañas | Retiros, Vacunación, Registro e Historial con `ModuleTabs`; la de Vacunación aloja `ModuloVacunas`. |
| S2 | Retiros, tablas de pendientes y retiros activos | Ambas tablas a tarjetas: animal, tratamiento, fecha de retiro, días restantes con color, acción de detalle. |
| S3 | Registro de tratamiento | Formulario en tarjetas: animales, producto, dosis, vía, fechas y retiro. Pie fijo. |
| S4 | Historial clínico | Tabla a tarjetas con animal, diagnóstico, tratamiento, fechas, veterinario y acción Corregir. |
| S5 | Modal Anulación | Resumen de la actuación, motivo obligatorio y confirmación de peligro. |
| S6 | Corrección | Panel inline a modal de edición con los mismos campos del registro. |

## 6. Vacunas (submódulo de Sanidad)

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| V1 | Resumen | Tres métricas en tarjetas de igual alto, no bloque de cifras sueltas. |
| V2 | Agenda de vacunas | Tabla a tarjetas: vacuna, animal, fecha programada y estado. Acciones: Aplicar como primaria y el resto (Reprogramar, Cancelar, Corregir, Anular) en una fila secundaria de 2 columnas. |
| V3 | Filtros de agenda | Botón Filtros con contador y chips activos. |
| V4 | Programación manual | Formulario en tarjeta con animal, vacuna y fecha; pie de acciones fijo. |
| V5 | Reglas automáticas | Tabla a tarjetas por regla: vacuna, edad o condición, dosis, versión y estado; Editar y Desactivar en el pie. |
| V6 | Modales (5) | Aplicar, Anular, Reprogramar, Desactivar regla y Edición de regla con la nueva hoja móvil de `ModalDialog`; resumen del objetivo en la cabecera y acciones apiladas. |

## 7. Reproducción

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| R1 | Pestañas | Ciclos y Registro con `ModuleTabs`. |
| R2 | Tarjeta de ciclo | Cabecera con hembra, estado y badge de días; cuadrícula con servicio, celo, parto probable, parto real y camada; acciones principales visibles y las de corrección en un bloque plegable. |
| R3 | Correcciones inline | Fecha real del parto, cantidades de nacimiento y plan postdestete pasan de formularios inline a modales con resumen y pie fijo. |
| R4 | Eventos de camada | Formulario inline a modal: tipo de evento, cantidad, fecha y motivo. |
| R5 | Historial del ciclo | Línea de tiempo de eventos con icono y fecha, en lugar de bloques de texto. |
| R6 | Registro de servicio | Formulario en tarjetas: tipo (monta o IA), hembra, verraco o dosis, fecha y observaciones. |
| R7 | Estados | Esqueleto por tarjeta, vacío con acción Registrar servicio y error con Reintentar. |

## 8. Finanzas

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| F1 | Pestañas | Libro, Caja y Registrar con `ModuleTabs`. |
| F2 | Libro, métricas | Conservar `metric-card`; igualar alto y cifra con tipografía numérica. |
| F3 | Libro, tabla de movimientos | Tabla a tarjetas: tipo ingreso o gasto con color, monto por moneda, categoría, fecha, galpón y estado; acciones Ver y Revertir. |
| F4 | Caja | Tablas a tarjetas por moneda con saldo, entradas y salidas; el flujo diario como lista, no tabla. |
| F5 | Registrar operación | Formulario por tarjetas: tipo, monto y moneda, categoría, fecha, galpón y descripción. Pie fijo. |
| F6 | Modal Reversión | Resumen de la operación, motivo obligatorio, advertencia de efecto contable y confirmación de peligro. |
| F7 | Cobro o pago | Panel a modal con resumen y acción única. |

## 9. Reportes e informes productivos

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| RP1 | Pestañas | Panel, Productivos, Crear y Guardados con `ModuleTabs`. |
| RP2 | Panel | Métricas en tarjetas y las tres tablas a tarjetas o listas con encabezado y valor; estados vacíos por bloque. |
| RP3 | Informes productivos, selector | Pesos y Nacimientos como pestañas de 2; métricas en tarjetas y tablas a tarjetas por grupo. |
| RP4 | Gráficos | Mantener, con contenedor de altura fija y leyenda legible en móvil. |
| RP5 | Crear reporte | Formulario por tarjetas con tipo, rango de fechas, galpones y formato; resumen previo y pie fijo. |
| RP6 | Guardados | Tabla a tarjetas con nombre, tipo, fechas, autor y acciones Ver, Descargar y Eliminar. |

## 10. Alertas

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| N1 | Pestañas | Agenda, Notificaciones, Crear y Reglas con `ModuleTabs`. |
| N2 | Resumen | Métricas en tarjetas de igual alto. |
| N3 | Agenda y avisos | Tabla a tarjetas: severidad con color, título, origen, fecha y acción Atender. |
| N4 | Vacunaciones y partos programados | Lista de tarjetas con animal, evento y fecha. |
| N5 | Modal Atender | Hoja móvil con resumen del aviso, nota y acciones Atender y Descartar. |
| N6 | Crear aviso | Formulario en tarjetas con destino, severidad, mensaje y fecha. |
| N7 | Reglas de escalamiento | Tabla a tarjetas por regla con condición, destino y estado. |
| N8 | Paginación | `Pagination` fuera del listado de agenda. |

## 11. Configuración

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| CF1 | Pestañas | Parámetros, Catálogos, Etapas y Estructura con `ModuleTabs`. |
| CF2 | Tablas inconsistentes | Las cuatro usan `table` genérica; pasan a tarjetas de datos con el mismo patrón y, en escritorio, a `data-table` si conviene comparar. |
| CF3 | Parámetros | Cada parámetro en fila de tarjeta con etiqueta, valor, unidad y botón Editar; guardado por campo con confirmación. |
| CF4 | Catálogos | Tarjetas por categoría con sus valores como chips y acciones Agregar y Editar. |
| CF5 | Etapas | Tarjetas ordenables con nombre, rango de días y estado. |
| CF6 | Estructura | Tarjetas por galpón con ubicaciones y lotes anidados; alta y edición en modal. |
| CF7 | Modales | Retiro o baja e historial con la hoja móvil; motivo obligatorio y confirmación. |

## 12. Administración

| ID | Lugar | Cambio exacto |
| --- | --- | --- |
| AD1 | Pestañas | Usuarios, Galpones, Equipo, Historial, Auditoría y Configuración con `ModuleTabs`; 2 columnas en móvil, 3 en ancho. |
| AD2 | Galpones | Ya resuelto con tarjetas; solo igualar la cabecera al `ModuleToolbar`. |
| AD3 | Usuarios | Tabla a tarjetas: nombre, usuario, perfil, estado y última sesión; acciones Editar, Restablecer y Desactivar en el pie. |
| AD4 | Equipo | Tabla a tarjetas agrupadas por galpón y rol, con integrantes como filas y acciones de asignar y corregir. |
| AD5 | Historial de asignaciones | Tabla a línea de tiempo con fecha, galpón, rol, entrada y salida. |
| AD6 | Auditoría | Tabla a tarjetas con fecha, evento, actor y detalle plegable; filtros con chips. |
| AD7 | Configuración | Formulario en tarjetas con pie fijo. |
| AD8 | Modales (5) | Crear usuario, Alta de galpón, Estado de galpón, Eliminar galpón y Corregir equipo con la hoja móvil y acciones apiladas. |

## 13. Fuera de alcance

- `BocetoDashboard.tsx`, `BocetoListado.tsx`, `BocetoDetalle.tsx` y `BocetoFormulario.tsx` no se usan en `main.tsx`; no se tocan. Se propone eliminarlos en una tarea aparte.
- No se modifica ninguna API, tabla D1 ni contrato de datos.
- No se cambian textos legales, validaciones ni reglas de negocio.

## 14. Orden de ejecución

1. Base compartida: C1 a C7.
2. Animales: A1 a A10 (completa lo iniciado).
3. Inventario y Alimentación: I1 a I8, AL1 a AL10.
4. Sanidad y Vacunas: S1 a S6, V1 a V6.
5. Reproducción y Finanzas: R1 a R7, F1 a F7.
6. Reportes, Alertas, Configuración y Administración: RP, N, CF y AD.
7. Login, PWA y estados globales: G1 a G6.

Cada entrega: typecheck, lint, pruebas dirigidas, build, despliegue y verificación de contenido en producción. Pruebas de navegador por módulo con viewport de 412 px y una comprobación de escritorio donde se conserve tabla.

## 15. Criterios de aceptación por pantalla

- Ninguna tabla de más de cuatro columnas visible en móvil dentro de un módulo nuevo.
- Acciones de una tarjeta con el mismo ancho y alto, icono y texto centrados.
- Un solo patrón de pestañas en toda la aplicación.
- Paginación siempre fuera del área con scroll.
- Todo listado tiene carga, vacío y error.
- Todo modal es usable a 412 px sin scroll horizontal y con acciones alcanzables con el pulgar.
- Sin iconos de texto ni emojis; sin flechas de carácter.

## 16. Estado de cierre — 11/11/2026

Los módulos y la fase global tienen entregas publicadas; esto no equivale a aceptación completa del plan. Última versión: `6703aee4-d6ad-4225-9b9b-f64348f88f06`.

Pendientes confirmados para el repaso final:
- C3: falta crear e integrar `ModuleToolbar`.
- C5: `Pagination` se usa en Animales y Alertas; falta extenderla a los demás listados previstos.
- C8 y criterios por pantalla: revisar regresos/cancelaciones, estados de listados, hojas móviles y desbordamiento real.
- Navegador y dispositivo físico sin verificar; la suite completa no se validó.

Adaptaciones conservadas: seis destinos reales en navegación inferior; parámetros con guardado conjunto; etapas con orden editable por campo; ubicaciones y lotes separados sin inventar asociaciones. No se añadieron acciones sin flujo actual (eliminar informes, descartar avisos, restablecer/editar usuarios). Ver detalles y pruebas por entrega en `tasks/estado.md`.
