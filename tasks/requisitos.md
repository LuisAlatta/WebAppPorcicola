# Requisitos de la web de gestión porcina

Fuentes funcionales: la demostración «video del excel.mp4» y las tres grabaciones y la captura de acceso de MiGranjaPro entregadas por el cliente. **Video** identifica la demostración del Excel y **App** las pantallas o comentarios de la app anterior. El alcance es una granja, con varios galpones. El alimento y los pesos se expresan en kg, el inventario en cabezas y las fechas siguen el calendario local de la granja.

**Cómo leer la lista.** Cada requisito tiene un identificador. **Video** significa que la pantalla, el campo o el resultado es visible. **Diseño** indica una regla propuesta para que los registros de la web sean coherentes. **Ampliación** cubre una necesidad de gestión que va más allá de la demostración. Los valores de ejemplo del Excel sirven para probar la equivalencia y deben poder sustituirse por los parámetros de la granja.

## Plataforma y stack propuesto

La aplicación será una PWA instalable en Android y utilizará una base de datos de Cloudflare. Se propone TypeScript con React y Vite para la interfaz, una API en TypeScript sobre Cloudflare Workers y Cloudflare D1 (SQL con semántica SQLite) para los registros oficiales de la granja. La misma interfaz podrá usarse desde el navegador de una computadora.

El Worker verificará la sesión, el perfil y los galpones autorizados antes de consultar o modificar registros o generar datos para exportaciones PDF y Excel. Las alertas se reevaluarán ante cambios operativos y mediante una tarea programada, incluso si nadie tiene abierta la aplicación. Si se habilita captura sin conexión según GES-06, la PWA guardará borradores en IndexedDB y el servidor volverá a validar permisos y saldos antes de confirmar su sincronización.

## 1. Acceso y operación diaria

- **ACC-01 · Video.** Iniciar sesión con usuario y contraseña y permitir salir. El menú debe dar acceso a consulta, registro de animales, servicios, nacimientos, producción, alimentos, sanidad, parámetros e ingreso de datos.
- **ACC-02 · Video.** Ofrecer formularios para animal, servicio, parto, peso, movimiento, entrada/salida de cerdos, entrada/salida de alimento y actuación sanitaria. Al guardar, el registro debe aparecer en el listado correspondiente y poder consultarse.
- **ACC-03 · Cliente.** Usar cuentas personales con uno de cuatro perfiles: Administrador, Usuario, Operario y Médico veterinario. «Usuario» es el perfil responsable de uno o más galpones. Cada operación requiere el permiso del perfil y la asignación del galpón.
- **ACC-04 · Diseño.** Cada evento debe tener identificador, fecha efectiva, autor y fecha de registro. Indicar si se guardó o si queda pendiente. Reenviar el mismo formulario tras un corte de conexión debe producir un solo evento. Conservar los datos ingresados si falla una validación.

- **ACC-05 · App.** En el acceso móvil mostrar identidad de la granja, usuario, contraseña con control de visibilidad e ingreso. Tras autenticarse, mostrar usuario y perfil, acceso a los módulos permitidos, actualización del panel y cierre de sesión. La captura identifica el desarrollo anterior como MiGranjaPro de Granja Don René. El nombre y el logo definitivos de la web quedan a elección de la granja.
- **ACC-06 · Cliente.** Solo el Administrador crea cuentas y administra su nombre, identificador único, perfil, estado, contraseña y asignaciones desde el módulo Administración. Conservar la autoría histórica de cuentas retiradas. Aplicar esta exclusividad también al acceder directamente al servicio.
- **ACC-07 · Cliente + diseño.** Aplicar permisos por perfil y galpón a lecturas, escrituras, búsquedas, indicadores, alertas, reportes guardados y archivos exportados. El Administrador tiene alcance de granja. Cada cuenta activa con perfil Usuario debe tener uno o más galpones. El Operario y el Médico veterinario acceden según su función y sus asignaciones. Una cuenta sin galpones autorizados no recibe datos de ninguno.

### 1.1. Administración de cuentas, galpones y personal

- **ADM-01 · Cliente.** Ofrecer un módulo Administración exclusivo del Administrador para crear, editar y desactivar cuentas, administrar galpones y gestionar las relaciones entre Usuario, galpón y personal asignado. Ningún otro perfil puede crear cuentas, cambiar perfiles o asignarse galpones.
- **ADM-02 · Cliente.** Desde cada Usuario asignar uno o más galpones. Desde cada galpón mostrar su Usuario responsable y asignar su Operario y su Médico veterinario, seleccionando cuentas activas del perfil correspondiente. Validar las tres relaciones al poner el galpón en operación. Como propuesta, una persona puede atender varios galpones mediante asignaciones explícitas.
- **ADM-03 · Diseño.** Al sustituir responsables, registrar vigencia, autor y asignación anterior. Exigir reemplazo para dejar un galpón operativo con el equipo completo. Si un Usuario perdería su último galpón, asignarle otro o desactivar su cuenta en la misma operación. Las nuevas consultas y exportaciones usan las asignaciones vigentes.
- **ADM-04 · Diseño.** Usar esta distribución inicial de permisos:

| Perfil | Funciones y alcance |
|---|---|
| Administrador | Administra cuentas, galpones y asignaciones. Configura la granja y accede a sus operaciones, finanzas e informes. |
| Usuario | Supervisa sus galpones, personal asignado, animales y producción. Consulta ingresos, egresos y reportes de esos galpones. |
| Operario | Registra movimientos, pesajes, raciones y tareas de campo. Consulta los informes operativos de sus galpones. |
| Médico veterinario | Gestiona sanidad, vacunas, tratamientos y seguimiento reproductivo. Consulta los reportes clínicos de sus galpones. |

Como propuesta inicial, el detalle financiero corresponde al Administrador y al Usuario responsable dentro de sus respectivos ámbitos. El Administrador registra y corrige movimientos financieros. La granja podrá habilitar al Usuario para registrar movimientos en sus galpones. La administración de cuentas y asignaciones queda siempre reservada al Administrador.

## 2. Configuración de la granja

