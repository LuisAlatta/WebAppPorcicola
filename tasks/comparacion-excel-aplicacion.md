# Comparación funcional del Excel y la aplicación

> **Actualización del 9 de noviembre de 2026.** La comparación de abajo conserva el diagnóstico original. Desde entonces se implementaron las mejoras indicadas en la tabla siguiente; las afirmaciones antiguas de ausencia o defecto describen el estado anterior al trabajo realizado.

| Punto del diagnóstico | Estado en el código actual |
|---|---|
| Movimientos dentro del mismo galpón y cambios de etapa | Implementados para animales y grupos, con movimientos de origen y destino, actualización de fichas y protección del saldo. Al registrar un pesaje con otra etapa también se actualizan la ficha y el inventario en la misma operación. |
| Destete y mortalidad | Los movimientos internos de destete ya no incrementan las entradas externas; el destete puede actualizar las fichas individuales seleccionadas. |
| Ficha reproductiva | Muestra servicios, partos, fechas, crías por sexo, peso promedio y causa de salida. |
| Informes de pesos y nacimientos | Conectados a sus consultas, filtros, gráficos y exportaciones. |
| Alimentación | Cuenta acumulados de lotes agotados y distingue cobertura diaria, por etapa, mensual y por alimento compartido. |
| Sanidad | Dosis con unidad y retiro futuro; los flujos de vacuna y muerte se presentan por separado. Los tratamientos generales admiten corrección o anulación auditada y recalculan sus efectos. Las reglas de parto con ajuste negativo programan las dosis desde el parto probable y recalculan las pendientes al cambiar la fecha o registrar el parto. |
| Camadas | La corrección de cantidades está disponible en pantalla y conserva la coherencia histórica del inventario. Las adopciones mueven las cabezas entre ubicaciones y actualizan las fichas seleccionadas; las bajas por muerte actualizan estado, salida física, causa e historial sanitario en la misma operación. La identificación posterior conserva la madre biológica como desconocida cuando no puede determinarse. El plan postdestete usa la fecha real de la camada anterior cuando está registrada. |
| Descarte y filtros | Hay salida por descarte sin venta ni muerte, vinculada a la camada cuando corresponde. El padrón filtra también por progenitores, raza, aptitud, procedencia y etapa de ingreso. |

Estas mejoras están en el repositorio y en staging, versión `6e7449b2-d5e6-4def-b45d-bf9d30890bf4`, con D1 al día. Por instrucción del usuario, el 9 de noviembre también se publicó producción, Worker versión `fb1b9d29-225a-4189-b02a-8f880cf0f790`; D1 recibió las migraciones 0024–0026 y quedó con cero pendientes. Las pantallas productivas responden 200 y las API protegidas anónimas 401. El cron productivo no se pudo agregar por el límite Free de cinco triggers. Para preservar la ubicación histórica, el sistema rechaza un traslado o destete individual si ya existe un pesaje, servicio o actuación sanitaria en esa fecha o una posterior. La validación en dispositivos y el piloto siguen requiriendo una comprobación independiente.

Fecha de revisión: 8 de noviembre de 2026. Código examinado: `ab49568` en `main`, antes de añadir este informe.

## Resultado

La aplicación tiene implementado el núcleo de registro del Excel: animales, parámetros, servicios, nacimientos, pesos, inventario, alimentación y sanidad. Sin embargo, **todavía no ofrece equivalencia funcional completa**. Las carencias más importantes están en la consulta consolidada por animal, los movimientos internos y cambios de etapa, la presentación de informes productivos y la conexión entre cálculos de alimento y su pantalla.

Un módulo existente no implica que todos sus campos, resultados y conexiones estén completos. En este documento se distingue entre función utilizable, cálculo disponible solo en servidor, ausencia de interfaz, defecto y riesgo pendiente de una prueba específica.

La revisión corresponde al código local. La documentación de entrega indica que las migraciones 0001–0023 están aplicadas en producción, pero continúa pendiente desplegar el Worker compatible y cerrar T31 (`validacion-pendiente.md:50`). No se afirma que la web publicada tenga todas las funciones de este código; esta revisión no hizo comprobaciones autenticadas del despliegue.

## Alcance y evidencia

