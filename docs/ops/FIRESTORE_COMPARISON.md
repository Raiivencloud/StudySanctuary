# Cómo comparar las bases de Firestore (solo lectura)

Esta guía sirve para saber **qué datos hay en cada base** (`(default)` y la base con nombre) sin modificar nada y sin mostrar información de los usuarios. El contexto está en [`../FIRESTORE_DATABASES.md`](../FIRESTORE_DATABASES.md).

## Qué hace y qué no hace el script

- ✅ Cuenta documentos por colección en las dos bases (consultas `count()`).
- ✅ Cuenta cuántos usuarios tienen una suscripción activa y cuántos fueron escritos por el webhook de pagos.
- ✅ Comprueba si existe `stats/global`.
- ❌ **No escribe, no borra y no modifica nada.** Las pruebas automáticas lo ejecutan contra el emulador, comparan una copia completa de las dos bases antes y después, y verifican que no contenga operaciones de escritura (`tests/rules/opsScripts.test.ts`).
- ❌ No muestra contenido de documentos, emails ni IDs de usuarios: solo números.
- 💲 **Costo:** 1 lectura cada 1.000 documentos contados, más 1 lectura por comprobación. Con miles de usuarios son unas pocas lecturas, dentro de la cuota gratuita de Firestore (50.000 lecturas por día).

## Requisitos (una sola vez)

1. **Node.js 20 o superior** y el proyecto instalado (`npm ci` en la carpeta del repositorio).
2. **Google Cloud CLI (`gcloud`):** https://cloud.google.com/sdk/docs/install
3. **Una cuenta con acceso de solo lectura** al proyecto. Recomendado: el rol **`Cloud Datastore Viewer`** (`roles/datastore.viewer`). Con ese rol es **imposible** escribir aunque el script lo intentara, así que la garantía no depende solo del código.

## Pasos

```bash
# 1. Iniciar sesión (se abre el navegador). No se crean archivos de claves.
gcloud auth application-default login

# 2. Ver el ID del proyecto y de las bases (también es de solo lectura)
gcloud firestore databases list --project TU_PROYECTO

# 3. Ejecutar la comparación
npx tsx scripts/ops/compare-firestore-databases.ts --project TU_PROYECTO --named-db ID_DE_LA_BASE_CON_NOMBRE

# 4. (Opcional) Cerrar la sesión de credenciales locales al terminar
gcloud auth application-default revoke
```

Reemplazá `TU_PROYECTO` y `ID_DE_LA_BASE_CON_NOMBRE` por los valores que muestra el paso 2. Son identificadores, no credenciales. **No hace falta, y no se debe, pegar ninguna clave en la terminal.**

## Cómo leer el resultado

La primera línea indica el destino: `Proyecto: ... (PRODUCCIÓN / proyecto real)`. A continuación aparece una tabla como esta:

| Fila | `(default)` | base con nombre |
|---|---|---|
| `users` | 4 | 1250 |
| `users con subscription.status == active` | 4 | 0 |
| `users con subscription.lastPaymentId (escritos por el webhook)` | 4 | 0 |
| `stats/global existe` | 1 | 1 |

En este ejemplo, los pagos se escribieron en `(default)` y la app (base con nombre) no los ve: se confirma el problema descrito en `FIRESTORE_DATABASES.md`.

Si una celda dice `error: 5 NOT_FOUND`, esa base no existe. Si dice `error: 7 PERMISSION_DENIED`, a la cuenta le falta el rol `Cloud Datastore Viewer`.

**Para compartir el resultado:** la tabla solo tiene números. Se puede copiar tal cual.