- **CFG-01 · Video.** Mantener catálogos de sexo, estado, etapa, aptitud, ubicación, lote, causas de descarte y muerte, tipo de servicio, estado fisiológico y alimento. Incluir los estados activo, vendido, descartado y muerto, y las aptitudes pie de cría y engorde.
- **CFG-02 · Video.** Configurar por etapa los pesos inicial y final, las edades inicial y final en días y la duración. Se muestran preinicio, inicio, levante, engorde, gestación, cerda en lactancia, cerda vacía y reproductor. Permitir límites abiertos cuando corresponda.
- **CFG-03 · Video.** Asociar una ración a cada categoría y configurar el consumo diario por cabeza. Mostrar el consumo por etapa y por mes. En la demostración, preinicio tiene 0,65 kg diarios, 13,65 kg para 21 días y 19,5 kg para 30 días.
- **CFG-04 · Diseño.** Distinguir la **ubicación física** del **lote de manejo**, la **etapa productiva** y el **estado reproductivo**. Una cerda puede cambiar de estado sin cambiar de corral. Permitir nombres propios de la granja y conservar los valores que tenía cada evento al registrarse.
- **CFG-05 · Diseño.** Versionar parámetros por fecha de vigencia. Un cambio de dieta, duración o nombre debe aplicarse a partir de una fecha explícita. Una categoría ya usada puede retirarse de las opciones nuevas y seguir apareciendo en los informes históricos.

- **CFG-06 · App.** Administrar galpones como ubicaciones identificables con nombre, ubicación o zona, capacidad en cabezas y estado activo. Permitir alta, edición, desactivación y eliminación si carece de registros asociados. Vincular los corrales o piaras de esa instalación al galpón correspondiente.
- **CFG-07 · Diseño.** Calcular ocupación del galpón con los mismos saldos individuales y grupales del inventario. Mostrar ocupadas, capacidad y libres antes de trasladar animales. Exigir reubicación si se quiere cerrar un galpón ocupado y conservar su historial. La granja debe decidir si superar capacidad genera aviso o impide el movimiento.

## 3. Identidad, alta y consulta por animal

- **ANI-01 · Video.** Guardar ID, nombre si se utiliza, número de arete, raza, sexo, fecha de nacimiento, peso al nacer, estado, fecha de ingreso, etapa de ingreso, aptitud, ID de madre y padre, procedencia, ubicación, lote y observaciones.
- **ANI-02 · Diseño.** Asignar un ID único y permanente. Si se cambia un arete, conservar el anterior con su fecha. Permitir progenitores desconocidos o externos identificándolos como tales. Validar sexo de los progenitores conocidos, parentescos circulares y fechas incompatibles.
- **ANI-03 · Video.** Buscar por ID y devolver una ficha con identificación, edad, peso al nacer y actual, estado, procedencia, ubicación y lote. En hembras, incluir servicios, partos, fechas de primer y último parto, crías por sexo y peso promedio de las crías. Mostrar causa de descarte o muerte y fecha de salida cuando correspondan.
- **ANI-04 · Diseño.** Derivar el peso actual del último pesaje válido por fecha y la ubicación actual del último movimiento válido. Calcular la edad a la fecha de consulta o hasta la baja en una ficha histórica. Diferenciar un dato desconocido de un cero registrado.
- **ANI-05 · Video + diseño.** Buscar también por arete y filtrar el padrón por sexo, estado, etapa, ubicación y lote. Desde cada resultado, abrir una cronología de pesajes, movimientos, reproducción y sanidad. Una venta o muerte cierra la presencia en granja y conserva la ficha.

- **ANI-06 · App.** Clasificar el animal como cerda, verraco, lechón o reemplazo y registrar el sexo en un campo propio. Guardar el código como texto para conservar ceros iniciales, alias opcional, raza, galpón, padre y madre opcionales, nacimiento, pesos al nacer y al destete, observación y estado activo. Hacer opcional el peso al destete hasta conocerlo. Si ya existe un pesaje de destete, vincularlo a la ficha.
- **ANI-07 · App + diseño.** Buscar por código, tipo o sexo y combinar los filtros con un galpón o todos los autorizados. Mostrar en el resultado código, alias, tipo, sexo, raza, galpón, estado y pesos disponibles. Incluir reemplazos en los filtros y en la selección sanitaria. Registrar los cambios de tipo con vigencia, sin cambiar el ID ni el número de cabezas.
- **ANI-08 · Diseño.** Distinguir la disponibilidad de una ficha de una salida física. Al desactivar un registro, pedir el motivo y asociar la baja real únicamente cuando corresponda. El botón de estado por sí solo no debe registrar venta o muerte.

## 4. Servicios reproductivos y gestación

- **REP-01 · Video.** Registrar hembra, ubicación, lote, raza de la hembra, padre y raza, fecha y número de servicio, tipo de servicio y aptitud. Admitir monta, inseminación artificial y transferencia de embriones. Permitir procedencia externa del material reproductivo.
- **REP-02 · Video.** Registrar fecha de palpación, estado fisiológico, último parto, fecha probable de parto, días aproximados restantes e indicador de si parió. El catálogo mostrado incluye vacía, posible preñez, gestación y aborto.
- **REP-03 · Diseño.** Relacionar cada servicio con un ciclo de la hembra. Registrar la confirmación de gestación, repetición, aborto o parto como eventos fechados. Una corrección no debe borrar los servicios anteriores. Un parto debe cerrar el ciclo correspondiente una sola vez.
- **REP-04 · Video + diseño.** Calcular fecha probable de parto a partir del servicio y la duración de gestación configurada. Mostrar días restantes respecto al día de consulta, con etiquetas de próximo, previsto hoy o vencido. Retirar de los pendientes los ciclos cerrados. Los colores aparecen en el Excel, pero sus umbrales precisos requieren validación.
- **REP-05 · Diseño.** Validar hembra presente en la granja en la fecha del evento, fechas en secuencia y vínculo con el servicio correcto. Permitir incorporar una hembra comprada ya gestante o con partos anteriores mediante un antecedente identificado, sin inventar servicios de la granja.

- **REP-06 · App.** En el registro reproductivo mostrar cerda, verraco, inseminación, número de parto, estado reproductivo, vigencia del registro, observaciones y fecha probable de parto. Permitir cálculo automático y fecha manual. La app muestra inseminación + 114 días y el Excel usa 116 en su ejemplo. Usar el parámetro vigente de la granja y guardar los días usados o la fecha manual con su motivo.
- **REP-07 · App.** Calcular en secuencia desde el destete real de la camada anterior de esa cerda: celo previsto = destete + intervalo 1; primera repetición = celo previsto + intervalo 2; segunda repetición = primera repetición + intervalo 3. Guardar los tres intervalos configurados en el registro. Ofrecer «Recalcular fechas» y conservar fechas reales observadas por separado. Una previsión no acredita un servicio realizado.
- **REP-08 · App + diseño.** Al guardar, la ficha de edición, la tarjeta de resultados, la agenda y los informes deben usar los intervalos y fechas de ese mismo registro. El cliente reporta que con 5, 10 y 20 días el cálculo es correcto, pero el resumen todavía imprime +18 y +21. Si se conserva la tercera repetición de la otra versión, hacerla opcional con su propio intervalo y base explícita.
- **REP-09 · App + diseño.** Consultar ciclos por rango de fechas inclusivo. Identificar el criterio usado, por ejemplo fecha de inseminación. Mostrar la pareja, estado, destete de referencia, celo, repeticiones, parto probable, crías por sexo y vigencia. Si no hay destete previo conocido, permitir registrar el servicio y dejar pendientes los cálculos dependientes del destete.
- **REP-10 · App + diseño.** Guardar o editar un ciclo aun si ya existe una vacuna válida generada para ese animal y evento. Reutilizar la programación existente y comunicar por separado cualquier conflicto real. Guardar dos veces debe conservar un ciclo y una sola programación por regla y evento.