- Fuente principal: `videos  mandados por el cliente/video del excel.mp4`, duración 32:15, imagen de 1280 × 720 y pista de audio.
- Revisión visual de 97 fotogramas distribuidos a intervalos de 20 segundos, con ampliación de ocho pantallas clave a resolución original. Se contrastó también la narración mediante transcripción automática local; los textos reconocidos se deben interpretar junto a la imagen.
- Se siguieron los flujos reales de `src/main.tsx`, componentes montados, rutas del Worker, consultas, migraciones y pruebas. Los bocetos sin rutas activas no se contaron como funciones operativas.
- `requisitos.md` sirvió de índice, pero sus requisitos y etiquetas de cierre no se tomaron como prueba de implementación.
- No está disponible el libro `.xlsx/.xlsm` original. Por tanto, no se pueden certificar macros, fórmulas ocultas, conexiones externas ni comportamientos que la grabación no muestra. Las relaciones descritas son las observadas y las verificables en el código.
- En el corte inicial se realizó una auditoría; entonces no se implementaron los cambios identificados ni se modificaron datos operativos. La tabla de actualización al inicio documenta el estado posterior de esas correcciones.

## 1. Acceso, navegación y parámetros

| Función o atributo del Excel | Situación en la aplicación | Evidencia |
|---|---|---|
| Usuario y contraseña; rechazo de acceso inválido; salir | Implementado con sesión de servidor y cierre de sesión | `src/components/BocetoLogin.tsx:32`; `worker/auth.ts:182` |
| Acceso a consulta, registros, reproducción, nacimientos, producción, alimento, sanidad y parámetros | Existen accesos equivalentes; las funciones están distribuidas por módulos | `src/components/MenuPrincipal.tsx:34`; `src/main.tsx:153` |
| Catálogos de sexo, estado, etapa, aptitud, ubicación, lote, causas de descarte/muerte, tipo de servicio, estado fisiológico y alimento | Implementados y editables | `worker/config.ts:16` |
| Etapas preinicio, inicio, levante, engorde, gestación, lactancia, vacía y reproductor | Implementadas como valores iniciales configurables | `migrations/0004_farm_config_schema.sql:165` |
| Peso inicial/final, edad inicial/final, duración por etapa | Implementados; permiten límites abiertos y validan rangos | `worker/config.ts:46`; `worker/config.ts:396` |
| Ración y consumo diario por cabeza | Implementados | `worker/config.ts:46`; `src/components/ModuloConfiguracion.tsx:906` |
| Consumo por etapa y por mes | Implementados: diario × duración y diario × 30 | `worker/config.ts:157` |
| Cambiar parámetros sin perder el pasado | La app añade versionado por fecha efectiva, retiro de opciones e historial | `worker/config.ts:217`; `worker/config.ts:820` |

Referencia de video: 00:30–03:10 y 03:20–07:10. El Excel muestra 116 días para gestación; la semilla de la app usa 114. El parámetro existe y se consulta al registrar el ciclo: hay que elegir el valor operativo de la granja, no reprogramar el cálculo.

La narración demuestra que cambiar un parámetro recalcula las hojas conectadas. La app conserva versiones por fecha y parámetros usados en eventos: no debe suponerse que editar una duración reescriba todas las previsiones históricas ya guardadas. Hay que definir qué pendientes se recalculan y preservar las actuaciones reales.

## 2. Registro, padrón y consulta individual

Referencia de video: 07:50–12:00 y 29:30–31:40.

| Campo o función | Situación en la aplicación |
|---|---|
| ID permanente y textual, incluidos ceros iniciales | Implementado |
| Nombre/alias, arete, raza y sexo | Implementados |
| Nacimiento, edad, peso al nacer y peso actual | Implementados; peso actual deriva del último pesaje válido por fecha |
| Peso al destete | Implementado como dato opcional |
| Estado, fecha de ingreso, etapa de ingreso y aptitud | Implementados |
| Madre, padre y procedencia | Implementados; admite progenitores externos/desconocidos y valida genealogía |
| Galpón, ubicación física, lote y observaciones | Implementados como conceptos separados |
| Buscar por ID | Implementado |
| Buscar por nombre y aretes anteriores | La app añade estas búsquedas |
| Filtros de sexo, estado, etapa, ubicación y lote | Implementados; añade tipo, disponibilidad y galpón autorizado |
| Filtrar cualquier columna del padrón, como en las tablas del Excel | Parcial: faltan filtros por madre, padre, aptitud, raza, procedencia y etapa de ingreso; el filtro existente usa etapa actual |
| Mantener ficha después de venta o muerte | Implementado |
| Historial de pesos, movimientos, servicios, partos y sanidad | Implementado como cronología |
| Cambiar arete sin cambiar identidad | Implementado con historial |
| Número de servicios acumulado en la consulta | Falta el resumen consolidado en la ficha |
| Número de partos y fechas de primer/último parto en la consulta | Falta el resumen consolidado en la ficha |
| Total de crías, machos y hembras de esa madre | Falta el acumulado en la ficha |
| Peso promedio de las crías de esa madre | Falta el indicador en la ficha |
| Causa de descarte/muerte junto a la fecha de salida | Parcial: fecha/tipo visibles; causa guardada en inventario, pero no expuesta expresamente en el detalle |
| Descarte físico independiente de una venta o muerte | Falta: la opción «Venta o descarte» utiliza venta, exige importe y termina en estado vendido |

