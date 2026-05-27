const fs = require('node:fs');
const path = require('node:path');
const { importDashboardData } = require('../lib/data-store');

async function main() {
  const dataFile = process.argv[2] || path.join(__dirname, '..', 'pmo-data.json');
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const imported = await importDashboardData(data);

  console.log(`Imported ${imported.snapshots.length} snapshots into Neon`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