## 5. Parto, camada, lactancia y destete

- **CAM-01 · Video.** Registrar ID de madre y padre, fecha de parto, número de parto, ubicación, lote, machos, hembras, vivos, muertos, peso promedio de crías y observaciones. Cada camada debe quedar identificada y vinculada a su madre.
- **CAM-02 · Video.** Calcular total de crías y mortalidad al nacimiento. En el ejemplo de 3 hembras y 6 machos, con 8 vivos y 1 muerto, se obtienen 9 crías y 11,1 % de mortalidad. Conservar el peso con decimales.
- **CAM-03 · Diseño.** Exigir conteos enteros no negativos. Para la modalidad del Excel, machos + hembras debe coincidir con vivos + muertos. Si se ignora el sexo de alguna cría, registrarla como pendiente de sexado y hacer visible ese saldo hasta clasificarla.
- **CAM-04 · Video + diseño.** Calcular destete probable desde el parto y los días de lactancia configurados. Por ejemplo, 19 de mayo + 21 días da 9 de junio. Mostrar aparte la fecha real de destete. Una fecha prevista no debe ejecutar un movimiento de animales.
- **CAM-05 · Diseño.** Al confirmar el parto, sumar únicamente los nacidos vivos a la existencia, asociados a la camada. Si se asigna un arete después, convertir una cabeza del grupo en una ficha individual mediante la misma operación. El inventario total debe conservarse.
- **CAM-06 · Ampliación.** Registrar muertes durante lactancia con fecha y causa, traslados o adopciones entre camadas, destetes parciales o completos, cantidad, peso al destete, destino y responsable. La cantidad destetada debe caber en el saldo vivo de la camada. Conciliar nacidos vivos + recibidos − cedidos − bajas − destetados con los lechones pendientes.
- **CAM-07 · Diseño.** Diferenciar nacidos muertos, muertes posteriores y bajas de animales adultos. Marcar si el parto ocurrió antes del ingreso de la madre para que su historial reproductivo no incremente las existencias actuales de esta granja.

- **CAM-08 · App + diseño.** En la ficha reproductiva registrar fecha real del parto, crías hembras y machos, vivos y muertos, y destetados por sexo. Vincular los datos a los eventos de CAM-01 y CAM-06. Distinguir el destete de la camada anterior que inicia el calendario postdestete del destete de la camada nacida en este ciclo. Validar saldos por sexo cuando el desglose esté disponible.

## 6. Producción, pesajes y movimientos

- **PRO-01 · Video.** La sección de producción debe dar acceso al consecutivo de pesos, registro de movimientos, flujo de cerdos e informes de producción.
- **PRO-02 · Video.** Guardar para cada pesaje el ID del animal, ubicación, lote, fecha, peso en kg y etapa. Conservar las mediciones anteriores. Un pesaje histórico debe conservar su lote aunque el animal cambie después.
- **PRO-03 · Diseño.** Exigir un peso positivo y una fecha compatible con la presencia del animal. Resolver pesajes del mismo día con hora u orden explícito. Corregir un pesaje debe actualizar el informe y la ficha cuando corresponda.
- **PRO-04 · Video.** Registrar ID del animal, fecha, ubicación y lote de origen y de llegada. Admitir cambios de lote dentro de la misma ubicación y cambios de ubicación manteniendo el lote.
- **PRO-05 · Diseño.** Comprobar el origen vigente a la fecha del traslado. Descontar origen y sumar destino en una sola operación. Si cambia la etapa, conservar ambas etapas. Para grupos sin arete, registrar cantidades por sexo y rechazar cantidades superiores a las disponibles.
- **PRO-06 · Ampliación.** Calcular ganancia diaria entre dos pesajes válidos del mismo animal como diferencia de kg dividida por días transcurridos. Mostrar fechas y pesos usados. Si los pesajes son del mismo día, no calcular una tasa diaria.

## 7. Flujo e inventario de cerdos

- **INV-01 · Video.** Registrar entradas y salidas con fecha, etapa, cantidad de machos, cantidad de hembras y total. En salidas, registrar causa y cuántos corresponden a muerte. Mostrar entradas, salidas, disponibles y mortalidad por etapa y total.
- **INV-02 · Diseño.** Identificar para cada evento su origen: saldo inicial, compra, nacimiento, venta, muerte, traslado o ajuste. Registrar un inventario inicial por fecha, ubicación, lote, etapa y sexo. Poder reconstruir las existencias a cualquier fecha.
- **INV-03 · Diseño.** Existencia final en un grupo = inicial + entradas externas + nacidos vivos + traslados recibidos − salidas externas − muertes posteriores al nacimiento − traslados enviados ± ajustes. Las categorías deben ser excluyentes. En el total de la granja los traslados internos se cancelan.
- **INV-04 · Diseño.** Una venta o muerte de un animal identificado debe actualizar ficha e inventario con el mismo evento. Si estaba dentro de un grupo, el desglose debe poder indicar cuántos tienen ficha y cuántos quedan sin identificar. El registro individual y la operación por cantidades acceden al mismo saldo.
- **INV-05 · Diseño.** Impedir saldos negativos por fecha, etapa, lote y sexo, incluso si dos personas registran salidas simultáneas. Al ingresar una corrección retroactiva, comprobar los saldos posteriores y mostrar qué movimientos son incompatibles.
- **INV-06 · Video + diseño.** Mostrar muertes y porcentaje con su denominador y periodo. El ejemplo del Excel da 2 muertos sobre 37 entradas de preinicio, 5,4 %. El total mostrado de 1,7 % no equivale a 4 muertes sobre 130 entradas. Conservar por separado el indicador por etapa y una tasa global definida por la granja.
- **INV-07 · Ampliación.** Registrar conteos físicos y comparar con saldo esperado. Ajustar solo la diferencia aprobada, con fecha, motivo y responsable. Consultar el detalle de eventos que explica cada saldo.