Evidencia de identidad y filtros: `worker/animals.ts:454`, `:816`, `:956`; genealogía `:854`; ficha y cronología `:581`. La estructura del detalle (`:165`), su respuesta (`:799`) y la pantalla (`src/components/ModuloAnimales.tsx:1546`) no reúnen los acumulados reproductivos que se ven juntos en la consulta del Excel a las 29:50. Tener los servicios y partos como eventos separados no satisface esa consulta consolidada.

El contrato de filtros está en `worker/animals.ts:438` y su búsqueda libre (`:472`) solo abarca código, alias y aretes. El descarte dispone de catálogo de causas y estado, pero el flujo de salida solo acepta `sale`/`death` (`:1816`); `sale` exige importe (`:1844`) y establece `vendido` (`:1862`). No equivale a retirar físicamente un animal por improductividad o vejez sin venderlo.

## 3. Servicios, preñez, partos y camadas

Referencia de video: 12:20–16:00.

| Función o atributo | Situación en la aplicación | Evidencia |
|---|---|---|
| Hembra, ubicación, lote, raza, padre y raza | Implementados | `worker/reproduction.ts:9`; `:148` |
| Fecha y número de servicio; monta, inseminación y embriones | Implementados, con varios servicios por ciclo | `worker/reproduction.ts:148` |
| Material reproductivo externo | Implementado | `worker/reproduction.ts:148` |
| Palpación, estado fisiológico, vacía/posible preñez/gestación/aborto | Implementados | `worker/reproduction.ts:261` |
| Último parto, probable de parto, días restantes y ciclo cerrado | Implementados | `worker/reproduction.ts:88` |
| Fecha probable desde servicio + gestación | Implementada; también admite fecha manual con motivo | `worker/reproduction.ts:167` |
| Antecedente de hembra comprada gestante | Implementado sin inventar un servicio local | `worker/reproduction.ts:329` |
| Madre, padre, fecha y número de parto, lugar, lote, observaciones | Implementados; padre vinculado al servicio | `worker/litters.ts:144` |
| Machos, hembras, vivos, muertos, total y peso decimal de crías | Implementados; añade pendientes de sexado | `worker/litters.ts:144` |
| Mortalidad al nacimiento | Implementada: muertos / total nacidos × 100 | `worker/litters.ts:173` |
| Destete probable desde parto + lactancia | Implementado, separado del destete real | `worker/litters.ts:181` |
| Parto → cierre de ciclo → ingreso de vivos al inventario | Implementado | `worker/litters.ts:191` |
| Identificar crías sin volver a sumarlas | Implementado | `worker/animals.ts:1103` |
| Destetes parciales, bajas de lactancia y adopciones | Implementados; ampliación frente a lo mostrado | `worker/litters.ts:35` |
| Corregir fecha real de parto | Disponible en interfaz y servidor; preserva aplicaciones sanitarias y mueve solo pendientes afectados | `worker/litters.ts:264`; `worker/index.ts:694` |
| Corregir cantidades de camada ya registrada | Existe API, pero falta el formulario correspondiente | `worker/index.ts:700` |

Ejemplo del video: 3 hembras + 6 machos = 9 crías; 8 vivas y 1 muerta → 11,1 %. La app representa ese caso sin sumar la cría nacida muerta al stock vivo. También contempla camadas históricas anteriores al ingreso de la madre.

La app añade calendario postdestete con intervalos guardados de celo y repeticiones, previsiones separadas de fechas reales y reglas de vacunación vinculadas. Estas ampliaciones no compensan la falta de acumulados de la sección anterior.

