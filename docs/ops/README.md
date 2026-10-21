# Herramientas de operación (`scripts/ops/`)

Las ejecuta el propietario con sus propias credenciales. Todas siguen las mismas reglas de seguridad:

- El proyecto se indica siempre con `--project`: no hay valores por defecto implícitos.
- Las credenciales salen de `gcloud auth application-default login`. No se usan archivos de claves ni se pegan secretos, y ningún script imprime secretos.
- Lo que puede modificar algo funciona como **simulación** salvo que se pase `--apply`.
- Cada script indica al empezar si el destino es el **EMULADOR** o **PRODUCCIÓN**.
- Las pruebas automáticas (`npm run test:rules`) los ejecutan contra el emulador local.

| Script | Para qué | ¿Modifica algo? |
|---|---|---|
| `compare-firestore-databases.ts` | Contar documentos en `(default)` y en la base con nombre ([guía](./FIRESTORE_COMPARISON.md)) | **Nunca** (solo lectura) |
| `admin-claims.ts list` | Listar las cuentas con el claim `admin` | No |
| `admin-claims.ts grant/revoke --email X` | Dar o quitar el claim `admin` (lo verifica el servidor) | Solo con `--apply` |
| `storage-buckets.ts check` | Ver si existen los buckets, su ubicación y su CORS actual | No |
| `storage-buckets.ts cors --bucket B --origin https://...` | Proponer y aplicar un CORS **restringido** a orígenes exactos (nunca `*`) | Solo con `--apply` |

## Asignar el claim `admin` (2-A)

```bash
gcloud auth application-default login
npx tsx scripts/ops/admin-claims.ts --project TU_PROYECTO grant --email tu@email.com          # simulación
npx tsx scripts/ops/admin-claims.ts --project TU_PROYECTO grant --email tu@email.com --apply  # aplica
```

- Solo se otorga a cuentas con el **email verificado**.
- Se conservan los demás claims de la cuenta.
- Para que tenga efecto, hay que cerrar sesión y volver a entrar en la app.
- Mientras tanto, el servidor sigue aceptando los emails listados en `ADMIN_EMAILS`.
- `revoke --apply` también revoca los refresh tokens de la cuenta, para que el cambio se aplique en la siguiente renovación.

## Scripts eliminados (2-G)

| Script anterior | Motivo | Reemplazo |
|---|---|---|
| `dump-env.ts` | Imprimía **todas** las variables de entorno, incluidos los secretos | `npm run verify:config` (no muestra valores) |
| `check-env.ts` | Imprimía valores de variables | `npm run verify:config` |
| `check-storage.ts` | Imprimía la configuración completa y **escribía** un archivo de prueba en el bucket de producción | `storage-buckets.ts check` |
| `find-bucket.ts` | Reescribía el archivo de configuración | `storage-buckets.ts check` |
| `fix-cors-script.ts` | Ponía el CORS del bucket de producción en `*` | `storage-buckets.ts cors` (restringido y con simulación) |
| `check-bucket.ts`, `check-buckets.ts`, `test-buckets.ts` | Dependían del `firebase-applet-config.json` eliminado | `storage-buckets.ts check` |