## 8. Alimentación y abastecimiento

- **ALI-01 · Video.** Registrar cada entrada o salida con tipo de alimento, fecha y kg. Mostrar entradas acumuladas, salidas acumuladas y disponible por alimento. Ejemplo visible: 602 kg recibidos − 123 kg retirados = 479 kg disponibles de preinicio.
- **ALI-02 · Video + diseño.** Estimar necesidad diaria por categoría multiplicando las cabezas presentes por el consumo diario configurado. Si varias categorías usan el mismo alimento, sumar sus necesidades. La proyección por etapa usa los días de la etapa y la mensual del ejemplo usa 30 días.
- **ALI-03 · Video.** Comparar por separado el disponible con las necesidades del día, etapa y mes. En el ejemplo, con 479 kg disponibles y 22,75 kg diarios, alcanzan para la etapa de 21 días (477,75 kg), pero faltan 203,50 kg para 30 días (682,50 kg). Mostrar el faltante en kg además del color.
- **ALI-04 · Diseño.** Distinguir las proyecciones del consumo efectivamente retirado de almacén. Pronosticar alimento no debe descontarlo. Si una categoría carece de duración o ración, indicar qué falta para calcular esa proyección. Conservar el valor real cero cuando haya cero cabezas.
- **ALI-05 · Ampliación.** Registrar saldo inicial, proveedor, lote de alimento, costo por kg, ubicación del almacén, destino de salida y motivo de merma. Impedir retirar más de lo disponible a esa fecha. Calcular días de cobertura cuando exista demanda positiva.
- **ALI-06 · Ampliación.** Si se requiere conversión alimenticia, usar kg de alimento realmente consumidos y kg de ganancia del mismo grupo y periodo. Distinguir entregas, devoluciones y mermas. No publicar el índice cuando falten pesajes comparables o el denominador no sea positivo.

- **ALI-07 · App + diseño.** Permitir imputar el consumo real con cantidad y costo a un galpón o a un animal autorizado. Si se registra para un individuo, su importe participa una sola vez en el total del galpón. El costo de alimentación por mes debe reconciliarse con esos movimientos valorizados y con el reporte del periodo.

## 9. Control sanitario

- **SAN-01 · Video.** Registrar animal, ubicación, lote, fecha, evento, producto, dosis con unidad, responsable y observaciones. Mostrar los registros por animal y permitir filtrarlos por lote, fecha y producto.
- **SAN-02 · Diseño.** Conservar producto, unidad, cantidad y ubicación reales del evento. Un cambio posterior de lote no debe modificar su historial sanitario. El catálogo permite registrar actos como vacunación, tratamiento o desparasitación.
- **SAN-03 · Ampliación.** Permitir una aplicación grupal guardando los animales o la composición del grupo en la fecha de aplicación. Registrar lote del producto, próxima aplicación y, si corresponde, fin del periodo de retiro indicado por el responsable sanitario. Mostrar el aviso al preparar una salida.
- **SAN-04 · Ampliación.** Relacionar bajas sanitarias con un único evento de muerte, causa y responsable. Elaborar el historial y la agenda a partir de los eventos reales y las fechas programadas.

- **SAN-05 · App.** Administrar reglas de vacunación con nombre de vacuna, categoría objetivo, evento base, desplazamiento en días y estado activo. Crear, editar, filtrar por evento, desactivar y retirar reglas conservando el historial de aplicaciones. Categorías observadas: cerda primeriza, cerda multípara, verraco, lechón y reemplazo. Eventos disponibles: parto, semestral, nacimiento, edad y manual.
- **SAN-06 · App + diseño.** Evaluar automáticamente las reglas activas al dar de alta un animal elegible o al confirmar su evento base. Ofrecer también «Generar desde reglas» por animal. Debe funcionar cualquiera sea el orden de creación de la regla y del animal. Al activar una regla para animales existentes, mostrar cuántos son elegibles y generar sus pendientes una sola vez.
- **SAN-07 · Diseño.** Calcular fecha programada a partir del evento de ese animal y los días de la regla. Para nacimiento usar fecha de nacimiento; para parto indicar si la base es probable o real; para edad documentar la edad objetivo; para semestral guardar fecha de referencia y criterio de recurrencia; para manual exigir fecha elegida. Si falta una base, informar cuál es y permitir completar el dato. Ante una corrección recalcular los pendientes afectados y conservar las aplicaciones reales.
- **SAN-08 · App.** Programar o registrar una vacuna con animal, nombre, fecha programada, fecha aplicada, estado, observación y vigencia. Filtrar por fecha inicial, final y tipo de animal. Indicar qué fecha se filtra y admitir pendientes sin fecha de aplicación. Registrar la aplicación en el historial sanitario y actualizar los contadores y alertas relacionados.
- **SAN-09 · App + diseño.** Diferenciar regla, programación y aplicación. Usar animal, regla, evento de origen y ocurrencia para reconocer reintentos sin crear duplicados. Si una programación manual coincide con una generada, mostrar el registro existente para conciliarlo. Una misma fecha por sí sola no debe impedir otra vacuna distinta.
- **SAN-10 · App + diseño.** Ofrecer tratamientos como módulo de salud y seguimiento por animal, vinculado al historial de SAN-01 a SAN-04. Los videos muestran el acceso; los campos y reglas de tratamiento se toman de la especificación sanitaria base.

## 10. Informes, filtros y agenda

- **INF-01 · Video.** Informe de pesos en tabla y gráfico. Agrupar pesajes por fecha y etapa, filtrar por ubicación, lote e ID animal y mostrar peso promedio en kg. Calcular el total sobre los pesajes filtrados, con su cantidad de observaciones.
- **INF-02 · Video.** Informe de nacimientos con filtros por madre, ubicación y lote. Mostrar suma de crías, suma de muertos y promedio de los porcentajes de mortalidad de las camadas seleccionadas. Tabla y gráfico deben reflejar los mismos filtros.
- **INF-03 · Diseño.** Si se añade mortalidad global, calcular 100 × suma de muertos / suma de nacidos y mostrarla con un nombre propio. Ejemplo: en dos camadas de 10 y 20, con un muerto en cada una, el promedio de tasas es 7,5 % y la tasa conjunta es 6,7 %. Excluir filas vacías y mostrar «sin datos» cuando no exista denominador.
- **INF-04 · Video + diseño.** Permitir actualizar los informes y filtrar los registros. En la web, una operación confirmada debe reflejarse al consultar de nuevo. Mostrar fecha de corte y permitir abrir los registros que componen cada total.
- **INF-05 · Ampliación.** Ofrecer una agenda de palpaciones, partos previstos, destetes previstos y actuaciones sanitarias programadas, con fecha, animal o lote, responsable y estado. Al completar la tarea, vincular el evento real y conservar la diferencia respecto a la fecha prevista.
- **INF-06 · Cliente.** Exportar cualquier reporte operativo, sanitario o financiero autorizado, personalizado o predefinido, con sus filtros, unidades, periodo y fecha de generación en PDF y Excel (.xlsx).

