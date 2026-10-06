// Carga inicial de SOWs por cliente (Tracking · Cycle · Project desde el Project Code).
// Uso: abrir el PREVIEW del board logueada como PMO, pegar esto en la consola (DevTools > Console).
// 1) Corre primero con DRY_RUN = true: muestra el cruce Excel -> cliente de Jira PSA y los que no matchean.
// 2) Si el cruce esta bien (o completaste ALIASES), cambiar a DRY_RUN = false y volver a pegarlo.
// OJO: reemplaza la lista de SOWs de cada cliente que matchea.
(async () => {
  const DRY_RUN = true;

  // Si un cliente del Excel no matchea, mapearlo a mano: 'Nombre en Excel': 'Nombre en Jira PSA'
  const ALIASES = {
  };

  // [Client (Excel), SOW / Project, Project Code]
  const DATA = [
    ['Alkalight', '[SOW 1] Software Development Services - Dedicated - 211', '211'],
    ['Angle Health', '[SOW 2] Software Development Services - Dedicated - 211', '211'],
    ['BrierStone', '[SOW 3] Software Development Services - Dedicated - 221', '221'],
    ['BrierStone', '[SOW 3] Software Development Services - On-Demand - 121', '121'],
    ['Built to Sell - ValueBuilder', '[ValueBuilder] [SOW 1] Software Development Services - Value Builder - On-Demand - 121', '121'],
    ['Built to Sell - ValueBuilder', '[ValueBuilder] [SOW 1B] Software Development Services - Value Builder - Dedicated - 211', '211'],
    ['Built to Sell - ValueBuilder', '[SOW 1] Software Development Services - Value Builder - Dedicated - 221', '221'],
    ['Carwire.ai', '[SOW 1] Software Development Services - Dedicated - 211', '211'],
    ['Carwire.ai', '[SOW 1] Software Development Services - On-Demand - 111', '111'],
    ['Centegix', '[SOW 4] Software Development Services - Dedicated - 211', '211'],
    ['Centegix', '[SOW 4] Software Development Services - On-Demand - 111', '111'],
    ['Centegix', '[SOW 5] Software Development Services - Dedicated - 211', '211'],
    ['CompuClaim', '[SOW 8] Software Development Services - Dedicated - 221', '221'],
    ['DAC Inc', '[SOW 1] Software Development Services - Delivery - 132', '132'],
    ['Elevate DDS', '[SOW 1] Software Development Services - Delivery - 132', '132'],
    ['Fairwater', '[SOW 4] Software Development Services - On-Demand - 121', '121'],
    ['Hearing Asset Advisors', '[SOW 2] Software Development Services - Delivery - 132', '132'],
    ['Jostens', '[First Amendment to MSA] Software Development Services - Dedicated - 221', '221'],
    ['Jostens', '[SOW 11] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 12] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 13] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 20] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 21] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 21a] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 21b] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 21c] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 23] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 24] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 24b] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 25] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 25b] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 25c] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 26] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 26b] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 26c] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 27] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 27b] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 28] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 28b] Software Development Services - Dedicated', '221'],
    ['Jostens', '[SOW 29] Software Development Services - Dedicated', '221'],
    ['Jostens Scholastic', '[SOW 15] Software Development Services - Dedicated', '221'],
    ['Jostens Scholastic', '[SOW 30] Software Development Services - Dedicated', '221'],
    ['LoanEdge', '[SOW 1] Software Development Services - Delivery', '132'],
    ['NGL Water Solutions Permian', '[SOW 7] Software Development Services - Dedicated', '221'],
    ['NGL Water Solutions Permian', '[SOW 7] Software Development Services - On-Demand', '121'],
    ['Noise Management', '[SOW 1] Software Development Services - Delivery', '132'],
    ['nVenue', '[SOW 1] Software Development Services - Dedicated', '211'],
    ['Phaidon', '[SOW 1] Software Development Services - Dedicated', '221'],
    ['Phaidon', '[SOW 2] Software Development Services - Dedicated', '221'],
    ['Riley ABA', '[SOW 3] Software Development Services - On-Demand', '121'],
    ['Screenwave Media', '[SOW 1] Software Development Services - Dedicated', '211'],
    ['Screenwave Media', '[SOW 2] Software Development Services - Dedicated', '211'],
    ['Solea', '[SOW 1] Software Development Services - Dedicated', '221'],
    ['Spinwheel Solutions', '[SOW 6] Software Development Services - Dedicated', '211'],
    ['Stovell Research', 'Software Development Services - Dedicated (b)', '211'],
    ['Syntrove', '[SOW 3] Software Development Services - Dedicated', '211'],
    ['Syntrove', '[SOW 3] Software Development Services - On-Demand', '111'],
    ['The Aldridge Group', '[SOW 1] Software Development Services - Delivery', '132'],
    ['The Aldridge Group', '[SOW 2] Software Development Services - On-Demand', '132'],
    ['TownPlanner', '[SOW 2] Software Development Services - Delivery', '112'],
    ['Veteran Recovery Coalition', '[SOW 2] Software Development Services - Dedicated', '232'],
    ['Veteran Recovery Coalition', '[SOW 2] Software Development Services - On-Demand', '132'],
    ['Window World', '[SOW 1] Software Development Services - Dedicated', '221'],
    ['Worklution Inc', '[SOW 2] Software Development Services - On-Demand', '211'],
    ['Wrenchwise', '[SOW 2] Software Development Services - On-Demand', '211'],
    ['Zynga Inc', '[95234-O3] Software Development Services Windfall - Dedicated', '221'],
    ['Zynga Inc', '[95493-O3] Software Development Services WDP - Dedicated', '221'],
    ['Zynga Inc', '[96514-O3] Software Development Services WWF - Dedicated', '221'],
  ];

  if(typeof clientTermsKey !== 'function' || typeof latest === 'undefined' || !latest){
    console.error('Abrí el board (preview) con el patch client_terms_per_sow aplicado y los datos cargados.');
    return;
  }
  const psa = (latest.account_coverage || [])
    .map(c => ({client: c.client, key: clientTermsKey(c.client)}))
    .filter(p => p.key);
  function matchPsa(name){
    const target = ALIASES[name] || name;
    const k = clientTermsKey(target);
    const exact = psa.find(p => p.key === k);
    if(exact) return {psa: exact, how: ALIASES[name] ? 'alias' : 'exact'};
    // Fallback: un nombre contiene al otro como prefijo ("zyngainc" ~ "zynga"); gana el mas largo.
    const partial = psa
      .filter(p => p.key.startsWith(k) || k.startsWith(p.key))
      .sort((a, b) => b.key.length - a.key.length)[0];
    return partial ? {psa: partial, how: 'prefix (revisar)'} : null;
  }

  const byClient = new Map();
  DATA.forEach(([client, project, code]) => {
    if(!byClient.has(client)) byClient.set(client, []);
    byClient.get(client).push({project: project.trim(), ...clientProjectFromCode(code)});
  });

  const plan = [];
  const unmatched = [];
  byClient.forEach((projects, excelName) => {
    const m = matchPsa(excelName);
    if(!m){ unmatched.push(excelName); return; }
    plan.push({excel: excelName, jira_psa: m.psa.client, match: m.how, sows: projects.length, key: m.psa.key, projects});
  });
  // Dos clientes del Excel que caen en el mismo cliente PSA se pisarian: avisar.
  const keyCount = plan.reduce((acc, p) => (acc[p.key] = (acc[p.key] || 0) + 1, acc), {});
  const collisions = plan.filter(p => keyCount[p.key] > 1).map(p => p.excel);

  console.table(plan.map(({excel, jira_psa, match, sows}) => ({excel, jira_psa, match, sows})));
  if(unmatched.length) console.warn('Sin match en Jira PSA (completar ALIASES o se saltean):', unmatched);
  if(collisions.length) console.warn('Varios clientes del Excel caen en el mismo cliente PSA (revisar ALIASES):', collisions);
  if(DRY_RUN){ console.log('DRY RUN: no se guardó nada. Cambiá DRY_RUN = false para cargar.'); return; }
  if(collisions.length){ console.error('Corregí las colisiones antes de cargar.'); return; }

  let ok = 0;
  for(const p of plan){
    try{
      const response = await fetch('/api/notes', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({type:'client_projects', client_key: p.key, client: p.jira_psa, projects: p.projects})
      });
      const result = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error || ('HTTP ' + response.status));
      ok++;
      console.log('OK', p.jira_psa, `(${p.sows} SOWs)`);
    }catch(e){
      console.error('FAIL', p.jira_psa, e.message);
    }
  }
  await loadClientProjects();
  console.log(`Listo: ${ok}/${plan.length} clientes cargados.`);
})();