## 4. Pesajes, movimientos y flujo de cerdos

Referencia de video: 16:15–18:50. A las 17:10 se ve expresamente un movimiento con **la misma PIARA 01 en ambos extremos**, cambiando lote de ENGORDE a GESTACIÓN.

| Función | Situación en la aplicación |
|---|---|
| Pesaje por ID, fecha, peso kg, ubicación, lote y etapa | Implementado |
| Consecutivo/historial de pesos | Implementado dentro del animal y como fuente de reportes |
| Conservar pesos anteriores y su contexto | Implementado; añade corrección auditable y orden de medición |
| Ganancia de peso y ganancia diaria | Implementadas; ampliación |
| Trasladar entre galpones | Implementado para individuo y grupo, con saldo atómico |
| Trasladar de corral/ubicación dentro del mismo galpón | Falta: ambos endpoints rechazan el mismo galpón como destino |
| Cambiar solamente lote manteniendo ubicación/galpón | Falta el flujo operativo |
| Cambiar etapa productiva del animal coordinando ficha e inventario | Falta un flujo general; elegir otra etapa al pesar no cambia la etapa vigente |
| Entradas/salidas por fecha, etapa y sexo | Implementadas |
| Inicial, compra, nacimiento, venta, muerte, traslado y ajuste | Implementados y diferenciados |
| Disponibles y mortalidad por etapa y total | Implementados, con observación sobre el denominador tras destetes |
| Venta/muerte actualiza ficha y stock una vez | Implementado |
| Salida por descarte sin venta ni muerte | Falta flujo propio; no basta desactivar la ficha |
| Consulta de saldo a una fecha y control de negativos | Implementados |
| Conteo físico y conciliación | Implementados; ampliación |

Evidencias: pesajes en `worker/animals.ts:1626`; traslado individual `:1734` y rechazo del mismo galpón `:1739`; traslado colectivo `worker/inventory.ts:835`; ambos extremos usan la misma etapa en `:838` y `:905`. La edición descriptiva de la ficha no ofrece una vía alternativa (`worker/animals.ts:1259`).

**Impacto:** un cerdo puede tener nuevos pesajes pero seguir clasificado en una etapa antigua. Eso afecta saldos por etapa y proyección de raciones. No basta permitir cambiar una etiqueta en el formulario: el cambio debe generar movimiento fechado con origen/destino, conservar historial y actualizar la ficha.

## 5. Alimento y abastecimiento

Referencia de video: 19:00–22:15.

| Función o cálculo | Situación en la aplicación |
|---|---|
| Entrada/salida con alimento, fecha y kg | Implementada |
| Stock = entradas − salidas | Implementado |
| Acumulados de entradas/salidas | Implementados con defecto cuando un lote queda exactamente en cero |
| Demanda diaria = cabezas × kg por cabeza | Implementada desde inventario real |
| Demanda de etapa = diaria × duración | Implementada |
| Demanda mensual = diaria × 30 | Implementada |
| Comparar suficiencia por día, etapa y mes por separado | Parcial: la pantalla prioriza faltante/semáforo mensual y no presenta las tres comparaciones independientes |
| Faltante de etapa y mes | El servidor los calcula; falta exponer el faltante de etapa y su estado independiente |
| Sumar demanda de categorías que usan el mismo alimento | El servidor lo calcula; la pantalla no muestra el agregado por alimento |
| Consultar pronóstico sin consumir stock | Implementado |
| Días de cobertura | Implementados |
| Almacén, proveedor, lote, precio/kg, destino, documento y moneda | Implementados; ampliación |
| Evitar salida mayor al saldo | Implementado, incluidas fechas retroactivas y concurrencia |
| Compra → almacén y finanzas; consumo → costo sin repetir pago | Implementado |
| Turnos previstos, entregado y consumo medido | Implementados; ampliación |
| Conversión alimenticia por galpón y etapa con pesajes individuales comparables | Implementada con condiciones de cobertura; ampliación |

El caso del video está recogido literalmente en `tests/feed.integration.test.ts:21`:

| Concepto | Resultado |
|---|---:|
| Entrada 602 − salida 123 | 479 kg disponibles |
| 35 cabezas × 0,65 kg | 22,75 kg/día |
| 22,75 × 21 días | 477,75 kg/etapa |
| 22,75 × 30 días | 682,50 kg/mes |
| Faltante mensual 682,50 − 479 | 203,50 kg |