- **INF-07 · App.** Mostrar en inicio animales, galpones, ventas, costo de alimentación, vacunas pendientes y partos próximos. Incluir gráficos de ventas por mes, animales por tipo y costo de alimentación por mes. Identificar periodo, unidad monetaria y galpones incluidos. La demo muestra soles (S/). Distinguir cero registrado de falta de datos.
- **INF-08 · App + diseño.** Crear alertas manuales y generar alertas desde eventos de la granja. Listar pendientes y atendidas con fecha, clase, animal, motivo y vigencia. Cubrir al menos parto próximo y vacuna próxima. Regenerar no debe multiplicar avisos del mismo evento. Registrar quién atendió la alerta y enlazar la aplicación o el parto si ya se realizó.
- **INF-09 · App.** El reporte por rango de fechas reúne importes de ventas y alimentación y cantidades de vacunas y registros reproductivos. Exportar y compartir en PDF y Excel con los mismos filtros, galpones y totales de pantalla. En la web ofrecer descarga del archivo y, donde esté disponible, el menú de compartir del dispositivo.

### Generador de reportes personalizados

- **RPT-01 · Cliente.** Permitir que la persona indique título y finalidad del reporte y elija los datos que necesita. Ofrecer como fuentes los módulos autorizados de animales, galpones, inventario, movimientos, pesajes, reproducción, camadas, alimentación, sanidad, alertas, compras, ventas, suministros y finanzas. Incluir personal y asignaciones conforme al permiso de administración.
- **RPT-02 · Cliente + diseño.** Seleccionar y ordenar columnas, elegir qué representa cada fila (un animal, un evento o un mes por galpón, por ejemplo), definir periodo y fecha de referencia, combinar filtros, ordenar y agrupar. Ofrecer conteos, sumas, promedios y porcentajes compatibles con el dato, con su unidad y denominador.
- **RPT-03 · Diseño.** Combinar fuentes mediante relaciones válidas por animal, galpón, lote, operación o periodo. En un reporte de ventas y alimentación por galpón, totalizar cada fuente por galpón antes de combinarla. Impedir combinaciones que multipliquen movimientos y ofrecer una agrupación válida. Los campos restringidos tampoco podrán usarse como filtros o totales.
- **RPT-04 · Cliente + diseño.** Previsualizar detalle o resumen, subtotales, total general y filtros activos. Guardar la definición con nombre y finalidad, editarla, duplicarla y volver a ejecutarla con otras fechas. Revalidar permisos al ejecutar y exportar, incluso si cambiaron los galpones asignados desde que se guardó la definición.
- **RPT-05 · Cliente.** Generar PDF con título, finalidad, periodo, encabezados repetidos y totales. Generar Excel con encabezados, fechas y cantidades en celdas de sus tipos correspondientes. Ambos archivos deben coincidir con la vista previa completa, incluidas todas las filas filtradas aunque la pantalla use paginación.
- **RPT-06 · Diseño.** Ejemplos que deben poder construirse sin desarrollo adicional: el Usuario compara ingresos, egresos y saldo mensual por galpón; el Operario lista animales de un lote con su último peso; el Médico veterinario consulta vacunas pendientes por animal, galpón y fecha. Cada uno elige los campos autorizados para su decisión.

### 10.1. Alertas y notificaciones automáticas

Los tipos de alerta y el plazo de siete días son requisitos del cliente. Las reglas operativas que siguen son propuestas para hacerlos verificables. «Hoy» corresponde a la fecha local de la granja.

- **ALE-01 · Cliente + diseño.** Mostrar seis grupos en el panel, cada uno con contador y acceso a su listado: vacunas vencidas, vacunas para hoy, vacunas próximas dentro de 7 días, partos vencidos, partos para hoy y partos próximos dentro de 7 días. Para un evento pendiente con fecha prevista F y fecha local H, clasificarlo como vencido si F < H, para hoy si F = H y próximo si H < F ≤ H + 7 días. El día 7 está incluido. Un evento con fecha posterior sigue visible en agenda.
- **ALE-02 · Cliente + diseño.** Generar los avisos sin que el usuario tenga que pulsar un botón. Recalcular al cambiar de día y al crear, aplicar, reprogramar, corregir o cancelar el evento. Recuperar pendientes tras una interrupción. Cada ocurrencia tendrá una sola alerta que cambia de grupo con la fecha. Resolver o cerrar la alerta cuando el hecho de origen se complete o deje de corresponder, conservando el motivo.
- **ALE-03 · Cliente + diseño.** Para vacunas usar la fecha programada de cada dosis pendiente. Mostrar animal, galpón, vacuna y fecha. Al registrar la aplicación cerrar esa dosis y mantener independientes los refuerzos u otras dosis. Para partos usar la fecha probable vigente del ciclo abierto de la cerda, incluida una fecha manual válida. Al registrar el parto real, aborto o cierre del ciclo, retirar ese aviso de pendientes. Un parto vencido significa que pasó la fecha prevista sin desenlace registrado.
- **ALE-04 · Cliente + diseño.** Para cada camada con crías por destetar, generar aviso por la fecha prevista de destete. Mostrar madre, camada, galpón, fecha y saldo pendiente. Usar las franjas de siete días, hoy y vencido como propuesta inicial. Un destete parcial actualiza la cantidad de la misma alerta. Resolverla al completar el destete o quedar la camada sin crías pendientes.
- **ALE-05 · Cliente + diseño.** Generar alerta de alimentación pendiente cuando llegue la hora o cierre del turno de una ración programada y aún quede cantidad por suministrar o confirmar. Configurar destino (galpón, lote o animal), alimento, cantidad, fecha y turno. Mostrar cantidad prevista, entregada y pendiente. Un registro parcial reduce el saldo del aviso. El aviso se resuelve al completar la entrega o al justificar su cancelación. Una proyección mensual de consumo por sí sola no acredita una ración pendiente.
- **ALE-06 · Cliente + diseño.** Generar alertas de tratamientos próximos desde la próxima aplicación registrada en el plan de tratamiento del animal o lote. Mostrar tratamiento, destinatario, responsable y fecha. Como propuesta inicial, avisar desde siete días antes y mantener el pendiente si vence. Registrar la actuación cierra esa ocurrencia. Una próxima aplicación con otra fecha mantiene su aviso propio.
- **ALE-07 · Cliente + diseño.** Generar alerta de bajo peso cuando el último pesaje válido sea inferior al mínimo configurado para la etapa y, cuando corresponda, la edad del animal. Mostrar peso medido y fecha, mínimo esperado y diferencia en kg. Un peso igual al mínimo cumple el umbral. Si falta peso o referencia, indicar qué dato falta. Un pesaje corregido o uno posterior que alcance el mínimo actualiza o resuelve la alerta.
- **ALE-08 · Cliente + diseño.** Sugerir para venta los animales activos destinados a engorde cuyo último peso válido alcance o supere el objetivo comercial configurado. Mostrar animal, galpón, peso, fecha y umbral. Excluir animales con restricciones activas de salida; volver a evaluar al cambiar la restricción, el peso, la aptitud o el estado. El encargado decide si registra la venta; la sugerencia no modifica las existencias.
- **ALE-09 · Cliente + diseño.** Mantener una bandeja de alertas críticas. El administrador define qué situaciones escalan y a qué responsables se notifican, por ejemplo un evento vencido por más de un plazo acordado. La alerta crítica conserva animal o lote, regla que la activó, antigüedad, responsable y vínculo al evento original. Escalar cambia la prioridad del mismo aviso y lo destaca en el panel.
- **ALE-10 · Cliente + diseño.** Notificar dentro de la web a los responsables autorizados para el galpón cuando aparece una alerta, pasa a hoy o vencida, o alcanza prioridad crítica. Mostrar indicador de no leídas, fecha, tipo, prioridad y enlace a la actuación. Leer una notificación no completa la tarea. Evitar reenvíos por recalcular el mismo estado. Permitir consultar a quién se notificó y cuándo. Los canales externos y los destinatarios adicionales quedan por definir con la granja.

