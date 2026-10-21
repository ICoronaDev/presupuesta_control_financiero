PRESUPUESTA — Prototipo frontend ampliado
==========================================

CÓMO ABRIR
1. Descomprime presupuesta_completo.zip.
2. En Visual Studio Code: Archivo > Abrir carpeta > presupuesta_completo.
3. Abre index.html. Puedes abrirlo directamente en Chrome/Edge o usar la extensión Live Server.
4. En la pantalla de acceso usa:
   Correo: demo@presupuesta.mx
   Contraseña: Presupuesta123!
   También puedes pulsar “Usar estos datos”.

FUNCIONES DEL PROTOTIPO
- Inicio y cierre de sesión de demostración.
- Crear categorías personalizadas para ingresos, gastos o ambos.
- Registrar, editar, buscar, filtrar y borrar transacciones.
- Resumen de ingresos, gastos y balance por período.
- Totales y gráficos de gastos por categoría.
- Crear, actualizar y eliminar límites de presupuesto.
- Barras de presupuesto: aviso amarillo al 80% y rojo al 100% o más.
- Informe por rango de fechas y desglose por categoría.
- Exportación de movimientos e informes a CSV.
- Vista de impresión del informe: elige “Guardar como PDF” en el diálogo de impresión.
- Diseño adaptable a computadora y celular.

LÍMITES IMPORTANTES
Esto es un prototipo académico de FRONTEND, no una aplicación lista para producción.
- El inicio de sesión está simulado y usa credenciales de demostración fijadas en app.js.
- No es un sistema seguro de autenticación: no protege datos privados ni debe usarse con contraseñas reales.
- Los datos de transacciones, categorías y presupuestos se guardan en localStorage de este navegador.
- No hay base de datos compartida, API ni cuentas individuales seguras.
- Para entregar un sistema con seguridad real, el equipo de Backend debe implementar autenticación del lado del servidor, contraseñas con hash (por ejemplo Argon2/bcrypt), sesiones seguras o tokens con controles apropiados, validación de permisos y base de datos.
- El PDF se genera a través de la función de imprimir del navegador; no crea un PDF en servidor.
- Las alertas se muestran dentro de la interfaz, no se envían como notificaciones al teléfono/correo.

NOTA PARA EL EQUIPO
Antes de integrar con Backend/Fullstack, acuerden:
- Campos de una transacción: id, description, amount, date, type, category.
- Campos de categorías: name, type.
- Campos de presupuesto: category, monthlyLimit.
- Endpoints de API y formato de errores.
- Cómo se identifica al usuario y qué datos puede consultar.
