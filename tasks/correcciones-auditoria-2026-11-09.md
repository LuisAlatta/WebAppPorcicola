# Correcciones de la auditoría operativa

Solicitud: corregir los problemas numerados 2–11, excluyendo íntegramente
acceso y administración (punto 1), con pruebas, revisión independiente y
commit/push por tarea. No desplegar ni escribir pruebas en producción en esta fase.

## Orden y aceptación

1. Caja: apertura al inicio del día, movimientos de ese día incluidos, consultas
   sin fecha inicial y filtros de moneda/galpón coherentes.
2. Retiros: consultar todos los retiros vigentes sin truncarlos por el historial.
3. Alertas sanitarias: cada animal tratado conserva su seguimiento.
4. Alimento: costo de salida derivado del lote y conversión solo con cobertura
   comparable de animales y periodo.
5. Vacunas: corrección/anulación auditada de aplicaciones y retiros coherentes.
6. Reproducción: parto conectado a lactancia, ficha, inventario y ración;
   indicadores excluyen ciclos cerrados.
7. Ventas grupales: inventario e importe financiero en la misma operación.
8. Padrón: paginación y búsquedas remotas sin selectores truncados a 500.
9. Reportes: población física separada de fichas identificadas.
10. Ubicaciones: impedir galpón/corral contradictorios y avisar sobre capacidad.
11. Turnos omitidos: programación esperada separada de entregas para detectar
    también un turno sin ninguna entrega.

Las nuevas propuestas de producto (almacén de medicamentos, rentabilidad completa,
sincronización sin conexión y respaldos automáticos) no son correcciones de los
hallazgos numerados; se conservan como ampliaciones posteriores.

## Método

Cada implementador tiene archivos propios. El coordinador integra las rutas
compartidas. Un revisor jefe decide si aprueba cada bloque; los rechazos pasan
a una segunda revisión y corrección antes de la nueva evaluación. Las aprobaciones
requieren evidencia de pruebas, no una repetición de revisiones hasta ocultar fallos.
Las pruebas usan bases aisladas y no cambian credenciales ni permisos existentes.

## Registro

- Inicio: `439cdf6`, árbol limpio.
- Caja: aprobado por jefe, 7 pruebas. `5701040` subido.
- Retiros: aprobado por jefe, prueba de más de 500 registros. `29553bd` subido.
- Alertas grupales: aprobado por jefe, dos animales, reintentos y alerta histórica.
  `8768c2e` subido. Retiros + alertas: 7 pruebas focalizadas correctas.
- Costos: primer rechazo por compatibilidad de reintentos antiguos; segunda
  revisión encontró reintegro antiguo sin valor. Se corrigieron ambos y la
  respuesta de reintentos concurrentes. Jefe aprobó, 13 pruebas. `6c46729` subido.
- Reportes: prueba roja de 1 ficha frente a 15 cabezas, corrección y prueba verde;
  jefe y navegador aprobados. `3b03b7f` subido.
- Vacunas: jefe rechazó una carrera de regeneración semestral concurrente;
  segunda revisión y jefe aprobaron el guard transaccional. 8 pruebas focales
  y navegador correctos. `a43a77a` subido.
- Parto/lactancia: pruebas rojas reproducidas; implementación e historial de fecha
  corregida probados (6 suites, 9 casos). Jefe aprobó. `2e141f5` subido.
- Paginación y búsquedas: jefe y segundo revisor aprobaron, incluido retorno
  desde una última página vacía; búsquedas de madre fuera de 500 fichas y selección
  sanitaria conservada entre búsquedas probadas. `ca585a0` subido.
- Conversión y planes: conversión con cobertura comparable y planes independientes
  del stock. Jefe rechazó cancelaciones después de cambiar la ración; se conservó
  identidad y alimento original. Segunda revisión y jefe aprobaron; 7 pruebas de
  planes/alertas y navegador verdes. Conversión: 10 pruebas. `1ee334c` subido.
- Ventas grupales: jefe rechazó que la venta nueva quedara sin corrección
  conjunta. Se añadió anulación auditada, contraasiento sin deuda y controles
  de cobro concurrente en ambos órdenes. Segunda revisión y jefe aprobaron;
  17 pruebas y navegador correctos. `b0ff642` subido.
- Ubicaciones: 16 pruebas de configuración y 3 de camadas; jefe rechazó cambio de
  raíz ocupada y ciclo creado por cambios concurrentes. Snapshot y ocupación
  se comprueban dentro del lote, también en altas/traslados/destetes. Se cerraron
  el retiro de padres/hijos y el orden inverso de altas y restituciones
  retroactivas. La continuidad individual se valida por cada vigencia y el
  inventario se comprueba después de escribir, conservando historias cerradas
  con saldo cero. Segunda revisión y jefe aprobaron: 23 pruebas de ubicaciones,
  8 de inventario, 7 de camadas/parto/migración y 4 de devoluciones. `37001d6`
  subido junto a capacidad.
- Capacidad: 5 pruebas con ubicaciones de inventario, jefe aprobó los avisos.

## Verificación final

- TypeScript, ESLint, build y comprobación del diff correctos.
- Navegador: 34/34 escenarios de módulos operativos correctos.
- La corrida completa de navegador dio 48 correctos y 1 fallo en acceso:
  `access.browser.ts`, «Borrar usuario recordado» no existe en la pantalla.
  El componente de acceso y esa prueba no cambiaron respecto a `439cdf6`;
  se conserva sin corregir por la exclusión explícita del punto 1.
- Regresión de servidor con el código congelado: 250/250 pruebas correctas,
  50 archivos. Comando: `npm test -- --maxWorkers 2`.

## Commits funcionales

Todos subidos a `main`, con aprobación y pruebas por bloque:

| Commit | Mensaje |
| --- | --- |
| `5701040` | se corrigieron los saldos de apertura |
| `29553bd` | se conservaron todos los retiros vigentes |
| `8768c2e` | se separaron alertas de tratamientos grupales |
| `6c46729` | se derivo el costo real del alimento |
| `3b03b7f` | se separo poblacion fisica de fichas |
| `a43a77a` | se habilito la correccion de vacunas aplicadas |
| `2e141f5` | se conecto el parto con lactancia |
| `ca585a0` | se amplio la consulta de animales |
| `1ee334c` | se corrigio la planificacion de alimento |
| `b0ff642` | se enlazaron ventas grupales con finanzas |
| `37001d6` | se validaron ubicaciones y capacidad |