## 11. Operación, ventas y continuidad

- **GES-01 · Cliente + diseño.** Registrar compra o venta con fecha, proveedor o cliente, animales o lote, cabezas por sexo, peso cuando corresponda, unidad de precio, moneda, importe y documento de referencia. Vincular la operación con su movimiento de inventario y financiero.
- **GES-02 · Cliente + diseño.** Registrar costos de compra, alimento real consumido, sanidad y demás gastos por galpón, lote y periodo. Mostrar ingresos, egresos, costos imputados y cobertura de datos. Calcular margen bajo un criterio explícito de asignación de gastos y distinguirlo del saldo de caja.
- **GES-03 · Diseño.** Registrar quién creó, corrigió o anuló cada evento, cuándo y por qué. Las correcciones deben reconstruir ficha, inventario e informes afectados. Mantener disponible para el responsable el registro original.
- **GES-04 · Diseño.** Permitir las operaciones habituales desde celular en corral y desde computadora en oficina. Buscar por ID o arete, ingresar pesos decimales, leer unidades junto a los campos y ver confirmación de guardado. Dos usuarios deben poder trabajar sin sobrescribir registros ajenos.
- **GES-05 · Diseño.** Mantener copias de seguridad y probar su restauración recuperando usuarios, catálogos, eventos, historiales y saldos de una fecha conocida. Definir con la granja la frecuencia y cuánto tiempo de datos puede permitirse perder.
- **GES-06 · Ampliación condicionada.** Si en los corrales se trabaja sin conexión, guardar borradores identificados como pendientes y sincronizarlos una sola vez. Revalidar existencias en el servidor y avisar al operario si otro movimiento consumió el saldo.

### 11.1. Módulo de finanzas

- **FIN-01 · Cliente.** Mantener un registro de ingresos y egresos de toda la granja. Cubrir venta y compra de animales, venta de productos o suministros, compra de alimento, medicinas, vacunas, materiales y equipos, servicios veterinarios, personal, transporte, mantenimiento y otros conceptos que defina el Administrador.
- **FIN-02 · Cliente + diseño.** Registrar tipo, categoría, concepto, fecha de operación, galpón o alcance general, importe, moneda, contraparte, referencia y responsable. Asociar animal, lote, suministro y cantidad cuando corresponda. Una operación de varios galpones admite distribución por importes cuya suma debe coincidir con el total.
- **FIN-03 · Diseño.** Distinguir importe de compra o venta, cobros o pagos efectivos y saldo pendiente. Registrar fecha, medio e importe de cada abono. Una venta de S/ 1.000 cobrada en abonos de S/ 400 y S/ 600 es una sola venta. El flujo de caja refleja cada cobro en su fecha.
- **FIN-04 · Cliente + diseño.** Vincular las compras y ventas de animales y suministros a un identificador de operación. Comprar alimento registra compra y entrada al almacén. Su consumo posterior imputa costo al galpón sin generar otro pago. Asociar devoluciones, anulaciones o correcciones con su original y recalcular saldos e informes.
- **FIN-05 · Cliente.** Mostrar ingresos, egresos, cobros, pagos, saldo inicial y final de caja y cuentas por cobrar y por pagar. Filtrar por periodo, categoría, galpón, animal, lote, proveedor o cliente y consultar el documento de origen. Identificar qué totales usan fecha de operación o fecha de pago. Separar monedas si hay varias.
- **FIN-06 · Cliente.** Ofrecer informes de ingresos y egresos por periodo, costos de alimentación y sanidad, compras de suministros, ventas de animales, flujo de caja y resultado por galpón. Identificar gastos generales pendientes de distribución. Permitir personalizar y exportar todos los informes financieros en PDF y Excel con los mismos permisos y filtros que en pantalla.

## 12. Casos de aceptación

