# Cómo desplegar las reglas en la base de Firestore correcta

> **Estado:** documentación. No se desplegó nada ni se modificó `firebase.json`. Se recomienda aplicar esta guía **después** de la Fase 3 (reglas corregidas) y de decidir qué base usa el servidor (ver `FIRESTORE_DATABASES.md`).
>
> Comportamiento verificado en el código de `firebase-tools` 15.34.0 (`lib/firestore/fsConfig.js` y `lib/deploy/firestore/prepare.js`).

## Situación actual

```json
"firestore": { "rules": "firestore.rules" }
```

Esta configuración, sin `database`, publica las reglas **solo en `(default)`**. La base con nombre que usa la app **no recibe** `firestore.rules`.

## ⚠️ Advertencias antes de desplegar

1. **`firebase deploy` puede CREAR una base de datos.** Si la base de la **primera** entrada de `firestore` no existe, firebase-tools la crea en la región `nam5`. Eso genera un recurso nuevo con posibles costos y en una región que quizás no sea la deseada.
   - Con la configuración actual: si el proyecto **no** tiene `(default)`, desplegar reglas **crearía** `(default)`.
   - **`--dry-run` no evita esto:** la fase de preparación (donde ocurre la creación) también se ejecuta en modo simulación.
   - Antes de cualquier deploy, confirmá las bases existentes con `gcloud firestore databases list --project TU_PROYECTO`.
2. **Usá siempre `--only`.** `firebase deploy` sin `--only` también publica *Hosting* con la carpeta `dist`, que no es como corre la app (Cloud Run).
3. **Las reglas se reemplazan completas**, no se combinan. Guardá una copia de las reglas vigentes: consola de Firebase > Firestore > *Reglas* > historial, con cada base seleccionada.

## Configuración recomendada (para la Fase 3)

Ejemplo de `firebase.json` con la **base con nombre en primer lugar**, para que nunca se intente crear `(default)`:

```json
"firestore": [
  { "database": "ID_DE_LA_BASE_CON_NOMBRE", "rules": "firestore.rules" }
]
```

Si `(default)` existe y también debe protegerse (por ejemplo, porque tiene las suscripciones que escribió el webhook):

```json
"firestore": [
  { "database": "ID_DE_LA_BASE_CON_NOMBRE", "rules": "firestore.rules" },
  { "database": "(default)", "rules": "firestore.rules" }
]
```

## Comandos

```bash
# 1. Probar las reglas localmente con el emulador (sin costo ni conexión a producción)
npm run test:rules

# 2. Confirmar qué bases existen (solo lectura)
gcloud firestore databases list --project TU_PROYECTO

# 3. Desplegar SOLO las reglas de UNA base (sintaxis de destino: firestore:<databaseId>)
npx firebase deploy --only firestore:ID_DE_LA_BASE_CON_NOMBRE --project TU_PROYECTO

# 3b. O las reglas de todas las bases listadas en firebase.json
npx firebase deploy --only firestore:rules --project TU_PROYECTO
```

**Storage:** `npx firebase deploy --only storage --project TU_PROYECTO`. Storage no depende de la base de Firestore.

## Verificación después del deploy

1. En la consola de Firebase, en *Firestore > Reglas*, seleccionar cada base y confirmar la fecha y el contenido publicados.
2. Probar desde la app con una cuenta de prueba: iniciar sesión, crear un curso, subir un archivo y abrir el asistente.
3. Si algo falla, volver a la versión anterior desde el historial de reglas de la consola (se publica al instante).

## Índices

Hoy el repositorio no tiene `firestore.indexes.json`. Si se agrega, se declara por base con `"indexes"` en la misma entrada. Hay que exportar los índices actuales antes (`npx firebase firestore:indexes --database ID --project TU_PROYECTO`) para no borrarlos al desplegar.
