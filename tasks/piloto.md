# Piloto de granja

Dispositivo objetivo autorizado: Samsung Galaxy A54. Usar Chrome estable y registrar sus versiones reales al ensayar. La simulación automática usa pantalla412×915 y controles táctiles; no equivale al teléfono físico.

## Datos de ensayo

Usar exclusivamente un entorno aislado con datos ficticios. Propuesta: dos galpones A/B, cuatro perfiles, 12 cabezas iniciales en A, dos ventas, alimento comprado30kg y tres entregas10kg, caja inicial1500PEN. Mantener fechas de corte, códigos textuales, etapas/lotes, moneda y documento de origen explícitos. No cargar este ejemplo en producción.

Para apertura real reunir CSV revisados de: usuarios/perfiles, galpones/equipos, animales identificados, grupos sin identificar, almacenes/lotes de alimento y costo, caja/cuentas pendientes, ciclos reproductivos vigentes y plan sanitario validado por veterinario. Conservar versión original y resultado de validación en seco. Identificados y no identificados deben conciliar con el conteo físico; compras no duplican caja ni consumo.

Los encabezados CSV y sus reglas de revisión están en [plantillas de apertura](plantillas/README.md). No existe importación automática por el solo hecho de disponer de estos archivos.

## Jornada de aceptación

1. Administrador asigna equipos y verifica acceso exclusivo de cada galpón.
2. Operario registra peso, entrega de alimento y traslado; consulta origen/destino.
3. Veterinario registra aplicación y retiro; comprobar bloqueo de venta durante retiro.
4. Responsable consulta existencias, cobros/pagos y reportes completos PDF/XLSX.
5. Administrador retira acceso a B; repetir consultas y exportación de informe guardado.
6. Probar modo avión y pérdida de respuesta. Nunca mostrar guardado sin confirmación; reintento del mismo formulario conserva una sola operación. Tras recarga incierta, consultar listado antes de registrar de nuevo.
7. Instalar desde HTTPS en A54, abrir icono/enlace, cancelar actualización con formulario y verificar contenido; luego actualizar voluntariamente.

Registrar por paso: fecha/hora Lima, versión Worker/commit/esquema, actor, esperado, observado, incidencias y evidencia. El responsable operativo debe confirmar conteo físico y caja. Este archivo es un procedimiento, no acredita un piloto ejecutado.

## Condiciones de salida

T29 debe cerrar el informe de sus 32 casos; CA-20 ya tiene implementación y pruebas automatizadas. Después del piloto sin incidencias de integridad/aislamiento se podrá completar T31 con respaldo, bindings y migraciones revisados. T32 exige observar el primer cierre diario y el cron reales. Objetivos de recuperación y volumen aquí propuestos deben medirse antes de una garantía operativa.