| Caso | Operación | Resultado exigido |
|---|---|---|
| 01. Alta e identidad | Guardar dos veces el mismo formulario de alta y buscar el arete. | Una ficha y una sola entrada al inventario. |
| 02. Servicio | Usar 116 días en el parámetro de gestación y registrar un servicio el 23/01/2021. | Parto previsto el 19/05/2021. Una vez confirmado el parto desaparece del listado de pendientes. |
| 03. Camada | Registrar 3 hembras, 6 machos, 8 vivos y 1 muerto. Identificar posteriormente a dos vivos. | 9 crías, mortalidad 11,1 %, incremento neto de 8 cabezas. Tras identificar, 2 tienen ficha y 6 siguen agrupadas. |
| 04. Traslado | Mover 5 animales desde un corral con 12 a otro con 8. | Saldos 7 y 13. Total 20. Origen, destino, fecha y responsable consultables. |
| 05. Baja | Vender un animal y volver a enviar la confirmación. | Una venta, una salida y una ficha cerrada. No se admite un movimiento posterior a la venta mientras siga de baja. |
| 06. Pesajes | Registrar 40 kg el día 10 y 44 kg el día 20. Después cargar 38 kg del día 5. | La ficha sigue indicando 44 kg. El historial contiene los tres pesajes ordenados por fecha. |
| 07. Alimento | Registrar 602 kg de entrada y 123 kg de salida con la demanda de ALI-03. | Disponible 479 kg, cobertura de la etapa y faltante mensual de 203,50 kg. Consultar el pronóstico no cambia el saldo. |
| 08. Sanidad | Registrar una aplicación en piara 01 y trasladar el animal a piara 02 al día siguiente. | La ficha actual indica piara 02 y la aplicación conserva piara 01. |
| 09. Destete | De 8 nacidos vivos muere 1 en lactancia y se destetan 6. | Queda 1 pendiente en camada, 6 en destino y 1 baja posterior al nacimiento. El destete no aumenta el total de la granja. |
| 10. Reportes | Filtrar las dos camadas de INF-03 y luego elegir un rango sin registros. | Promedio por camada 7,5 %, tasa conjunta 6,7 %. Un rango vacío no arroja divisiones por cero ni fechas ficticias. |
| 11. Concurrencia | Dos usuarios intentan retirar 7 cabezas cada uno de un grupo con 10. | Solo se confirma una salida de 7. El segundo usuario ve el saldo actualizado de 3. |
| 12. Corrección | Corregir un parto de 8 a 7 nacidos vivos cuando ya se distribuyeron los 8. | Se identifica la distribución incompatible y se exige reconciliarla antes de confirmar la corrección. |
| 13. Vacuna de reemplazo | Crear regla activa «Glasser», categoría reemplazo, nacimiento +60. Dar de alta el animal 002 con nacimiento 06/06/2026 y filtrar del 06/05/2026 al 31/10/2026. | Aparece una vacuna pendiente para el 05/08/2026. Regenerar desde reglas o volver a guardar la ficha mantiene una sola. |
| 14. Celo y repeticiones | Con destete el 20/05/2026, ingresar intervalos de 5, 10 y 20 días, recalcular, guardar y volver a abrir. | Celo 25/05, primera repetición 04/06 y segunda 24/06. La tarjeta y el formulario muestran exactamente +5, +10 y +20. |
| 15. Guardar reproducción con vacuna existente | Editar observaciones de un ciclo para el que ya se generó la vacuna y guardar dos veces. | Se conservan las observaciones y queda una vacuna pendiente. La coincidencia no impide el guardado. |
| 16. Parto probable | Registrar servicio el 25/05/2026 con parámetro de 114 días y luego ingresar una fecha manual. | El cálculo inicial da 16/09/2026. La agenda refleja la fecha manual tras guardar y conserva la procedencia de la fecha. |
| 17. Permisos por galpón | Asignar solo A a un operador, con animales, ventas y vacunas en A y B. Abrir listado, enlace directo a B, panel y reporte. | Solo aparecen datos de A, la operación directa sobre B se deniega y el archivo exportado tampoco incluye importes de B. |
| 18. Exportación y costos | Registrar una venta por S/ 180 y un consumo valorizado de S/ 24 en A durante el mes seleccionado. Exportar ambos formatos. | Pantalla, PDF y Excel coinciden en S/ 180 y S/ 24 para ese mes y galpón. El consumo individual se contabiliza una vez. |
| 19. Alertas | Generar dos veces avisos para el mismo parto previsto y la misma vacuna pendiente. Registrar la aplicación y volver a consultar. | Hay un aviso por evento. La vacuna sale del conteo pendiente y su alerta queda resuelta con referencia a la aplicación. |
| 20. Regla porcina y corrección de fecha | Configurar dos reglas con igual vacuna para eventos diferentes. Corregir la fecha de un evento que tiene una vacuna pendiente y otra ya aplicada. | Solo se recalculan las pendientes afectadas; las aplicaciones conservan fecha, responsable y vínculo con la ocurrencia original. |
| 21. Límites del calendario | Con fecha local 10/08, programar vacunas y partos pendientes para 09, 10, 11, 17 y 18/08. | Para cada tipo hay 1 vencido, 1 para hoy y 2 próximos. El del 18 solo está en agenda. Al pasar al 11/08 se reclasifican sin duplicar avisos. |
| 22. Reprogramación y cierre | Mover una vacuna de hoy a dentro de 10 días, aplicar otra vencida y registrar el parto real de una cerda con aviso. | Se actualizan los tres listados y sus contadores. Ninguno sigue reclamando la acción anterior. |
| 23. Destete y tratamiento | Destetar 6 de 8 crías pendientes y registrar la aplicación de hoy de un tratamiento que tiene otra dosis en 3 días. | La misma alerta de camada queda con saldo 2. La dosis de hoy queda atendida y la siguiente conserva su aviso. |
| 24. Alimentación pendiente | Vence el turno de una entrega prevista de 20 kg con 12 kg confirmados. Registrar los 8 kg restantes. | El aviso identifica destino, turno y saldo de 8 kg. Se resuelve con la segunda entrega. |
| 25. Umbrales de peso | Con mínimo de etapa de 40 kg, registrar 39 y después 40 kg. Con objetivo comercial de prueba de 100 kg, registrar 100 kg para un animal de engorde elegible. | El aviso de bajo peso se abre y luego se resuelve. El segundo animal aparece una vez como candidato a venta; el inventario conserva el mismo total. |
| 26. Crítica y notificación | Una alerta de A alcanza el umbral crítico configurado. Recalcular dos veces y consultar como responsable de A y como operador asignado solo a B. | El responsable de A recibe una notificación por ese cambio de prioridad. Leerla deja la tarea pendiente. El operador de B no ve ni recibe información de A. |
| 27. Administración exclusiva | Intentar crear una cuenta o reasignar un galpón con cada uno de los cuatro perfiles, desde el menú y por acceso directo. | Solo el Administrador puede hacerlo; los otros tres intentos no modifican ninguna asignación ni cuenta. |
| 28. Equipo del galpón | Asignar A y B a un Usuario; seleccionar Operario y Médico veterinario para cada galpón y sustituir al veterinario de A. | El Usuario ve A y B; cada profesional ve sus galpones. El cambio se registra y el anterior pierde acceso a A. |
| 29. Reporte a medida | En A hay ventas de S/ 100 y S/ 200 y tres consumos de S/ 10. Elegir galpón, ventas y costo de alimentación; guardar el reporte y exportarlo. | Vista previa, PDF y Excel muestran una fila para A, S/ 300 de ventas y S/ 30 de consumo. |
| 30. Compra y uso de suministros | Comprar y pagar alimento por S/ 500 y usar S/ 120 en el galpón A. | Caja registra un pago de S/ 500; el reporte de A muestra S/ 120 consumidos. El consumo no genera otro egreso de caja. |
| 31. Venta a crédito | Vender por S/ 1.000, cobrar S/ 400 en enero y S/ 600 en febrero. | Una venta por S/ 1.000; al cierre de enero quedan S/ 600 por cobrar. Las exportaciones de caja de enero y febrero reflejan S/ 400 y S/ 600 respectivamente. |
| 32. Reporte guardado y cambio de acceso | Un Usuario guarda un reporte financiero de A y B. El Administrador le retira B. Volver a ejecutar y exportar. | La nueva vista y los archivos solo incluyen A. Ni los totales, ni las columnas, ni los filtros permiten recuperar información de B. |

