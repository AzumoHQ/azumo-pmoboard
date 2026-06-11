# PMO Board

Dashboard PMO de Azumo. El frontend principal sigue siendo `index.html`; se agrego una capa de API para Vercel y Neon sin reemplazar el dashboard desarrollado.

## Estructura

- `index.html`: dashboard principal, con fallback a datos embebidos.
- `pmo-data.json`: snapshot local inicial y respaldo.
- `api/dashboard.js`: devuelve datos desde Neon, o desde `pmo-data.json` si no hay `DATABASE_URL`.
- `api/snapshots.js`: lista snapshots y permite guardar uno nuevo.
- `api/refresh.js`: prepara refresh desde Jira/EazyBI y guarda el snapshot en Neon.
- `api/auth/*`: login, logout, usuario actual y cambio de password con cookie segura.
- `api/users.js`: administración básica de usuarios PMO/admin.
- `api/notes.js`: notas privadas en Neon si se configura `PMO_NOTES_PASSWORD`.
- `lib/`: clientes de Jira/EazyBI, transformacion PMO y acceso a datos.
- `scripts/import-pmo-data.js`: importa `pmo-data.json` a Neon.

## Deploy en Vercel

1. Conectar este repo de GitHub en Vercel.
2. Configurar variables de entorno en Vercel:

```text
DATABASE_URL
PMO_REFRESH_TOKEN
PMO_SESSION_DAYS
CRON_SECRET
PMO_NOTES_PASSWORD
JIRA_BASE_URL
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_JQL
JIRA_EPIC_POSITION_FIELD
EAZYBI_URL
EAZYBI_EMAIL
EAZYBI_TOKEN
EAZYBI_REPORT_ID
EAZYBI_BENCH_BY_MONTH_REPORT_ID
EAZYBI_UTILIZATION_BILLING_REPORT_ID
PMO_QA_EMAIL_TO
PMO_QA_EMAIL_FROM
RESEND_API_KEY o SENDGRID_API_KEY
SLACK_BOT_TOKEN + SLACK_ASSIGNMENTS_CHANNEL_ID
SLACK_ASSIGNMENTS_WEBHOOK_URL
SLACK_USER_MAP_JSON
PMO_PUBLIC_DUE_CARD_TOKEN
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


## Snapshots manuales y automatizados

### Snapshot manual

Desde la UI, usar el boton **Snapshot now**. El dashboard pedira iniciar sesion con un usuario PMO/admin y llamara a:

```bash
curl -X POST https://pmoboard.vercel.app/api/refresh \
  -H "Content-Type: application/json" \
  -b "pmo_session=<cookie>" \
  -d '{}'