El alimento alcanza para esa etapa y no para el mes. La interfaz debe expresar ambos hechos al mismo tiempo, como el Excel. Evidencia: `worker/feed.ts:209`; pantalla `src/components/ModuloAlimentacion.tsx:58`.

**Defecto de acumulados:** `worker/feed.ts:89` omite lotes con saldo cero y `:92` construye recibido/retirado/costo a partir de las filas restantes. Si se compran 10 kg y se consumen los 10, esos movimientos permanecen en el libro, pero desaparecen de los acumulados de esas tarjetas. Debe calcularse el historial completo aunque el saldo final sea cero.

**Demanda compartida:** el servidor devuelve agregados `feeds` (`worker/feed.ts:222` y `:248`), pero la interfaz solo renderiza etapas (`ModuloAlimentacion.tsx:26` y `:58`). Cada etapa puede comparar su demanda contra todo el mismo stock, dando apariencia de suficiencia aunque juntas no alcancen. Se necesita un resumen por alimento físico además del desglose por etapa.

## 6. Control sanitario

Referencia de video: 22:30–23:50.

| Atributo o función | Situación en la aplicación |
|---|---|
| Animal, fecha, ubicación y lote de aplicación | Implementados; conserva el contexto histórico |
| Evento, producto, dosis/unidad y observación | Implementados |
| Responsable | Implementado por autoría de la sesión |
| Consultar y filtrar historial | Implementado |
| Aplicación a varios animales reales | Implementada; ampliación |
| Lote del producto, próxima aplicación y retiro | Implementados; ampliación |
| Reglas, agenda y aplicación de vacunas | Módulo específico implementado; ampliación |
| Recalcular pendientes conservando aplicaciones | Implementado para corrección de fecha real de parto |
| Registrar vacunación o muerte desde el selector sanitario genérico | Defectuoso: ofrece opciones que su endpoint no acepta |
| Corregir/anular evento sanitario general | No se encontró flujo específico de corrección/anulación |

Evidencia: `worker/health.ts:21`, `:35`, `:40`; `src/components/ModuloSanidad.tsx:11` incluye `death` y `vaccination`, mientras `worker/health.ts:22` solo acepta `treatment`, `deworming`, `other`. Muertes y vacunaciones tienen rutas específicas, pero el selector genérico debe conducir a ellas o dejar de ofrecer envíos inválidos.

Otros defectos de las ampliaciones sanitarias:

- Aplicar vacuna con retiro sanitario futuro falla porque el validador de `worker/vaccines.ts:11` rechaza fechas futuras y se reutiliza para `withdrawalUntil` en `:94`. Sanidad general sí contempla retiro futuro.
- El formulario de vacuna fija `dosageUnit: 'ml'` (`src/components/ModuloVacunas.tsx:26`); no permite elegir otras unidades que admite el servidor.
- Las reglas basadas en parto consultan partos reales (`worker/vaccines.ts:20`); el nombre de esa regla no acredita programación desde parto probable para vacunas preparto.

## 7. Informes, tablas, gráficos y exportación

Referencia de video: 25:30–29:00.

| Función del Excel | Situación en la aplicación |
|---|---|
| Tabla de pesos por fecha/etapa con promedio kg | API especializada implementada y tabla genérica disponible |
| Filtros de pesos por ubicación, lote e ID | API especializada los tiene; ubicación falta en el constructor visible |
| Gráfico de pesos ligado a esos filtros | Falta pantalla que use los datos del gráfico de la API |
| Tabla de nacimientos por madre/ubicación/lote | API especializada implementada y tabla genérica de camadas disponible |
| Suma de crías y de muertos | API especializada implementada; resumen genérico no ofrece todas las métricas del Excel |
| Promedio de porcentajes de mortalidad | Implementado en API especializada; no expuesto como indicador específico en la pantalla |
| Mortalidad conjunta, distinta del promedio de tasas | Implementada en API; no presentada junto al indicador anterior |
| Gráfico de nacimientos y mortalidad con filtros | Falta pantalla que lo use |
| Actualizar consulta | Implementado por nueva consulta; no actualización automática en vivo |
| Guardar reportes, columnas, filtros, agrupación y orden | Implementado; ampliación |
| Elegir libremente medidas/agregaciones/fórmulas | Parcial: agregación definida por servidor, no un sustituto libre de tablas dinámicas |
| Exportar PDF y XLSX | Implementado para resultados autorizados y filtrados |
| Exportar gráficos y fórmulas editables del Excel original | No implementado por los exportadores actuales |

