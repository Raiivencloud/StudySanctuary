# Sesiones: alternativa segura y de bajo costo (2-B)

## Qué cambió con 2-C (implementado)

Antes, la sesión de Express (MemoryStore) guardaba los **tokens de Google y Outlook** de cada navegador. Ahora:

- Los tokens se guardan **por uid de Firebase** en `IntegrationTokenStore` (`server/integrations/tokenStore.ts`). Las rutas de Drive y Calendar exigen el ID Token y solo usan los tokens de ese mismo usuario.
- La sesión de Express **solo** guarda el `state` de OAuth durante un máximo de 10 minutos.

Consecuencia: el principal problema de MemoryStore (datos de larga vida que se pierden y no escalan) **pasa al almacén de tokens**. La sesión en sí ya no necesita persistencia.

## Opciones para persistir los tokens

| Opción | Costo | Ventajas | Desventajas |
|---|---|---|---|
| **A. Actual: en memoria por uid** | $0 | Simple, sin servicios nuevos | Se pierde al reiniciar o en el escalado a cero; solo funciona con 1 instancia. El usuario vuelve a conectar Drive o Calendar (igual que antes). |
| **B. Firestore cifrado por uid (recomendada)** | ≈ $0: una escritura al conectar o renovar, y lecturas solo al usar Drive o Calendar, dentro de la cuota gratuita | Persiste entre reinicios y escala a varias instancias. Sin servicios nuevos. | Hay que implementar el cifrado (AES-256-GCM con clave en Secret Manager) y reglas que **denieguen** todo acceso del cliente a la colección |
| C. Cookie cifrada (sin servidor) | $0 | No guarda estado | Los tokens de Outlook superan fácilmente los 4 KB de una cookie; complejo y frágil |
| D. Redis / Memorystore | Desde ~USD 30–50/mes | Rápido | Costo fijo innecesario para este volumen |

**Recomendación: B**, como `FirestoreTokenStore` implementando la misma interfaz:

- Colección `private_integration_tokens/{uid}`, accesible **solo con el Admin SDK**: `allow read, write: if false;` en las reglas.
- Campos cifrados con AES-256-GCM. La clave (`INTEGRATION_TOKENS_KEY`, 32 bytes) va en Secret Manager, que es gratis hasta 6 versiones de secretos activas.
- Vencimiento con `expiresAt` y una política de TTL de Firestore (cada eliminación automática se factura como un borrado normal: centavos por cada 100.000 documentos).
- Se borra en el logout, igual que ahora.

Requiere aprobación porque escribe datos nuevos en Firestore de producción. Conviene hacerlo junto con la Fase 3 (reglas) o la Fase 4.
