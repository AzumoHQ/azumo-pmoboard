// One-time seed: loads the Billing Process (today hardcoded in index.html as
// BILLING_PROCESS_STEPS / PROCESS_HEALTH_META) into the new processes tables, so the
// board can be switched over to read it from the database instead of the JS constant.
// Run once against a DATABASE_URL that has it (see .env.example): 
//   node --env-file=.env.local scripts/seed-billing-process.js
const { upsertProcess, replaceProcessSteps } = require('../lib/data-store');

const BILLING_PROCESS_STEPS = [
  { id: 1, role: 'assignee', title: 'Time registration', desc: 'Friday morning. Each team member logs their weekly hours in the time tracking system.', day: 'Fri' },
  { id: 2, role: 'pm', title: 'Initial review by PM', desc: 'Friday afternoon. The PM checks entries for their contracts for completeness and correctness.', day: 'Fri' },
  { id: 3, role: 'pm', title: 'Time entry adjustment (if needed)', desc: 'If there are discrepancies, the PM requests corrections and the team re-submits — the claim cycle.', returns_to: 1 },
  { id: 4, role: 'csm', title: 'CSM weekly review', desc: 'Monday morning. The CSM reviews the weekly contract time records for consistency with client expectations.', day: 'Mon' },
  { id: 5, role: 'csm', title: 'CSM feedback loop (if needed)', desc: 'Additional issues trigger the claim process again for clarification.', returns_to: 1 },
  { id: 6, role: 'pmo', title: 'Final time register review (PMO / Chief of Staff)', desc: 'Tuesday morning. Final check of all approved timesheets.', day: 'Tue' },
  { id: 7, role: 'pmo', title: 'Invoice issuance', desc: 'Once every validation is complete, the invoice is generated and sent to the client.' }
];

async function main() {
  const process = await upsertProcess({
    id: 'billing',
    name: 'Billing Process',
    category: 'billing',
    owner_role: 'pmo',
    corresponsable_role: 'pmo',
    objective: 'Ensure weekly timesheets are recorded, reviewed and invoiced accurately.',
    scope: 'From weekly time registration through final PMO review and invoice issuance.',
    last_reviewed: '2026-07-06',
    review_cadence_months: 6,
    version: '1.00'
  });
  await replaceProcessSteps('billing', BILLING_PROCESS_STEPS);
  console.log('Seeded Billing Process:', process.id, '-', process.steps.length, 'steps');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
