# Plan de desarrollo y puesta en marcha · Gestión porcina

**Punto de partida.** El estado implementado y la siguiente tarea abierta se mantienen en [estado.md](estado.md) y [todo.md](todo.md). La entrega completa incluye PWA Android, escritorio, cuatro perfiles, producción porcina, alertas, finanzas, reportes personalizados y exportaciones PDF/XLSX.

**Orden de lectura para comenzar o retomar:** [Estado y guía para retomar](estado.md), [requisitos y casos de aceptación](requisitos.md), este plan y [lista de ejecución](todo.md). La especificación local contiene los 111 requisitos, los 32 casos y las referencias temporales de los videos. Usarla como referencia estable; registrar cualquier cambio de alcance con fecha y casos afectados. La sección 13 contiene decisiones abiertas. La gestión financiera y las exportaciones forman parte del alcance confirmado aunque esa sección histórica plantee en qué entrega incorporarlas.

## Instrucciones de ejecución

1. Revisar archivos, estado de Git, rama, remoto, trabajo pendiente y dependencias. Conservar cambios ajenos. Seleccionar la primera tarea abierta cuyas dependencias ya tengan evidencia. Si se retoma una tarea parcial, reproducir primero su último resultado.
2. Leer los requisitos y casos indicados en esa tarea, diseñar la migración, API, pantalla y verificación mínimas. Implementar desde el flujo normal de usuario. Cada módulo debe poder probarse en cuanto se incorpore. Dividir tareas amplias en cambios más pequeños sin perder sus criterios de salida.
3. Ejecutar la prueba funcional de la tarea y al menos una de error o permiso cuando aplique. Ejecutar tipos, pruebas afectadas y compilación. Registrar en todo.md el resultado observado, comando o ruta de prueba, commit, riesgos y qué queda pendiente. Una pantalla que solo usa datos simulados no demuestra el flujo completo.
4. Realizar commits breves en español y push según las instrucciones del proyecto, verificando el remoto correcto. Registrar un push como tal solo tras verificar el hash remoto. No incluir material privado, credenciales, sesiones, medios del cliente o archivos de configuración personal.
5. Si falla una prueba, marcar la tarea en curso, corregir y repetir. Si depende de una decisión real de la granja, documentar la pregunta y su impacto, usar valores ficticios solo para pruebas y continuar con las tareas independientes. Mantener un registro de decisiones con fecha, responsable y valor aprobado.
6. Al cerrar cada fase, actualizar la lista y comprobar su recorrido integrado. El último paso entrega evidencia del entorno de producción, sus migraciones, prueba en Android y restauración en entorno aislado. Ninguna casilla marcada por sí sola acredita un resultado.

## Arquitectura y contratos que comparten los módulos

