PRESUPUESTA — Versión que funciona abriendo solo index.html
===========================================================

CÓMO ABRIR
1. Descomprime la carpeta.
2. Abre index.html con doble clic (Chrome, Edge o Firefox) o con Live Server.
3. Pulsa "Crear una cuenta", regístrate e inicia sesión.

QUÉ INCLUYE
- Registro e inicio de sesión con varias cuentas en el mismo navegador.
- Contraseñas cifradas con PBKDF2 (SHA-256, sal aleatoria); nunca se guardan en texto plano.
- Los datos (movimientos, categorías, presupuestos) están separados por cuenta.
- Al registrarse, cada cuenta recibe las categorías predeterminadas.
- Validaciones de los formularios, CSV seguro y estilo de "Eliminar presupuesto" corregido.

LÍMITES (importante)
- Todo se guarda en localStorage de ESTE navegador: no hay base de datos compartida.
  Si se borran los datos del navegador, se pierden las cuentas y la información.
  Una cuenta creada en una computadora no existe en otra.
- Es un registro "de prototipo": cualquiera con acceso a la computadora y a DevTools
  puede ver los datos guardados. No sirve para proteger información sensible real.
- No hay recuperación de contraseña.
- Para tener base de datos real, cuentas compartidas entre dispositivos y seguridad
  de servidor, hay que usar un backend (versión "presupuesta.zip" con Node + SQLite)
  o un servicio en la nube como Supabase/Firebase.