```

Esto consulta Jira/EazyBI desde Vercel, guarda el snapshot en Neon y luego el dashboard vuelve a leer `/api/dashboard`.

`PMO_REFRESH_TOKEN` queda solo como fallback tecnico para scripts/cron. Para uso humano, entrar con email/password en la UI y cambiar password desde el menu superior.

### Usuarios

Los usuarios viven en Neon:

- `pmo_users`: email, nombre, rol, hash de password y estado.
- `pmo_sessions`: sesiones con cookie httpOnly.

Roles:

- `admin`: administra usuarios y puede sacar snapshots.
- `pmo`: puede sacar snapshots manuales.
- `viewer` / otros roles futuros: lectura solamente.

Crear o resetear un usuario PMO desde terminal:

```bash
DATABASE_URL="postgresql://..." \
PMO_USER_EMAIL="federica.gonzalez@azumo.co" \
PMO_USER_NAME="Federica Gonzalez" \
PMO_USER_ROLE="pmo" \
PMO_USER_PASSWORD="temporary-password" \
node scripts/create-pmo-user.js
```

Luego iniciar sesion en la UI y usar **Password** para cambiar la clave.

### QA diario + snapshot automatico en Vercel

`vercel.json` registra un Cron Job diario:

```json
{ "path": "/api/cron-snapshot", "schedule": "0 12 * * *" }
```

Vercel ejecuta esa ruta con un HTTP `GET` todos los dias a las 12:00 UTC, que equivale a 9:00 AM Argentina. La ruta refresca Jira/EazyBI, guarda snapshot en Neon, arma el checklist diario de QA, envia email si hay proveedor configurado y publica Slack solo si hay assignments que vencen ese dia.

Para protegerla, configurar `CRON_SECRET`; Vercel lo envia automaticamente como `Authorization: Bearer <CRON_SECRET>`.

Endpoints relacionados:

- `GET /api/cron-snapshot?refresh=false`: reenvia email/Slack usando el snapshot actual, protegido por `CRON_SECRET` o `PMO_REFRESH_TOKEN`.
- `GET /api/cron-snapshot?card=due-today&date=YYYY-MM-DD`: genera la tarjeta SVG que Slack muestra como captura de assignments que vencen hoy.

Despues de cambiar `vercel.json` o variables de entorno, redeployar production para registrar el cron.

## Refresh

`POST /api/refresh` consulta Jira, opcionalmente lee EazyBI, transforma los datos al formato del dashboard y guarda un snapshot.

Las métricas **Headcount Billable** y **Headcount Non-Billable** salen exclusivamente del reporte agregado de EazyBI. Jira se usa para detalle operativo, filtros y filas de assignments, pero no para calcular esos dos KPI cards.

Para regenerar el snapshot local con los CSV de EazyBI usados por el dashboard:

```bash
python3 pmo-refresh.py \
  --file /Users/federicagonzalez/Documents/Claude/outputs/jira-raw.json \
  --next-due-dates-csv "/Users/federicagonzalez/Downloads/Next Due Dates.csv" \
  --bench-report-csv "/Users/federicagonzalez/Downloads/Bench.csv" \
  --bench-by-month-csv "/Users/federicagonzalez/Downloads/Bench by Month (1).csv" \
  --utilization-billing-rate-csv "/Users/federicagonzalez/Downloads/Utilization Billing Rate (1).csv" \
  --reset-history
```

El reporte de Bench se filtra a `Active` y `New Hires`; `Inactive` queda excluido. En Vercel, los snapshots automaticos preservan ese filtro desde el ultimo snapshot guardado en Neon.
Los modulos **Bench by Month** y **Utilization Billing Rate** se cargan desde los CSV de EazyBI cuando se pasan por CLI. En Vercel tambien pueden cargarse automaticamente si se configuran los IDs `EAZYBI_BENCH_BY_MONTH_REPORT_ID` y `EAZYBI_UTILIZATION_BILLING_REPORT_ID`.

El modulo **Data QA & Traceability** guarda `data_quality` y `data_lineage` en cada snapshot. Las alertas se calculan desde Jira/EazyBI ya ingeridos, sin pedir reportes QA externos. Utilization Billing Rate se modela como tabla mensual con procedimiento visible: `billed / utilized billable capacity ÷ total headcount`, manteniendo EazyBI como fuente autoritativa.

Reglas operativas aplicadas en el modelo:
- `Bench` y `Azumo` se normalizan como capacidad interna: availability `100%`, billing `0%`, assignment `100%`.
- La position del recurso/assignee se toma únicamente del parent Epic (`Epic → Position - Assignee`). El child issue queda como dato auxiliar/auditoría, pero no alimenta la posición visible ni los rollups. Si Jira no descubre ese campo automaticamente, configurar `JIRA_EPIC_POSITION_FIELD`.
- El due date de Bench es un placeholder requerido por Jira: no alimenta Forecast, Due Assignments, next due, ni alertas de consistencia de fechas.
- Data QA alerta si el due date del Epic es anterior al due date más lejano de sus child Assignments `In Progress`.
- Data QA deja un solo chequeo de Position: `Position QA — missing Epic Position - Assignee`.
- Data QA lista assignments externos con `Billing 0`, excluyendo Bench y Azumo.

Las filas cuyo parent Epic tenga `Billing Type = Non-Billable` quedan excluidas del modelo antes de construir metric cards, active clients, bench, due dates y forecast.

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