## 13. Reglas por acordar antes de cerrar el desarrollo

1. **Identificación.** ¿Desde cuándo se coloca arete y qué animales se gestionan por lote? ¿Cómo se conoce el sexo de las bajas al nacimiento? Conservar los saldos sin sexar hasta disponer del dato si la granja lo necesita.
2. **Reproducción.** Definir cuándo varios servicios pertenecen al mismo celo, qué fecha inicia el cálculo de parto probable, cómo numerar servicios y partos históricos y qué anticipación deben tener los avisos. En la demo aparecen 116 días de gestación y 21 de lactancia como parámetros.
3. **Etapas y raciones.** Acordar si el cambio de etapa es manual, sugerido por edad o peso, o automático. Confirmar qué hacer si peso y edad apuntan a etapas distintas, cómo tratar categorías de duración abierta y si la proyección mensual usa 30 días o mes calendario.
4. **Indicadores.** Aprobar denominador de mortalidad por etapa y global, ponderación del peso promedio de crías entre camadas y tratamiento de pesos desconocidos. Mantener trazable el cálculo elegido.
5. **Alcance operativo.** Confirmar ubicaciones, lotes, usuarios, existencia inicial, necesidad de trabajo sin conexión y si ventas, costos, almacenes y tratamientos grupales entran en la primera entrega.

6. **Calendarios de la app.** Definir cuándo una cerda pasa de primeriza a multípara, el anclaje de la recurrencia semestral, el tratamiento de desplazamientos antes del parto y cuándo el parto real sustituye al previsto. Los nombres y días de vacunación observados son ejemplos de prueba, no un protocolo sanitario prescrito.
7. **Diferencias entre versiones.** La app demuestra 114 días para gestación y el Excel tiene 116; guardar el valor aprobado por la granja. Una pantalla muestra hasta tres repeticiones y otra calcula dos de manera secuencial. Usar las dos verificadas y habilitar la tercera según el manejo acordado. Elegir anticipación de alertas y política de sobreocupación de galpones.
8. **Trabajo local.** La captura dice «Control porcino local». No demuestra sincronización entre dispositivos ni funcionamiento sin red. GES-06 continúa condicionado a cómo se trabajará en los corrales.

9. **Avisos de la granja.** Acordar turnos y horarios de alimentación, mínimos de peso por etapa o edad, peso comercial objetivo, antigüedad aceptable de un pesaje para sugerir venta, criterios de criticidad, responsables y canales de notificación. Los siete días para vacunas y partos son parte del alcance solicitado.

## Referencia temporal del Excel para cotejar la implementación

| Minuto aproximado | Evidencia visible |
|---|---|
| 01:00–03:00 | Acceso, menú, registro, producción, consecutivo de pesos, movimientos y flujo. |
| 03:20–07:10 | Parámetros de evaluación, duración de etapas y consumo de raciones. |
| 07:50–12:00 | Formularios de ingreso, campos del animal y registro en el padrón. |
| 12:20–14:40 | Servicios, palpación, fecha probable y días restantes. |
| 14:45–16:10 | Ingreso de camadas y tabla de nacimientos. |
| 16:15–18:30 | Pesajes, movimientos, entradas y salidas de cerdos. |
| 19:00–22:15 | Registro y control de alimento, stock y necesidades. |
| 22:50–25:15 | Control sanitario y filtros del padrón. |
| 25:50–29:15 | Informes de pesos y nacimientos, tablas, filtros y gráficos. |
| 29:35–32:00 | Consulta consolidada por ID de animal y retorno al inicio. |

## Referencias del desarrollo anterior

| Archivo del cliente | Tramo aproximado | Qué aporta a la web |
|---|---|---|
| WhatsApp Video, 3.13.33 PM | 00:00–00:52 | Alta de un reemplazo desde el celular; código con ceros, alias, raza, galpón, progenitores opcionales y pesos. |
| Mismo video | 00:52–02:16 | Reglas y filtros de vacunación. El cliente señala que no se genera la vacuna incluso al ampliar fechas y probar eventos. El caso 13 fija el resultado esperado. |
| WhatsApp Video, 3.19.38 PM | 00:00–00:26 | Parámetros 5/10/20, cálculo secuencial desde el destete, parto y destete por sexo. Al guardar aparece un aviso de vacuna ya existente. |
| Mismo video | 00:26–00:47 | El cliente confirma que las fechas calculadas son correctas y señala que el resumen muestra +18/+21 en lugar de los valores ingresados. Casos 14 y 15. |
| WhatsApp Video, 3.21.28 PM | 00:00–00:35 | Acceso, inicio, indicadores, gráficos, galpones, capacidad, ubicación y edición de animales. |
| Mismo video | 00:35–00:56 | Reproducción, parto automático o manual, generación de vacunas desde reglas y alertas de parto y vacuna. |
| Mismo video | 00:56–01:15 | Reporte por periodo, exportación y compartir PDF/Excel, usuarios, perfiles, asignaciones de galpones y cierre de sesión. |
| WhatsApp Image, 3.23.12 PM | Captura | Nombre de la app, referencia visual de Granja Don René, usuario, contraseña y opción para mostrarla. |
