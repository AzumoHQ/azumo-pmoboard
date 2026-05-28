# PMO Board

Dashboard PMO de Azumo. El frontend principal sigue siendo `index.html`; se agrego una capa de API para Vercel y Neon sin reemplazar el dashboard desarrollado.

## Estructura

- `index.html`: dashboard principal, con fallback a datos embebidos.
- `pmo-data.json`: snapshot local inicial y respaldo.
- `api/dashboard.js`: devuelve datos desde Neon, o desde `pmo-data.json` si no hay `DATABASE_URL`.
- `api/snapshots.js`: lista snapshots y permite guardar uno nuevo.
- `api/refresh.js`: prepara refresh desde Jira/EazyBI y guarda el snapshot en Neon.
- `api/notes.js`: notas privadas en Neon si se configura `PMO_NOTES_PASSWORD`.
- `lib/`: clientes de Jira/EazyBI, transformacion PMO y acceso a datos.
- `scripts/import-pmo-data.js`: importa `pmo-data.json` a Neon.

## Deploy en Vercel

1. Conectar este repo de GitHub en Vercel.
2. Configurar variables de entorno en Vercel:

```text
DATABASE_URL
PMO_REFRESH_TOKEN
PMO_NOTES_PASSWORD
JIRA_BASE_URL
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_JQL
EAZYBI_URL
EAZYBI_EMAIL
EAZYBI_TOKEN
EAZYBI_REPORT_ID
```

3. Cada push a `main` dispara un deploy si el proyecto esta conectado por Git.

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Correr el dashboard con API local:

```bash
npm run dev
```

Abrir:

```text
http://127.0.0.1:4173
```

El servidor local sirve `index.html` y las rutas `/api/*`. Si no hay Neon configurado o falla la conexion, `/api/dashboard` usa `pmo-data.json` como fallback.

Por seguridad, el servidor local ignora cualquier `DATABASE_URL` heredado del entorno. Para probar contra Neon localmente:

```bash
PMO_LOCAL_USE_DATABASE=1 DATABASE_URL="postgresql://..." npm run dev
```

## Neon

La API crea las tablas automaticamente en el primer request. Si queres crearlas manualmente, ejecuta el SQL de `docs/neon-schema.sql` en Neon.

Para importar los datos actuales:

```bash
DATABASE_URL="postgresql://..." npm run check
DATABASE_URL="postgresql://..." npm run import:data
```

Despues de eso, `index.html` va a leer `/api/dashboard` y usar Neon. Si la API no esta disponible, conserva el fallback embebido.

## Refresh

`POST /api/refresh` consulta Jira, opcionalmente lee EazyBI, transforma los datos al formato del dashboard y guarda un snapshot.

Si `PMO_REFRESH_TOKEN` esta configurado, enviar:

```text
Authorization: Bearer <PMO_REFRESH_TOKEN>
```

Tambien se pueden mandar overrides:

```json
{
  "overrides": {
    "utilization_assignment": 93.5,
    "utilization_billing": 88,
    "unassigned_capacity": 5.2,
    "bench": 8
  }
}
```
