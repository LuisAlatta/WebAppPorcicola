# Prueba del ciclo en producción

La prueba se realizó en la web de producción con datos ficticios autorizados y
prefijo «PRUEBA». Los registros permanecen en el historial auditado y sus importes
no representan compras, ventas ni cobros reales.

- Se registró la cerda `PRUEBA-CICLO-20261109-MADRE`, un servicio y un parto el
  01/09/2026 con cuatro machos y cuatro hembras vivos. La madre pasó a lactancia;
  la ficha mostró un servicio, un parto y 1,40 kg de peso promedio.
- Se destetaron por separado cuatro hembras y cuatro machos el 22/09/2026.
  Inventario mostró ocho cabezas en Inicio y una madre en lactancia.
- Alimentación mostró ocho cabezas en Inicio y demanda de 8 kg/día. Una compra
  ficticia de 20 kg de Inicio por S/ 40 dejó 20 kg disponibles; una entrega de
  5 kg dejó 15 kg y valorizó el consumo en S/ 10.
- Se vendió una cabeza grupal de Inicio por S/ 100 a `PRUEBA comprador` y se
  registró un cobro ficticio con referencia `PRUEBA COBRO FICTICIO`. Inventario
  quedó en 20 cabezas y el flujo de caja mostró S/ 100 cobrados.
- Se registró `PRUEBA producto ficticio` para la madre con retiro hasta el
  20/11/2026. El historial mostró la actuación y la aplicación rechazó una
  venta sintética de la madre durante el retiro.
- El panel de Reportes mostró 20 cabezas, cuatro identificadas, 16 sin
  identificar y S/ 100 de ventas para el periodo consultado.

Durante el recorrido, la compra de alimento falló porque la pantalla enviaba un
destino reservado para entregas. Se corrigió en `9e4628a`, con prueba de
navegador reproducida en rojo y verde, TypeScript, ESLint y build correctos.
La versión publicada `3253176c-eabb-49fd-bb96-01d528ff4034` permitió repetir la
compra y la entrega con los saldos descritos.

La comprobación ejercitó estos flujos con datos sintéticos; no representa una
temporada real de crianza ni una validación de todos los escenarios posibles.