Las APIs `/api/reports/weights` y `/api/reports/births` existen (`worker/index.ts:448`; `:449`) y devuelven datos para tabla y gráfico (`worker/reports.ts:36`; `:41`). **`src/components/ModuloReportes.tsx` no las llama.** Sus gráficos actuales muestran ventas, costo de alimento y animales por tipo; no son los dos informes productivos del video.

El constructor de camadas agrega `totalBorn`, pero seleccionar una columna no permite elegir libremente sumar muertos o promediar mortalidad (`worker/reports.ts:99`). Las exportaciones son libros de resultados tabulares; no replican la herramienta Excel con formularios/macros/gráficos editables. La vista previa limita a 500 filas y la exportación a 10.000; superar el límite genera rechazo explícito (`worker/reports.ts:98`).

Las fórmulas específicas distinguen correctamente promedio de tasas y tasa conjunta: dos camadas de 10 y 20 crías con una muerte cada una dan 7,5 % y 6,67 %, respectivamente (`tests/animals.integration.test.ts:1172`). El Excel muestra además errores como `#DIV/0!` en filas vacías; eso no es una función que convenga reproducir.

## 8. Conexiones entre módulos

| Origen → resultado esperado | Estado |
|---|---|
| Alta individual → ficha + una cabeza de inventario | Implementado |
| Identificar cabeza de grupo → ficha sin duplicar inventario | Implementado |
| Compra/venta → ficha/stock + finanzas | Implementado |
| Servicio + parámetro gestación → parto probable | Implementado |
| Parto → ciclo cerrado + camada + solo vivos en stock | Implementado |
| Parto + lactancia → destete probable | Implementado |
| Fecha de referencia ingresada → calendario postdestete | Implementado; falta vinculación/validación automática con el destete real de la camada anterior |
| Pesaje → peso actual + historial + fuente de informes | Implementado |
| Traslado entre galpones → ficha + origen/destino + historia | Implementado |
| Movimiento interno de corral/lote/etapa → ficha + stock | Incompleto |
| Inventario por etapa + raciones → demanda alimento | Implementado, condicionado a que la clasificación productiva esté actualizada |
| Proyección por alimento compartido → advertencia visible | Incompleto: cálculo sin presentación |
| Entrada/consumo de alimento → acumulados aun con saldo cero | Defectuoso |
| Aplicación sanitaria → historial con ubicación del evento | Implementado |
| Aplicación de vacuna → historial + cierre pendiente/alerta | Implementado en flujo específico |
| Eventos productivos → consulta reproductiva consolidada por ID | Incompleto |
| Pesos/camadas → API específica → gráfico y filtros visibles | Incompleto en el último tramo |
| Corrección cantidades de camada → operación accesible al usuario | Incompleto en interfaz |

## 9. Riesgos que necesitan una prueba específica

Estos hallazgos se derivan del recorrido del código. No se presentan como fallos reproducidos en la web publicada.

1. **Destete y denominador de mortalidad.** El destete usa un ajuste negativo en preinicio y positivo en destino (`worker/litters.ts:120`). El resumen cuenta ajustes positivos como entradas y negativos como salidas (`worker/inventory.ts:480`) y calcula mortalidad con esas entradas (`:536`). Se conserva el stock neto, pero pueden inflarse entradas/salidas globales y reducirse artificialmente la mortalidad. Ejemplo derivado del algoritmo: 10 entradas y 1 muerte dan stock 9 y mortalidad 10 %; cambiar 5 supervivientes de etapa mantiene stock 9, pero produce entradas 15, salidas 6 y mortalidad 6,7 %. No es una nueva ejecución de prueba. Se debe probar y separar movimientos internos de entradas externas.
2. **Destete de lechones ya identificados.** El destete grupal modifica inventario/camada, pero ese flujo no actualiza `animals`, `animal_location_history` ni pesos individuales (`worker/litters.ts:107`). Si la camada ya contiene lechones identificados, hay riesgo de dejar su ficha en ubicación/etapa anteriores. Se necesita un caso que identifique primero y destete después a esos mismos individuos.
3. **Mortalidad del Excel.** La cifra global de ejemplo del Excel no corresponde necesariamente a muertos totales / entradas totales. Debe aprobarse una fórmula explícita y trazable; copiar el porcentaje visible sin su denominador no garantiza equivalencia.