- **Interfaz.** React + Vite + TypeScript, adaptable a oficina y Android. En la segunda tarea crear bocetos navegables de login, inicio por perfil, listado, alta/corrección y detalle; usar estos patrones al construir cada módulo. Estados explícitos de carga, sin datos, rechazo, sin conexión, pendiente local y confirmado. Dinero con moneda, pesos con unidad, fechas locales.
- **Servidor.** Cloudflare Worker sirve recursos estáticos y API bajo el mismo origen. Validación de entrada y autorización en el servidor para lectura, escritura, filtros y exportación. Consultas por alcance actual; al trasladar un animal, conservar el galpón histórico de cada hecho. Acordar qué parte del historial necesita ver un veterinario que recibe el animal y aplicar esa regla también a reportes.
- **Estructura inicial propuesta.** `src/` para interfaz y módulos, `worker/` para API, sesiones y dominio, `shared/` para contratos y cálculos sin secretos, `migrations/` para cambios ordenados de D1, `tests/` para integración y recorridos. El nombre puede adaptarse al proyecto al iniciar. Evitar dos definiciones de permisos o fórmulas.
- **Modelo de datos por entregas.** Cuentas, sesiones, galpones, asignaciones con vigencia y parámetros; después animales, grupos, aretes y movimientos; ciclos, camadas, pesajes y destetes; almacén, raciones, sanidad y reglas; libro financiero y pagos; alertas, notificaciones y reportes guardados. Añadir tablas y restricciones junto con el primer flujo que las usa. Índices sobre galpón y fecha efectiva, identificadores de animal y claves únicas de reintento/ocurrencia. Revisar consultas con datos representativos.
- **Escritura atómica.** Un identificador vincula evento e impactos. Evitar un SELECT seguido por varias escrituras independientes. En D1 comprobar las precondiciones dentro de la escritura atómica y hacer que una precondición fallida aborte toda la unidad; verificar también comandos que afectan cero filas. Probar con dos peticiones HTTP realmente concurrentes y D1, incluyendo pérdida de respuesta y fallo forzado entre efectos. Una baja no puede afectar dos veces el grupo ni una venta generar dos ingresos.
- **Fecha y precisión.** Fecha operativa local de granja para destetes, vencimientos e informes; instante UTC para auditoría y ejecución programada. Reloj inyectable para pruebas. Importes enteros por unidad monetaria menor y cantidades físicas con precisión y redondeo explícitos. Stock y caja se derivan de movimientos; conservar el contexto vigente del evento, incluida dieta o duración de gestación.
- **Contrato de API.** Definir por operación ruta y método, perfil y galpón autorizados, esquema, reintento, versión, errores, efectos y auditoría. Ejemplos: alta de animal → ficha y movimiento o ningún cambio; registrar parto → ciclo, camada y saldo o ningún cambio; registrar venta → salida y cuenta por cobrar; ejecutar reporte → definición permitida y datos paginados. Distinguir entradas inválidas, falta de sesión, denegación y conflictos. No aceptar como autoridad los galpones remitidos por el teléfono.
- **Alertas y exportación.** Recalcular por evento y mediante cron. La bandeja interna es alcance confirmado. Los canales externos son una decisión aparte. Un reporte guardado almacena la definición. Consultar nuevamente permisos y fuentes vigentes para cada nueva exportación. Resolver límites de exportación mediante la prueba T03 y los volúmenes del piloto.
- **Referencias de implementación.** Consultar las guías vigentes de [D1 y operaciones por lotes](https://developers.cloudflare.com/d1/worker-api/d1-database/), [recuperación de D1](https://developers.cloudflare.com/d1/reference/time-travel/), [tareas programadas](https://developers.cloudflare.com/workers/configuration/cron-triggers/) e [instalación de una PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). Verificar cuenta, límites, herramienta y bindings reales antes de cualquier operación remota.

## Decisiones que deben estar resueltas al llegar a su fase

| Antes de | Decisión y persona responsable | Cómo avanzar mientras tanto |
|---|---|---|
| T05 | Responsable de granja: titular de cada galpón, suplencias, permisos por función y quién puede operar entre dos galpones. | Probar con cuatro perfiles y galpones ficticios A y B; aplicar mínimo permiso. |
| T08–T10 | Responsable de producción: fecha de corte, identificación individual/grupal, sexado, transición de etapa y capacidad. | Implementar movimientos configurables; probar conservación del total en traslados e identificación. |
| T12–T18 | Médico y responsable: días de gestación/lactancia, numeración de servicios, reglas de vacunación/retiro, anclajes de recurrencia y tercera repetición. | Probar las variantes de las referencias y parametrizar. Ninguna regla de demo se activa como pauta sanitaria real. |
| T16 y T21 | Encargado y finanzas: valoración de costos, prorrateo, conversión alimenticia, calendario mensual, moneda y anticipos. | Probar con S/ y ejemplos de la especificación. Acordar indicadores y denominadores con el responsable antes de usarlos en producción. |
| T22–T23 | Responsables: turnos, pesos, destinos comerciales, criticidad, anticipaciones y a quién notificar. | Probar fronteras explícitas; incluir día 7 en vacunas/partos. |
| T26–T29 | Responsable operativo: volumen histórico y concurrencia previstos, tamaño de exportación, Android objetivo, conectividad, objetivo de tiempo de recuperación y pérdida máxima aceptable. | Usar datos sintéticos y anotar volúmenes/mediciones; documentar objetivos reales antes de aprobar el piloto. |

## Secuencia de tareas

La dependencia indica qué debe existir para empezar; seguir el orden numérico como ruta recomendada. **CA** se refiere literalmente a la tabla de casos en requisitos.md. El alcance técnico de una tarea incluye pruebas en el centro de responsabilidad indicado y la ruta real de interfaz, servidor y datos que lo ejercita.

### Fase 1. Preparación

#### T01. Fijar alcance y decisiones

**Depende de** — · **Requisitos** transversal · **CA** verificación propia.

Leer esta carpeta y contrastar las fuentes locales cuando un campo sea ambiguo. Crear registro de decisiones con responsable, valor de prueba, fecha límite y módulos afectados. Inventariar dispositivos y validar quién recibe el piloto.

**Comprobación de salida.** Cada cuestión de la sección 13 de requisitos tiene responsable y fase. Ventas, finanzas, suministros y reportes figuran en la entrega completa. Marcar condiciones de conectividad y conversión alimenticia sin descartar su implementación en silencio.

#### T02. Crear proyecto reproducible

**Depende de** 01 · **Requisitos** transversal · **CA** verificación propia.

Inspeccionar el repositorio y origin; conservar documentos y videos locales excluidos. Preparar TypeScript estricto, React/Vite, Worker con recursos estáticos, scripts npm, bloqueo de dependencias y CI. Fijar versiones compatibles en el README. Preparar desarrollo local, pruebas y producción con D1 y secretos separados.

**Comprobación de salida.** Clonar a una carpeta limpia, instalar con npm ci, compilar y abrir una ruta interna desde su URL. Un cambio defectuoso debe detener CI. Confirmar que ninguna prueba apunta a producción.

#### T03. Probar D1 y exportaciones antes de comprometer la arquitectura

**Depende de** 02 · **Requisitos** transversal · **CA** verificación propia.

Hacer una prueba mínima con D1 del runtime de Workers para claves foráneas, índices, migraciones, restricciones, lote atómico, duplicados y escritura concurrente con precondición. Probar bibliotecas candidatas de PDF y XLSX con acentos, dinero y varias páginas; medir tamaño, memoria y tiempo con una muestra representativa.

**Comprobación de salida.** Forzar un fallo intermedio: no quedan efectos parciales. Dos solicitudes sobre el mismo saldo no lo dejan negativo. Abrir PDF y XLSX reales, registrar límites medidos y elegir generación en cliente con datos ya autorizados o en Worker según el resultado.

**Cierre de fase.** Instalar en una copia limpia y repetir la prueba de atomicidad en el runtime de Workers. Registrar la elección de exportadores.

### Fase 2. Acceso

#### T04. Implementar sesiones y primer administrador

**Depende de** 03 · **Requisitos** ACC-01 ACC-03 ACC-05 · **CA** verificación propia.

Crear el primer administrador por procedimiento de inicialización de un solo uso, cerrar esa vía y documentar recuperación. Usar autenticación mantenida compatible con Workers, sesiones revocables, credenciales protegidas, cookies HttpOnly/Secure y defensas de origen/CSRF y contra intentos repetidos. Crear login móvil, inicio, navegación y salida.

**Comprobación de salida.** Probar ingreso válido e inválido, expiración, cierre, cuenta desactivada y acceso directo al servicio. Sin sesión no se leen datos; bloquear el alta pública y la reutilización del mecanismo inicial.

#### T05. Implementar módulo exclusivo de administración

**Depende de** 04 · **Requisitos** ACC-06 ACC-07 ADM-01 ADM-02 ADM-03 ADM-04 CFG-06 · **CA** 27 28.

Crear cuentas de los cuatro perfiles y galpones en preparación; asignar Usuario responsable, Operario y Médico veterinario en una operación. Activar solo cuando el equipo esté completo. Guardar vigencias y autor; restringir todas las rutas administrativas en el servidor.

**Comprobación de salida.** Probar los cuatro perfiles, dos galpones y dos usuarios responsables. Fallar si se intenta activar un equipo incompleto, quitar el último galpón de un Usuario activo o usar por URL permisos ajenos. Comprobar que no quede la granja sin administrador activo.

#### T06. Registrar eventos con reintentos y auditoría

**Depende de** 05 · **Requisitos** ACC-04 GES-03 · **CA** verificación propia.

Definir operación única con clave de reintento, datos normalizados, versión, autor, galpón, fecha efectiva y de registro. Implementar un primer flujo real de corrección con historial, por ejemplo un cambio de asignación. Reutilizar la misma convención en los módulos siguientes.

**Comprobación de salida.** Mismo usuario, misma clave y mismo contenido devuelven el resultado anterior; contenido distinto con esa clave da conflicto. Cortar la conexión después del guardado y reintentar. Un formulario inválido conserva sus campos.

#### T07. Configurar la granja y sus parámetros

**Depende de** 05,06 · **Requisitos** CFG-01 CFG-02 CFG-03 CFG-04 CFG-05 · **CA** verificación propia.

Formularios para catálogos, piaras, corrales, lotes, etapas, raciones, unidades, zona horaria y vigencias. Separar galpón físico, ubicación, tipo, etapa y estado reproductivo. Retirar valores ya usados sin romper referencias históricas.

**Comprobación de salida.** Registrar datos en dos fechas con parámetros diferentes. Verificar que el histórico conserve cada valor, que un catálogo retirado sea consultable y que un dato faltante se distinga de cero.

**Cierre de fase.** Desde dos sesiones distintas verificar que solo el administrador gestione usuarios y que la revocación sea inmediata. Revisar la matriz de permisos con ejemplos de acceso directo.

### Fase 3. Animales e inventario

#### T08. Abrir inventario individual y colectivo

**Depende de** 07 · **Requisitos** INV-01 INV-02 INV-03 · **CA** verificación propia.

Implementar movimientos de cabezas por fecha, ubicación, lote, etapa, sexo (incluido pendiente de sexado) y causa. Preparar saldo inicial, grupo sin arete y desglose individual. Usar la misma fuente para existencias a fecha de corte y ocupación.

**Comprobación de salida.** Cargar un saldo inicial, registrar entradas y salidas en fechas distintas y reconciliar por sexo, lote y galpón. El detalle reconstruye cada total del tablero.

#### T09. Dar de alta y consultar animales

**Depende de** 08 · **Requisitos** ANI-01 ANI-02 ANI-03 ANI-04 ANI-05 ANI-06 ANI-07 ANI-08 INV-04 · **CA** 01.

Implementar ficha, aretes históricos, código textual, genealogía conocida o externa, pesos, estado, procedencia y ubicaciones. Buscar y filtrar por galpón. Integrar ficha, única entrada y cronología. Ir completando la cronología al incorporar módulos.

**Comprobación de salida.** Crear 002 dos veces; conservar los ceros y una sola entrada. Impedir ciclos de parentesco. Desactivar una ficha sin registrar muerte. Verificar que un usuario sin galpón no encuentre ni por ID el animal.

#### T10. Transferir, dar de baja, conciliar y corregir

**Depende de** 09 · **Requisitos** PRO-04 PRO-05 INV-05 INV-06 INV-07 CFG-07 · **CA** 04 11.

Registrar traslados dobles dentro de una misma operación, muertes, causas, recuentos físicos y ajustes. Validar también saldos posteriores al registrar una corrección retroactiva. Impedir cierre de galpones ocupados. Exigir permisos para ambos extremos del traslado o intervención del administrador.

**Comprobación de salida.** Mover 5 de un grupo de 12 a otro de 8 produce 7 y 13. Dos retiros de 7 sobre 10 aceptan uno. Fallar entre origen y destino conserva ambos saldos; distinguir tasa por etapa de global. Validar ausencia de saldos negativos en cualquier fecha.

#### T11. Registrar producción y pesajes

**Depende de** 09,10 · **Requisitos** PRO-01 PRO-02 PRO-03 PRO-06 · **CA** 06.

Implementar historial y formulario de pesajes por animal. Conservar lote al pesaje, cortes por fecha y etapa, regla para dos registros el mismo día, peso actual y ganancia entre mediciones comparables. Incorporar acceso a flujo, movimientos e informes al estar disponibles.

**Comprobación de salida.** Con 38 kg del día 5 cargados después de 44 kg del día 20, el peso actual sigue en 44. Mismo día no genera división por cero; una corrección actualiza historial y ficha.

**Cierre de fase.** Reconstruir el saldo a dos fechas desde el historial. Comparar la suma de grupos e identificados con la ocupación. Probar dos escritores y un reintento.

### Fase 4. Reproducción

#### T12. Abrir y seguir ciclos reproductivos

**Depende de** 09,10 · **Requisitos** REP-01 REP-02 REP-03 REP-04 REP-05 REP-06 REP-09 · **CA** 02 16.

Registrar monta, inseminación o transferencia, servicio, palpación, estado, aborto, antecedentes y fecha probable automática o manual. Seleccionar el ciclo correcto, guardar el parámetro vigente y permitir ingreso de una hembra gestante.

**Comprobación de salida.** Con 116 días, 23/01/2021 → 19/05/2021. Con 114 días, 25/05/2026 → 16/09/2026. Fecha manual queda identificada, y cerrar el ciclo retira su pendiente. Aceptar servicios sin destete previo.

#### T13. Registrar parto y camada de forma atómica

**Depende de** 12 · **Requisitos** CAM-01 CAM-02 CAM-03 CAM-04 CAM-05 CAM-07 · **CA** 03 12.

Implementar parto del ciclo, camada, vivos, muertos, sexos, pesos y destete previsto. Con una sola escritura lógica cerrar el ciclo y sumar solo los nacidos vivos al grupo. Individualizar una cabeza previamente contada; incorporar antecedentes históricos sin afectar el inventario actual.

**Comprobación de salida.** Con 8 vivos y 1 muerto sumar 8 cabezas. Identificar dos deja 2 fichas y 6 sin identificar. Rechazar la corrección a 7 vivos si ya se distribuyeron 8. Comprobar porcentajes y fechas sin datos.

#### T14. Destetar y calcular repeticiones

**Depende de** 13 · **Requisitos** CAM-06 CAM-08 REP-07 REP-08 · **CA** 09 14.

Registrar adopciones, bajas posteriores, pesos y destetes parciales por sexo; vincular camada de origen y destino. Calcular celo y repeticiones desde el destete previo. Guardar intervalos en el registro y mostrarlos en formulario, lista e informes.

**Comprobación de salida.** De 8 vivos, 1 muerto posterior y 6 destetados queda 1 pendiente. Con 20/05 y 5/10/20 días, mostrar 25/05, 04/06, 24/06 y los mismos intervalos al reabrir. No incrementar el total con el destete.

**Cierre de fase.** Recorrer servicio → parto → identificación → destete. Conciliar animales y fechas en la ficha y en la agenda.

### Fase 5. Alimentación y sanidad

#### T15. Controlar almacenes y suministros

**Depende de** 10 · **Requisitos** ALI-01 ALI-05 ALI-07 · **CA** verificación propia.

Registrar saldo inicial, compras, entradas, entregas, devoluciones, mermas y costo por lote de almacén; asignar cada consumo una sola vez al animal o galpón. Mantener vínculo de operación que reutilizará finanzas.

**Comprobación de salida.** Verificar falta de existencias, entrega retroactiva incompatible y concurrencia. Distinguir inventario físico de asignación monetaria; dos vistas de la misma entrega deben devolver el mismo saldo.

#### T16. Planificar raciones y calcular cobertura

**Depende de** 11,15 · **Requisitos** ALI-02 ALI-03 ALI-04 ALI-06 · **CA** 07.

Calcular demanda diaria, de etapa y mensual según cabezas y raciones vigentes; registrar turnos con cantidad prevista y servida. Para conversión, comparar consumo real neto y ganancia comparable del mismo grupo y periodo.

**Comprobación de salida.** Con entradas 602 y salidas 123 quedan 479 kg; a 22,75 kg/día alcanzan para 21 días, faltan 203,50 kg para 30. Proyectar no mueve el stock. Faltantes de parámetros se muestran explícitamente.

#### T17. Historial clínico y tratamientos

**Depende de** 10,14 · **Requisitos** SAN-01 SAN-02 SAN-03 SAN-04 SAN-10 · **CA** 08.

Registrar medicamento, dosis/unidad, actuación grupal con composición histórica, próxima actuación y retiro indicado por el médico. Conectar muerte con una única baja. Reservar las funciones clínicas al permiso definido.

**Comprobación de salida.** Trasladar un animal después del tratamiento y verificar galpón histórico. Revisar que la restricción de retiro afecte una salida o sugerencia conforme a la regla acordada. Probar que otros perfiles no modifiquen datos clínicos restringidos.

#### T18. Programar vacunas y registrar su aplicación

**Depende de** 12,13,17 · **Requisitos** SAN-05 SAN-06 SAN-07 SAN-08 SAN-09 REP-10 · **CA** 13 15 20.

Implementar catálogo de reglas con recurrencias y categorías, generación al alta e inversa para animales existentes, comando manual y aplicación efectiva. Vincular cada pendiente con su regla, animal y ocurrencia. Recalcular pendientes al corregir el origen.

**Comprobación de salida.** Reproducir reemplazo 002 nacido 06/06, regla +60: una dosis el 05/08, incluso tras regenerar. Guardar ciclo con vacuna existente conserva la edición. Otra vacuna el mismo día sí se admite. Una aplicada conserva su fecha.

**Cierre de fase.** Registrar alimento, tratamiento y vacuna. Repetir los dos fallos señalados por el cliente y verificar los valores reales de la ficha.

### Fase 6. Finanzas

#### T19. Libro de ingresos y egresos

**Depende de** 15 · **Requisitos** FIN-01 FIN-02 · **CA** verificación propia.

Registrar operaciones, categorías, contrapartes, moneda, referencias, distribuciones y responsable. Propuesta: moneda en unidades menores enteras y pesos con unidad/precisión documentada. Mantener gastos generales separados de los de cada galpón.

**Comprobación de salida.** Exigir suma de distribuciones igual al total. Comprobar redondeo y separación de monedas. El Usuario A no ve gastos generales ni participaciones de B que excedan su alcance.

#### T20. Compras, ventas y correcciones integradas

**Depende de** 10,17,19 · **Requisitos** GES-01 FIN-04 · **CA** 05 30.

Una venta o compra de animales, insumos o alimentos vincula documento, movimiento económico e inventario por la misma operación. Propagar anulaciones con historial. Revalidar disponibilidad y restricciones sanitarias antes de vender.

**Comprobación de salida.** Venta reenviada produce una baja y una sola operación. Compra y pago de S/ 500 seguidos de consumo de S/ 120 no crean segundo pago. Fallo tras una operación parcial no deja saldo desparejo.

#### T21. Caja, abonos y costos por galpón

**Depende de** 20 · **Requisitos** FIN-03 FIN-05 GES-02 · **CA** verificación propia.

Implementar cobros y pagos parciales, saldo inicial y final, cuentas pendientes, filtros y conciliación por periodo. Separar fecha de operación de fecha de cobro, margen de caja y consumo de gasto general. Preparar fuentes de reportes.

**Comprobación de salida.** Con venta de 1.000 y abonos de 400 y 600 en meses distintos, verificar venta única y pendientes de 600 y 0. El caso 31 se cierra cuando también existan los archivos exportados.

**Cierre de fase.** Conciliar ventas, existencias, pagos y caja a dos cierres de mes, incluyendo una devolución y una corrección.

### Fase 7. Alertas

#### T22. Generar agenda y pendientes por fecha

**Depende de** 14,16,18 · **Requisitos** INF-05 INF-08 ALE-01 ALE-02 ALE-03 ALE-04 ALE-05 ALE-06 · **CA** 19 21 22 23 24.

Construir generación al mutar el evento y tarea programada de recuperación. Día local de la granja; clave única por ocurrencia. Reconciliar vacunas, parto, destete, tratamientos, entregas de alimento; resolver al completar/cancelar, sin multiplicar avisos por reintento.

**Comprobación de salida.** Simular medianoche y cron omitido. Probar ayer, hoy, +1, +7, +8, reprogramación, destete parcial y entrega 12/20. Contadores deben concordar con listados y permisos.

#### T23. Sugerencias, críticas y notificaciones

**Depende de** 11,17,20,22 · **Requisitos** ALE-07 ALE-08 ALE-09 ALE-10 · **CA** 25 26.

Evaluar bajo peso, candidatos a venta, retiro vigente, antigüedad del pesaje y escalamiento configurable. Crear notificaciones internas por responsable y transición con vínculo a la tarea. Leer y resolver son acciones distintas.

**Comprobación de salida.** Probar 39/40 kg y meta 100 kg; la sugerencia no modifica inventario. Escalar dos veces crea una notificación por transición y únicamente para usuarios autorizados. Verificar cron real en pruebas con PWA cerrada.

**Cierre de fase.** Comparar bandeja y contadores por galpón antes y después de medianoche local y de una ejecución repetida del cron.

### Fase 8. Reportes

#### T24. Definir fuentes y consultas autorizadas

**Depende de** 11,14,18,21,23 · **Requisitos** RPT-01 RPT-02 RPT-03 INF-01 INF-02 INF-03 · **CA** verificación propia.

Construir diccionario permitido de campos, granularidad, filtros, agregados, unidades y dimensiones por perfil. Usar consultas SQL parametrizadas y campos/filtros/orden de lista admitida; agregar cada fuente antes de combinar. Diseñar los informes de pesos y nacimientos.

**Comprobación de salida.** Con camadas de 10 y 20 y un muerto por camada, obtener promedio 7,5 % y global 6,7 %. Probar filtros vacíos, campos no autorizados y dos hechos con varias filas por galpón.

#### T25. Personalización, informes y panel

**Depende de** 24 · **Requisitos** RPT-04 RPT-06 INF-04 INF-07 FIN-06 · **CA** 10.

Implementar generador con finalidad, selección de columnas, periodo, grupos, orden, vista previa y detalle; guardar, duplicar y reejecutar definiciones. Mostrar gráficos, indicadores y finanzas; aplicar el mismo alcance al dato, total y opciones de filtro.

**Comprobación de salida.** Construir los tres ejemplos de RPT-06 con cuentas distintas. Comparar indicadores con operaciones de origen, incluida fecha local y pesos históricos. Quitar un galpón y reabrir reporte guardado.

#### T26. Exportar PDF y Excel reales

**Depende de** 25 · **Requisitos** RPT-05 INF-06 INF-09 · **CA** 17 18 29 31 32.

Usar la consulta autorizada de la vista previa completa; exportar PDF paginado y XLSX con números/fechas tipados. Revalidar sesión y permisos al exportar. Tratar entradas de texto como texto al generar Excel. Soportar descarga y compartir donde lo permita Android.

**Comprobación de salida.** Abrir archivos, verificar acentos, columnas, tablas de varias páginas y datos más allá de la primera página de UI. Sumar 300/30 del caso 29, comprobar meses del 31 y ausencia de B en caso 32. Probar tamaño máximo acordado sin truncado silencioso.

**Cierre de fase.** Abrir archivos exportados en un lector PDF y en Excel u otro lector XLSX. Comparar filas, totales y permisos con la vista previa completa.

### Fase 9. Android

#### T27. Interfaz completa e instalación PWA

**Depende de** 26 · **Requisitos** ACC-02 GES-04 · **CA** verificación propia.

Recorrer todos los formularios de ingreso, enlaces y estados de carga/error/éxito en celular y escritorio. Manifest, iconos, HTTPS, service worker de recursos estáticos y actualización segura. No guardar respuestas privadas en caché compartida. Probar menú de cada perfil.

**Comprobación de salida.** En Android real instalar desde HTTPS, abrir desde icono, acceder por enlace directo y actualizar versión durante un formulario. Revisar teclado, unidades y decimales, foco, contraste, fechas, desplazamiento y descarga. Registrar dispositivo/navegador probado.

#### T28. Resolver desconexiones y conflictos

**Depende de** 06,27 · **Requisitos** GES-06 · **CA** verificación propia.

Si se confirma captura sin red: IndexedDB por cuenta y granja para borradores, identificador estable y sincronización al reabrir/recuperar conexión; revalidar permisos, versión y saldos. Definir limpieza al cerrar sesión/cambiar de cuenta. Si no se habilita, documentar alcance y estado sin conexión explícito.

**Comprobación de salida.** Modo avión, recarga, reinicio, reenvío, revocación de galpón y saldo cambiado: una confirmación o conflicto visible; sin doble registro ni datos de otra cuenta. Si es solo online, la caída nunca muestra una operación pendiente como guardada.

**Cierre de fase.** Probar en Android físico el flujo de un operario con pérdida de red, recarga y cambio de usuario. Registrar la evidencia.

### Fase 10. Lanzamiento

#### T29. Pruebas integrales y ensayo de restauración

**Depende de** 26,27,28 · **Requisitos** GES-05 · **CA** verificación propia.

Preparar entorno de prueba aislado, ejecutar 32 casos y matriz de roles; inventario, dinero, permisos y reportes con datos realistas. Ensayar restaurar una copia en una base aislada y ejecutar el Worker sobre ella. Documentar procedimiento, responsables, tiempos y límites verificados del plan Cloudflare.

**Comprobación de salida.** Informe de 32 resultados con enlaces a prueba, dato y evidencia. Recuperar usuarios, asignaciones, movimientos y saldos y conciliar a la fecha del respaldo. Medir tiempo de recuperación y antigüedad de datos frente a los objetivos acordados.

#### T30. Piloto con datos iniciales y los cuatro perfiles

**Depende de** 29 · **Requisitos** transversal · **CA** verificación propia.

Preparar plantillas de apertura para galpones, responsables, padrón, grupos, alimento, caja, cuentas y ciclos vigentes. Validar en seco referencias, duplicados, fechas, saldos y permisos. Congelar fecha de corte. Un galpón piloto recorre una jornada con el operario, el médico, el Usuario y el administrador.

**Comprobación de salida.** Conciliar conteo físico con individuales + grupos y caja con importe acordado. Repetir la carga sin duplicar. Usar un Android de la granja; responsables verifican cierre del turno y reportes. Registrar incidencias, corrección y repetición.

#### T31. Publicar y comprobar producción

**Depende de** 30 · **Requisitos** transversal · **CA** verificación propia.

Preparar versión y migraciones probadas, copia recuperable, cuenta/dominio/bindings correctos, secretos, HTTPS y cron del entorno objetivo. Revisar autorización vigente antes de operar remotamente. Migraciones compatibles con la versión previa; desplegar, verificar y registrar versión. Transferir guía de instalación, roles y recuperación.

**Comprobación de salida.** Desde el dominio final: instalar, login/logout, asignación, lectura/escritura controlada, alertas, exportación y acceso denegado. Sin datos de prueba ni credenciales demo. Si falla integridad o aislamiento, frenar escrituras y ejecutar recuperación descrita en plan.

#### T32. Seguimiento y entrega operativa

**Depende de** 31 · **Requisitos** transversal · **CA** verificación propia.

Supervisar el primer cierre diario y al menos una ejecución programada real. Contrastar panel, movimientos, inventario, finanzas y alertas con cifras de control. Acordar propietario de incidencias, revisión de backups, actualizaciones PWA y traspaso de acceso.

**Comprobación de salida.** Guardar informe de puesta en marcha y conciliación firmada por el responsable operativo. Toda incidencia pendiente tiene impacto, responsable, fecha y decisión explícita. Entregar versión desplegada y manual de restauración probado.

**Cierre de fase.** Cerrar piloto, recuperación, despliegue y seguimiento con conciliación; cualquier defecto que afecte saldos o permisos impide la aceptación.

## Verificación continua y escenarios de entrega

**Comandos objetivo.** En T02 implementar y documentar scripts reales para `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run build`. Configurar los de integración y E2E al añadir sus primeros escenarios. No marcar una fase validada por un script vacío. CI usa instalación desde el archivo de bloqueo, D1 aislada, migraciones desde cero y estos comandos. Para migraciones posteriores ejecutar también sobre una copia del esquema anterior con filas existentes.

| Nivel | Ejercicio exigido | Evidencia de cierre |
|---|---|---|
| Cálculos | Probar fechas, umbrales inclusivos, saldo de camada, stock, abonos y agregación ponderada. Repetir con cero, dato ausente, corrección y cambio de mes. | Resultados esperados independientes de las funciones probadas. |
| D1 + API | Transacciones, claves foráneas, duplicados, concurrencia, carga retroactiva, reintentos tras pérdida de respuesta y migración desde versión anterior. | Datos antes/después y confirmación de que un error revierte todos los impactos. |
| Permisos | Los cuatro perfiles, dos galpones, lector de A que intenta B, campos financieros restringidos, rol que cambia, cuenta desactivada y usuario fuera de sesión. Incluir URL directa, API, alertas, agregados, descargas y reportes guardados. | Matriz de permitido/denegado; ningún total o archivo revela datos de otro ámbito. |
| Interfaz | Playwright u otra herramienta equivalente desde el login real. Camino correcto, formulario inválido, estado vacío, fallo de red y reintento. Dos sesiones concurrentes; navegación teclado y etiquetas legibles. | Capturas o trazas identificadas por caso y versión. |
| Capacidad | Generar datos sintéticos de tamaño acordado; registrar filas, concurrencia, latencia de consultas importantes, duración y memoria de exportaciones, errores y costo observado en entorno de prueba. | Resultados comparados con objetivos acordados; paginación, índices o estrategia de exportación ajustados donde corresponda. |
| Seguridad y privacidad | Validar consultas parametrizadas y lista de campos permitidos, entradas maliciosas, expiración de sesión, protección de contraseñas, auditoría sin secretos, descarga de archivos y texto que comienza por signo de fórmula en Excel. | Pruebas negativas y revisión de logs, cookies y caché de Android en entorno aislado. |
| Producción | Comparar todos los bindings con el inventario del ambiente; activar reglas y cron correctos, mirar errores, probar HTTPS, instalar PWA, abrir exportación y verificar alertas a través del cambio de fecha. | Identificador del despliegue, versión de esquema y comprobaciones de T31–T32. |

**Datos reutilizables para pruebas.** Dos galpones A/B y corrales A1/A2; un administrador, dos Usuarios con ámbitos distintos, dos operarios y un médico con asignaciones que pueden cambiar. Animal 002 de reemplazo, una cerda con antecedente, un verraco, camada de 9, grupo sin identificar, proveedor y comprador ficticios. Reloj controlable y almacenes con movimientos conocidos. Semillas reproducibles solo en pruebas. Usar las fechas exactas de cada CA; los datos de distintos casos deben poder reiniciarse de forma independiente.

**Prueba completa de la jornada.** Desde un Android de operario, registrar peso y traslado; desde el médico, registrar aplicación y retiro; desde el Usuario, consultar existencias y saldo; desde el Administrador, reasignar un galpón y repetir una exportación. Comparar sumas antes/después y comprobar que los datos del galpón retirado dejan de estar disponibles. Repetir un registro tras una desconexión y contrastar el número efectivo de escrituras.

## Paso a producción y respuesta a incidentes

1. **Entornos y accesos.** Inventariar cuenta Cloudflare del proyecto, permisos de despliegue, dominio, secretos, bases separadas y tareas programadas. Antes de comandos remotos confirmar que la identidad y el recurso corresponden al entorno indicado. Usar datos ficticios en pruebas y prohibir el endpoint de inicialización una vez creado el administrador.
2. **Migración y corte.** Guardar versión de código, estructura de D1 y punto de recuperación previo. Probar migraciones en una copia representativa y verificar llaves, saldos e índices después de aplicarlas. Preferir ampliación de esquema compatible, traslado de datos verificado y retirada posterior de campos antiguos. Registrar filas rechazadas al importar. Los videos son referencias, no una base de datos para poblar producción.
3. **Carga inicial.** Preparar manifiesto de carga (origen, checksum, fecha de corte, filas y responsable). Validar antes del alta, importar con clave estable, reconciliar existencias, alimento y cartera y registrar diferencias con su responsable. No sumar otra vez un lote cuyos animales ya estén individualizados. El responsable confirma los totales antes de abrir operaciones.
4. **Piloto.** Entregar guía breve por perfil con sus tareas diarias y cómo interpretar pendiente, confirmado o vencido. Confirmar en un galpón que el trabajo diario puede terminar y que las alertas llegan a la cuenta correcta. Guardar evidencia con datos ficticios o anonimizados para futuras sesiones.
5. **Despliegue.** Promover la versión exacta ensayada. Registrar migraciones aplicadas y estado del cron. Verificar desde el dominio definitivo y Android. Marcar el resultado con fecha, ambiente, responsable y versión. Vigilar errores de API, conflictos al sincronizar, última ejecución correcta del cron, alertas duplicadas, tiempos de reportes y fallos de exportación.
6. **Reversión.** Ante defecto de código con esquema compatible, volver al despliegue anterior y ejecutar pruebas de humo. Ante daño de datos, detener escrituras y procesos programados afectados, preservar el estado y ensayar recuperación en una base aislada. Comparar saldos y operaciones posteriores al punto elegido antes de cambiar el binding. Restaurar D1 puede perder operaciones posteriores: acordar cómo recuperarlas con quien opera la granja. Reactivar servicios y cron solo tras comprobar no duplicación y saldos.
7. **Cierre.** Aceptar cuando pasen los casos aplicables, estén documentadas las decisiones condicionales, se hayan probado copia y restauración, y el equipo pueda volver a operar tras un incidente. Entregar acceso por los canales previstos, sin registrar claves en documentación o Git.

## Instrucción de arranque para quien ejecute

> Trabaja en este proyecto. Lee `tasks/plan.md`, `tasks/requisitos.md` y `tasks/todo.md`. Comprueba el estado del repositorio y empieza por la primera tarea abierta con dependencias verificadas. Implementa el flujo completo, ejecuta sus pruebas y registra evidencia y commit. Continúa en orden. Cuando haya discrepancia entre la demo y el requisito del cliente, respeta el requisito y registra la decisión. Los valores de ejemplo sirven para pruebas. Mantén separados los entornos y respeta la autorización de publicación vigente.
