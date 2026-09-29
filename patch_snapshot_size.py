import pathlib

# Fix: /api/dashboard caia silenciosamente a pmo-data.json (abril) porque la query
# leia TODOS los snapshots completos y Neon corta a 64 MB (HTTP 507).
# Cambios:
#  1) lib/data-store.js: columnas pesadas solo para los N snapshots mas recientes.
#  2) lib/data-store.js: el fallback al archivo ahora se marca (data_source/data_error).
#  3) index.html: banner rojo si los datos vienen del archivo de respaldo.

def patch(path, changes):
    p = pathlib.Path(path)
    src = p.read_text(encoding="utf-8")
    for old, new, label in changes:
        count = src.count(old)
        assert count == 1, f"[{label}] esperado 1 match, encontrados {count}"
        src = src.replace(old, new, 1)
        print(f"OK: {label}")
    p.write_text(src, encoding="utf-8")

HEAVY = ["expiring_60d", "active_clients", "forecast", "account_coverage",
         "non_billable_epic_assignments", "harvest", "assignment_rows",
         "bench_list", "pending_list"]

# --- 1) SELECT con CASE para columnas pesadas -------------------------------
old_select = """      SELECT
        snapshot_date,
        label,
        metrics,
        expiring_60d,
        active_clients,
        forecast,
        forecast_total,
        forecast_source,
        bench_source,
        account_coverage,
        account_coverage_source,
        non_billable_epic_assignments,
        bench_by_month,
        utilization_billing_rate,
        harvest,
        harvest_metrics,
        data_quality,
        data_lineage,
        assignment_rows,
        bench_list,
        pending_list
      FROM ${q('pmo_snapshots')}
      ORDER BY snapshot_date ASC
    `;
"""
def heavy(col):
    return f"        CASE WHEN rn <= ${{FULL_SNAPSHOT_COUNT}} THEN {col} END AS {col}"
new_select = """      SELECT
        snapshot_date,
        label,
        metrics,
""" + ",\n".join(heavy(c) for c in ["expiring_60d", "active_clients", "forecast"]) + """,
        forecast_total,
        forecast_source,
        bench_source,
""" + heavy("account_coverage") + """,
        account_coverage_source,
""" + heavy("non_billable_epic_assignments") + """,
        bench_by_month,
        utilization_billing_rate,
""" + heavy("harvest") + """,
        harvest_metrics,
        data_quality,
        data_lineage,
""" + ",\n".join(heavy(c) for c in ["assignment_rows", "bench_list", "pending_list"]) + """
      FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY snapshot_date DESC) AS rn
        FROM ${q('pmo_snapshots')}
      ) s
      ORDER BY snapshot_date ASC
    `;
"""

patch("lib/data-store.js", [
    ("async function getDashboardData() {\n",
     """// Neon's HTTP driver rejects responses above 64 MB (HTTP 507). Row-level arrays
// (assignment_rows, harvest, etc.) are only loaded for the N most recent snapshots;
// older snapshots keep metrics/trends only. Override with PMO_FULL_SNAPSHOTS.
const FULL_SNAPSHOT_COUNT = Math.max(2, Number(process.env.PMO_FULL_SNAPSHOTS) || 14);

async function getDashboardData() {
""", "constante FULL_SNAPSHOT_COUNT"),
    (old_select, new_select, "SELECT liviano para snapshots viejos"),
    ("""    console.warn('Falling back to pmo-data.json:', error.message);
    return getFileDashboardData();""",
     """    console.warn('Falling back to pmo-data.json:', error.message);
    // Never let stale file data pass as live: flag it so the UI can warn.
    return { ...getFileDashboardData(), data_source: 'file-fallback', data_error: String(error.message || error).slice(0, 300) };""",
     "fallback marcado"),
])

# --- 3) banner en el front ---------------------------------------------------
patch("index.html", [
    ("""function initDashboard(){
""",
     """function initDashboard(){
  // Warn loudly when the API served the static pmo-data.json backup instead of the database.
  if(PMO && PMO.data_source === 'file-fallback' && !document.getElementById('dataFallbackBanner')){
    const bar = document.createElement('div');
    bar.id = 'dataFallbackBanner';
    bar.style.cssText = 'background:#b42318;color:#fff;padding:.6rem 1rem;font-size:.85rem;text-align:center;position:sticky;top:0;z-index:9999';
    bar.textContent = 'Datos de respaldo (pmo-data.json): no se pudo leer la base de datos. La informacion mostrada puede estar desactualizada. ' + (PMO.data_error || '');
    document.body.prepend(bar);
  }
""", "banner de fallback"),
])