## 10. Funciones adicionales de la app

La app incluye prestaciones que el video no demuestra en el Excel: cuatro perfiles con permisos por galpón; gestión de equipos e historial; auditoría; reintentos sin duplicar; validación de concurrencia; conteos físicos; calendario y reglas de vacunas; avisos y notificaciones internas; compras/ventas vinculadas; crédito, abonos y caja; reportes guardados y exportación PDF/XLSX; instalación PWA.

Hay límites adicionales que no deben confundirse con paridad completa:

- Los reportes económicos calculan ventas menos alimento, no margen integral con sanidad, personal, mantenimiento y todos los costos (`worker/reports.ts:58`).
- Finanzas guarda animal, lote y contraparte, pero su listado no ofrece filtros específicos por esos tres atributos (`worker/finance.ts:34`; `src/components/ModuloFinanzas.tsx:17`).
- El inicio real es un menú. El panel con KPIs/gráficos se encuentra en Reportes. Los componentes de boceto con ejemplos no son pantallas activas.
- La PWA necesita conexión para consultar/guardar datos. No hay borradores persistentes ni sincronización offline: los intentos se conservan en un `Map` en memoria (`src/utils/operations.ts:33`); recargar cierra esa continuidad. Un Excel local sí puede utilizarse sin una conexión de datos.
- Las notificaciones son internas; no se acredita envío por WhatsApp/correo.
- La configuración de cron aparece en staging, no en producción (`wrangler.jsonc:25`).

## 11. Orden propuesto para alcanzar equivalencia

| Orden | Trabajo | Criterio de aceptación |
|---|---|---|
| 1 | Movimientos internos y cambios de etapa | Mover entre corrales o cambiar lote manteniendo galpón; transición de etapa con una operación; ficha, inventario y ración coinciden; total de granja no cambia |
| 2 | Conciliar destete e individuos; mortalidad | Identificar y destetar los mismos lechones sin fichas atrasadas; entradas externas y denominador no aumentan al cambiar de etapa |
| 3 | Consulta individual completa | Una búsqueda por ID muestra servicios/partos, primero/último, crías por sexo, promedio de pesos y causa/fecha de salida, junto a identidad e historia |
| 4 | Informes productivos del video | Pantallas de pesos y nacimientos conectadas a APIs existentes, con todos los filtros, tabla y gráfico coincidentes; tasas y promedio expresamente rotulados |
| 5 | Alimento | Acumulados correctos con saldo cero; suficiencia/faltante día/etapa/mes; demanda total por alimento compartido |
| 6 | Sanidad y correcciones | Resolver opciones inválidas, permitir retiro futuro y unidad de dosis; exponer corrección de cantidades de camada y definir corrección sanitaria |
| 6b | Descarte y filtros de padrón | Retirar por descarte sin imponer venta/importe y reflejar estado/causa correctos; filtrar también por progenitores, aptitud, raza, procedencia y etapa de ingreso |
| 7 | Validación y entrega | Recorrer ejemplos del video en Android y escritorio, conciliar saldos y archivos; desplegar versión compatible después del piloto acordado |

No es necesario reconstruir todos los módulos. Se necesita completar conexiones y pantallas, corregir los cálculos identificados y validar el recorrido integral.

## 12. Verificación de esta revisión

Se consultaron pruebas existentes de animales, inventario, reproducción, camadas, alimento, sanidad, reportes y conciliación. Los resultados de las ejecuciones de esta revisión se registran al cierre de este informe.

Los casos automatizados existentes no prueban por sí solos la igualdad completa con el video: faltan pantallas que todavía no están implementadas y recorridos de campo. Tampoco prueban despliegue ni uso físico en Android.

Resultados ejecutados el 8 de noviembre de 2026 sobre el árbol auditado:

- `npm test -- --maxWorkers=1`: **112/112 pruebas, 30/30 archivos**, duración 272,74 s.
- `npm run typecheck`: correcto.
- `git diff --check`: correcto antes del cierre del informe.
- No se ejecutó un nuevo recorrido completo de navegador ni pruebas físicas de Android. Las conclusiones de interfaz se basan en componentes/rutas activos; los defectos descritos no se presentan como una reproducción en producción.
