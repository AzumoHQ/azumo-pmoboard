
// ════════════════════════════════════════════════════
// DATA — injected by pmo-refresh.py
// ════════════════════════════════════════════════════
let PMO = /*%%PMO_DATA%%*/{
  "cloudId": "",
  "project": "AA",
  "last_refresh": "",
  "last_refresh_at": "",
  "history_start_date": "",
  "snapshots": []
}/*%%PMO_DATA_END%%*/;

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════
const today  = new Date();
let latest = null;
let prev = null;
let lastUpdated = '';
let serviceHealth = null;
let forecastFilters = {client:'', position:'', month:'', assignee:''};
let opsView = 'assignees';
let opsFilters = {search:'', client:'', position:'', projectManager:'', freelance:'', billingClass:''};
let opsClientMode = 'overview';
let opsClientSort = 'assigneesDesc';
let harvestUsersOpen = false;
let harvestSearch = '';
let harvestCollapsedClients = new Set();
let accountCoverageSearch = '';
let accountCoverageFilter = 'all';
let expandedAssignees = new Set();
let expandedProjectManagers = new Set();
const ACTION_STATE_KEY = 'pmo_action_center_state_v2';
const ACTION_REVIEW_TAG = 'pmo-action-review';
let remoteActionState = {};
let actionReviewsLoaded = false;
let actionReviewsPromise = null;
const PMO_JIRA_BOARD_URL = 'https://azumohq.atlassian.net/jira/software/c/projects/PMO/boards/629?search_id=06f11380-7c46-411e-addf-dfa9131314de&referrer=quick-find';
const MODULE_TAB_KEY = 'pmo_active_module_tab_v1';
let actionFilter = 'open';
let benchByMonthSortMonth = '';
let qaChecklistReviews = {};
let qaChecklistReviewsLoaded = false;
let qaChecklistReviewsPromise = null;

document.getElementById('navDate').textContent =
  today.toLocaleDateString('en-US',{weekday:'short',day:'numeric',month:'short'});

async function loadServiceHealth(){
  if(location.protocol === 'file:') return serviceHealth;
  try {
    const response = await fetch('/api/health', {cache:'no-store'});
    if(response.ok) serviceHealth = await response.json();
  } catch (error) {
    console.info('Health diagnostics unavailable:', error.message);
  }
  return serviceHealth;
}

async function loadDashboardData(){
  if(location.protocol !== 'file:' && !currentUser){
    updateAuthUi();
    return;
  }
  if(location.protocol !== 'file:'){
    try {
      const response = await fetch('/api/dashboard', {cache:'no-store', credentials:'same-origin'});
      if(response.status === 401 || response.status === 403){
        currentUser = null;
        updateAuthUi();
        setGateAuthMessage('Please sign in to open the dashboard.');
        return;
      }
      if(response.ok){
        const apiData = await response.json();
        if(apiData && Array.isArray(apiData.snapshots) && apiData.snapshots.length){
          PMO = apiData;
        }
      }
    } catch (error) {
      console.info('Dashboard data unavailable:', error.message);
    }
    await loadServiceHealth();
  }
  initDashboard();
}

function initDashboard(){
  if(!PMO.snapshots || !PMO.snapshots.length){
    document.getElementById('lastRefreshMeta').textContent = 'No data available';
    document.getElementById('lastRefreshTag').textContent  = 'No data available';
    document.getElementById('footerLastUpdated').textContent = 'Last updated: —';
    return;
  }
  latest = PMO.snapshots[PMO.snapshots.length - 1];
  prev   = PMO.snapshots.length > 1 ? PMO.snapshots[PMO.snapshots.length - 2] : null;
  lastUpdated = PMO.last_refresh_at
    ? new Date(PMO.last_refresh_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})
    : PMO.last_refresh;

  document.getElementById('lastRefreshMeta').textContent = `Last refresh: ${lastUpdated}`;
  document.getElementById('lastRefreshTag').textContent  = `Synced: ${lastUpdated}`;
  document.getElementById('footerLastUpdated').textContent = `Last updated: ${lastUpdated}`;
  document.getElementById('currentSnapshotLabel').textContent = latest.label;
  document.getElementById('historySnapshotsTag').textContent  = `${PMO.snapshots.length} snapshots`;

  renderMetrics();
  renderPmoActionCenter();
  renderEazyBIReports();
  renderHarvestAccess();
  renderAccountCoverageModule();
  renderDataTraceability();
  renderOpsViews();
  renderBench();
  renderPending();
  renderExpiring();
  renderHistory();
  renderForecast();
  initializeModuleTabs();
}

const THEME_KEY = 'pmo_dashboard_theme';
function applyTheme(theme){
  const light = theme === 'light';
  document.body.classList.toggle('light', light);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.textContent = light ? '🌙 Dark' : '☀️ Light';
}
function toggleTheme(){
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

function moduleLabel(section){
  const labels = {
    dashboard:'Reports',
    pmoActionCenter:'PMO QA',
        harvestAccess:'Harvest QA',
    accountCoverage:'Account Coverage',
    opsViews:'Operating Views',
    dueDates:'Due Dates',
    pendingAssignments:`Pending${latest?.pending_list?.length ? ` · ${latest.pending_list.length}` : ''}`,
    bench:'Bench',
    history:'History',
    forecast:'Forecast'
  };
  return labels[section.id] || section.querySelector('.sec-head h2')?.textContent?.trim() || section.id;
}
function currentModuleTabId(sections){
  const stored = localStorage.getItem(MODULE_TAB_KEY);
  if(stored && sections.some(section => section.id === stored)) return stored;
  return sections.some(section => section.id === 'pmoActionCenter') ? 'pmoActionCenter' : sections[0]?.id;
}
function renderModuleTabButtons(activeId){
  const sections = [...document.querySelectorAll('main > section[id]')];
  const index = document.getElementById('moduleIndexLinks');
  if(!index) return;
  index.innerHTML = sections.map(section => `<button type="button" role="tab" aria-selected="${section.id === activeId ? 'true' : 'false'}" class="${section.id === activeId ? 'active' : ''}" onclick="activateModuleTab('${section.id}')">${esc(moduleLabel(section))}</button>`).join('');
}
function activateModuleTab(id, options={}){
  const sections = [...document.querySelectorAll('main > section[id]')];
  const target = sections.find(section => section.id === id) || sections[0];
  if(!target) return;
  const activeId = target.id;
  localStorage.setItem(MODULE_TAB_KEY, activeId);
  sections.forEach(section => {
    const active = section.id === activeId;
    section.classList.toggle('tab-section-hidden', !active);
    section.classList.toggle('tab-section-active', active);
    section.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  renderModuleTabButtons(activeId);
  if(options.scroll !== false){
    document.querySelector('.side-index')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
function initializeModuleTabs(){
  const sections = [...document.querySelectorAll('main > section[id]')];
  activateModuleTab(currentModuleTabId(sections), {scroll:false});
}
function goTo(id){ activateModuleTab(id === 'dataTraceability' ? 'pmoActionCenter' : id); }
function toggleModule(id){ activateModuleTab(id); }
function setAllModulesCollapsed(){ initializeModuleTabs(); }
window.activateModuleTab = activateModuleTab;
window.toggleModule = toggleModule;
window.setAllModulesCollapsed = setAllModulesCollapsed;

let currentUser = null;
let authMode = 'login';
let authAfterLogin = null;
const AUTH_AFTER_LOGIN_KEY = 'pmo_auth_after_login';

function userInitials(user){
  const name = String(user?.name || user?.email || 'PMO').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if(parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0,3).toUpperCase();
}
function setGateAuthMessage(message=''){
  const error = document.getElementById('gateAuthError');
  if(!error) return;
  error.textContent = message || '';
  error.style.display = message ? 'block' : 'none';
}
function storeAuthAfterLogin(value=''){
  try{
    if(value) sessionStorage.setItem(AUTH_AFTER_LOGIN_KEY, String(value));
    else sessionStorage.removeItem(AUTH_AFTER_LOGIN_KEY);
  }catch(error){
    console.info('Session storage unavailable:', error.message);
  }
}
function readStoredAuthAfterLogin(){
  try{
    return String(sessionStorage.getItem(AUTH_AFTER_LOGIN_KEY) || '');
  }catch(error){
    return '';
  }
}
function clearStoredAuthAfterLogin(){
  storeAuthAfterLogin('');
}
function startGoogleSignIn(afterLogin=''){
  if(location.protocol === 'file:'){
    const message = 'Google sign-in requires the local server or deployed dashboard. Open http://127.0.0.1:4173 or the deployed app.';
    setGateAuthMessage(message);
    setAuthMessage('error', message);
    return false;
  }
  const nextAction = String(afterLogin || authAfterLogin || '').trim();
  storeAuthAfterLogin(nextAction);
  window.location.assign('/api/auth?action=google');
  return true;
}
async function resumeStoredAuthAction(){
  const after = readStoredAuthAfterLogin();
  if(!after || !currentUser) return;
  clearStoredAuthAfterLogin();
  if(after === 'snapshot'){
    await manualSnapshot();
    return;
  }
  if(after.startsWith('jiraTicket:')){
    await createActionJiraTicket(after.slice('jiraTicket:'.length));
    return;
  }
  if(after.startsWith('qaReview:')){
    await markQaChecklistReviewed(after.slice('qaReview:'.length));
    return;
  }
  if(after.startsWith('actionNote:')){
    const id = after.slice('actionNote:'.length);
    goTo('pmoActionCenter');
    setTimeout(()=>document.getElementById(actionNoteInputId(id))?.focus(), 140);
  }
}
function setAuthGateState(user){
  const locked = !user;
  document.body.classList.toggle('auth-locked', locked);
  document.body.classList.toggle('auth-ready', !locked);
  const gate = document.getElementById('authGate');
  if(gate){
    gate.style.display = locked ? 'flex' : 'none';
    gate.setAttribute('aria-hidden', locked ? 'false' : 'true');
  }
  if(locked){
    setTimeout(()=>document.getElementById('gateLoginBtn')?.focus(), 20);
  }else{
    setGateAuthMessage('');
  }
}
function loginFromGate(){
  setGateAuthMessage('');
  return startGoogleSignIn();
}
function updateAuthUi(){
  const status = document.getElementById('authStatusBtn');
  const logout = document.getElementById('authLogoutBtn');
  const usersLink = document.getElementById('adminUsersLink');
  const avatar = document.getElementById('authAvatar');
  if(!status || !avatar) return;
  if(currentUser){
    status.textContent = currentUser.name || currentUser.email || 'Signed in';
    status.title = `${currentUser.email || ''} · ${currentUser.role || ''}`;
    if(logout) logout.style.display = '';
    if(usersLink) usersLink.style.display = currentUser.role === 'PMO' ? '' : 'none';
    avatar.textContent = userInitials(currentUser);
    avatar.title = currentUser.email || currentUser.name || 'PMO';
  }else{
    status.textContent = 'Sign in with Google';
    status.title = 'Sign in with Google';
    if(logout) logout.style.display = 'none';
    if(usersLink) usersLink.style.display = 'none';
    avatar.textContent = 'PMO';
    avatar.title = 'PMO';
  }
  setAuthGateState(currentUser);
  if(currentUser){
    actionReviewsLoaded = false;
    actionReviewsPromise = null;
    loadActionReviews().then(()=>renderPmoActionCenter()).catch(()=>{});
  }else{
    remoteActionState = {};
    actionReviewsLoaded = false;
    actionReviewsPromise = null;
  }
  if(latest) renderDataTraceability();
}
async function loadCurrentUser(){
  if(location.protocol === 'file:'){
    updateAuthUi();
    return null;
  }
  try{
    const response = await fetch('/api/auth', {cache:'no-store', credentials:'same-origin'});
    if(response.ok){
      const result = await response.json();
      currentUser = result.user || null;
    }
  }catch(error){
    console.info('Auth unavailable:', error.message);
  }
  updateAuthUi();
  return currentUser;
}
function setAuthMessage(type, message){
  const error = document.getElementById('authError');
  const success = document.getElementById('authSuccess');
  if(error){ error.style.display = 'none'; error.textContent = ''; }
  if(success){ success.style.display = 'none'; success.textContent = ''; }
  const target = type === 'success' ? success : error;
  if(target && message){ target.textContent = message; target.style.display = 'block'; }
}
function showAuthModal(mode='login', afterLogin=null){
  authMode = mode;
  authAfterLogin = afterLogin;
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const copy = document.getElementById('authModalCopy');
  const loginFields = document.getElementById('authLoginFields');
  const passwordFields = document.getElementById('authPasswordFields');
  const accountFields = document.getElementById('authAccountFields');
  const submit = document.getElementById('authSubmitBtn');
  const cancel = document.getElementById('authCancelBtn');
  setAuthMessage('', '');
  loginFields.style.display = mode === 'login' ? '' : 'none';
  passwordFields.style.display = 'none';
  accountFields.style.display = mode === 'account' ? '' : 'none';
  if(mode === 'account'){
    title.textContent = 'Account';
    copy.textContent = 'You are signed in with your Google Azumo account.';
    submit.textContent = 'Close';
    submit.style.display = 'none';
    document.getElementById('authAccountSummary').innerHTML = currentUser
      ? `<strong>${esc(currentUser.name || currentUser.email)}</strong><br/>${esc(currentUser.email || '')}<br/><span style="color:var(--muted)">Role: ${esc(currentUser.role || 'viewer')}</span>`
      : 'Not signed in.';
  }else{
    title.textContent = 'Sign in';
    copy.textContent = 'Use your Google Azumo account to continue.';
    submit.textContent = 'Sign in with Google';
    submit.style.display = '';
  }
  if(cancel){
    cancel.textContent = mode === 'account' ? 'Close' : 'Cancel';
    cancel.style.display = (!currentUser && mode === 'login') ? 'none' : '';
  }
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  setTimeout(()=>{
    const focusId = mode === 'login' ? 'authGoogleBtn' : 'authCancelBtn';
    document.getElementById(focusId)?.focus();
  }, 20);
}
function closeAuthModal(){
  if(!currentUser && authMode === 'login') return;
  const modal = document.getElementById('authModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  authAfterLogin = null;
}
async function submitAuthModal(){
  if(authMode === 'account'){
    closeAuthModal();
    return;
  }
  if(authMode === 'password') return changeUserPassword();
  return loginUser();
}
function loginUser(){
  const submit = document.getElementById('authSubmitBtn');
  submit.disabled = true;
  submit.textContent = 'Redirecting...';
  setAuthMessage('', '');
  const redirected = startGoogleSignIn(authAfterLogin);
  if(!redirected){
    submit.disabled = false;
    submit.textContent = 'Sign in with Google';
  }
  return null;
}
async function changeUserPassword(){
  const currentPassword = document.getElementById('authCurrentPassword').value;
  const newPassword = document.getElementById('authNewPassword').value;
  const confirmPassword = document.getElementById('authConfirmPassword').value;
  if(!currentPassword || !newPassword){ setAuthMessage('error','Current and new password are required.'); return; }
  if(newPassword.length < 10){ setAuthMessage('error','New password must be at least 10 characters.'); return; }
  if(newPassword !== confirmPassword){ setAuthMessage('error','New password confirmation does not match.'); return; }
  const submit = document.getElementById('authSubmitBtn');
  submit.disabled = true;
  submit.textContent = 'Saving...';
  try{
    const response = await fetch('/api/auth?action=change-password', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({currentPassword,newPassword})
    });
    const result = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    currentUser = result.user || currentUser;
    updateAuthUi();
    document.getElementById('authCurrentPassword').value = '';
    document.getElementById('authNewPassword').value = '';
    document.getElementById('authConfirmPassword').value = '';
    setAuthMessage('success','Password updated.');
  }catch(error){
    setAuthMessage('error', error.message);
  }finally{
    submit.disabled = false;
    submit.textContent = 'Save password';
  }
}
async function logoutUser(){
  try{ await fetch('/api/auth?action=logout', {method:'POST', credentials:'same-origin'}); }
  catch(error){ console.info('Logout failed:', error.message); }
  clearStoredAuthAfterLogin();
  currentUser = null;
  latest = null;
  prev = null;
  PMO = {cloudId:'', project:'AA', last_refresh:'', last_refresh_at:'', snapshots:[]};
  updateAuthUi();
}

async function manualSnapshot(){
  if(location.protocol === 'file:'){
    alert('Manual snapshots need the deployed dashboard/API. Open https://pmoboard.vercel.app first.');
    return;
  }
  if(!currentUser){
    showAuthModal('login', 'snapshot');
    return;
  }
  const btns = [...document.querySelectorAll('[data-sync-action]')];
  btns.forEach(btn => { btn.disabled = true; btn.dataset.originalText = btn.dataset.originalText || btn.textContent; btn.textContent = '⏳ Syncing...'; });
  try{
    const response = await fetch('/api/refresh', {
      method:'POST',
      credentials:'same-origin',
      headers:{
        'Content-Type':'application/json'
      },
      body: JSON.stringify({})
    });
    const result = await response.json().catch(()=>({}));
    if(response.status === 401){
      currentUser = null;
      updateAuthUi();
      showAuthModal('login', 'snapshot');
      throw new Error('Please sign in again.');
    }
    if(!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    const dashboardResponse = await fetch('/api/dashboard', {cache:'no-store', credentials:'same-origin'});
    if(dashboardResponse.ok){
      PMO = await dashboardResponse.json();
      await loadServiceHealth();
      initDashboard();
    }
    const harvestStatus = result.harvest_status || serviceHealth?.harvest_status || {};
    const missingHarvest = harvestStatus.missing || [];
    const harvestMessage = result.harvest_synced
      ? 'Harvest synced.'
      : missingHarvest.length
        ? `Harvest skipped: missing ${missingHarvest.join(', ')} in Vercel.`
        : (result.warnings || []).find(msg => msg.toLowerCase().includes('harvest')) || 'Harvest kept previous data.';
    alert(`Data synchronized from Jira + EazyBI. ${harvestMessage} Total snapshots: ${result.snapshots || PMO.snapshots?.length || '—'}`);
  }catch(error){
    alert(`Sync failed: ${error.message}`);
  }finally{
    btns.forEach(btn => { btn.disabled = false; btn.textContent = btn.dataset.originalText || 'Sync'; });
  }
}
// ════════════════════════════════════════════════════
// METRICS CARDS
// ════════════════════════════════════════════════════
const METRIC_CFG = [
  {key:'utilization_assignment', label:'Utilization Rate (Assignment)', unit:'%',  color:'#10B981', higherBetter:true,  src:'EazyBI'},
  {key:'utilization_billing',    label:'Utilization Rate (Billing)',    unit:'%',  color:'#10B981', higherBetter:true,  src:'EazyBI'},
  {key:'headcount_billable',     label:'Headcount Billable',            unit:'',   color:'#0066FF', higherBetter:true,  src:'EazyBI'},
  {key:'headcount_nonbillable',  label:'Headcount Non-Billable',        unit:'',   color:'#F59E0B', higherBetter:false, src:'EazyBI'},
  {key:'bench',                  label:'Bench',                         unit:'',   color:'#EF4444', higherBetter:false, src:'Jira'},
  {key:'active_clients',         label:'Active Clients',              unit:'',   color:'#7C3AED', higherBetter:true,  src:'Jira'},
  {key:'pending_assignments',    label:'Pending Assignments',           unit:'',   color:'#F59E0B', higherBetter:false, src:'Jira'},
  {key:'unassigned_capacity',    label:'Unassigned Capacity',           unit:'%',  color:'#F97316', higherBetter:false, src:'EazyBI'},
];

function deltaStr(cur, prv, higherBetter){
  if(prv === undefined || prv === null) return {text:'—', cls:'delta-flat'};
  const d = (cur - prv);
  if(Math.abs(d) < 0.01) return {text:'no change', cls:'delta-flat'};
  const sign = d > 0 ? '+' : '';
  const pct  = typeof cur === 'number' && Math.abs(cur) < 200 ? `${sign}${d.toFixed(1)}` : `${sign}${Math.round(d)}`;
  const good = higherBetter ? d > 0 : d < 0;
  return {text: pct + (typeof cur === 'number' && cur < 200 ? '' : ''), cls: good ? 'delta-up' : 'delta-dn'};
}

function sparklineSVG(snapshots, key, color){
  if(snapshots.length < 2) return '';
  const vals  = snapshots.map(s => s.metrics[key] || 0);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const W = 120, H = 30, PAD = 3;
  const pts = vals.map((v,i) => {
    const x = PAD + (i / (vals.length-1)) * (W - PAD*2);
    const y = H - PAD - ((v - min) / range) * (H - PAD*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="mc-spark">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>
    <circle cx="${pts.split(' ').at(-1).split(',')[0]}" cy="${pts.split(' ').at(-1).split(',')[1]}" r="3" fill="${color}"/>
  </svg>`;
}


function renderMetrics(){
  const grid = document.getElementById('metricsGrid');
  grid.innerHTML = '';
  METRIC_CFG.forEach(cfg => {
    const cur = latest.metrics[cfg.key];
    const prv = prev ? prev.metrics[cfg.key] : null;
    const {text, cls} = deltaStr(cur, prv, cfg.higherBetter);
    const card = document.createElement('div');
    card.className = `mc${cfg.key === 'bench' ? ' has-floating-tooltip' : ''}`;
    card.style.setProperty('--mc', cfg.color);
    const benchHover = cfg.key === 'bench'
      ? `<div class="mc-extra"><span class="bench-hover" id="utilBenchHover" tabindex="0">🪑 Bench people <strong id="utilBenchHoverCount">—</strong><span class="bench-hover-panel" id="utilBenchHoverPanel" role="tooltip">Loading bench list…</span></span></div>`
      : '';
    card.innerHTML = `
      <div class="mc-top">
        <div class="mc-name">${cfg.label}</div>
        <span style="font-size:.68rem;color:var(--muted);background:var(--surf);border:1px solid var(--brd);border-radius:4px;padding:1px 5px;">${cfg.src}</span>
      </div>
      <div class="mc-val">${typeof cur === 'number' ? (cur % 1 !== 0 ? cur.toFixed(2) : cur) : '—'}<span class="mc-unit"> ${cfg.unit}</span></div>
      ${benchHover}
      ${prev ? `<span class="hist-delta ${cls}" style="font-size:.72rem;display:inline-block;margin-bottom:4px">${text} vs ${prev.label}</span>` : ''}
      ${sparklineSVG(PMO.snapshots, cfg.key, cfg.color)}
    `;
    grid.appendChild(card);
  });
  renderUtilBillingBenchHover();
}

// ════════════════════════════════════════════════════
// BENCH / EXPIRING / PENDING
// ════════════════════════════════════════════════════
const POS_COLOR = {
  'DevOps':'#3B82F6','PM/BA':'#A855F7','Project Manager':'#A855F7',
  'Data Scientist':'#10B981','Data Scientist, Applied AI':'#10B981',
  'UX/UI':'#F97316','Business Analyst':'#F59E0B','Data Engineering':'#06B6D4',
  'Engineer':'#0066FF','Fullstack Engineer':'#0066FF'
};
function posChip(p){ if(!p) return '<span style="color:var(--muted)">—</span>'; const c=POS_COLOR[p]||'#6B8FBF'; return `<span class="chip" style="background:${c}18;color:${c}">${esc(p)}</span>`; }
function availCls(v){ return v>=70?'avail-hi':v>=40?'avail-md':'avail-lo'; }
function parseLocalDate(s){ if(!s) return null; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(Number(m[1]), Number(m[2])-1, Number(m[3])) : new Date(s); }
function expCls(dateStr){ const parsed=parseLocalDate(dateStr); if(!parsed || Number.isNaN(parsed.getTime())) return 'exp-ok'; const base=new Date(today.getFullYear(), today.getMonth(), today.getDate()); const d=Math.ceil((parsed-base)/86400000); return d<0?'exp-urgent':'exp-soon'; }
function fmtDate(s){ const parsed=parseLocalDate(s); return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'; }
function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toPct(v){
  if(v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if(Number.isNaN(n)) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}
function firstPct(...vals){
  for(const v of vals){
    const n = toPct(v);
    if(n !== null) return n;
  }
  return null;
}
function rawPct(v){
  if(v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function firstRawPct(...vals){
  for(const v of vals){
    const n = rawPct(v);
    if(n !== null) return n;
  }
  return null;
}
function fmtPct(v){
  const n = toPct(v);
  if(n === null) return '—';
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}%`;
}
function fmtRawPct(v){
  const n = rawPct(v);
  if(n === null) return '—';
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}%`;
}

function reportSourceLabel(report, fallback){
  return esc(report?.source || fallback || 'EazyBI');
}
function reportMonthLabel(month){
  if(!month) return '—';
  const parsed = new Date(`${String(month).replace(/^([A-Za-z]{3}) /,'$1 1, ')} 00:00:00`);
  return Number.isNaN(parsed.getTime()) ? month : parsed.toLocaleDateString('en-US',{month:'short',year:'numeric'});
}
function reportNumber(v){
  if(v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100;
}
function normalizeUtilBillingReport(report={}){
  const rates = report.rates || {};
  const months = (report.months && report.months.length) ? report.months : Object.keys(rates);
  const totalHeadcount = reportNumber(report.total_headcount);
  const modeled = (report.modeled_rows && report.modeled_rows.length)
    ? report.modeled_rows.map(row => ({
        month: row.month,
        utilization_billing_rate: reportNumber(toPct(row.utilization_billing_rate)),
        total_headcount: row.total_headcount ?? (totalHeadcount || '')
      }))
    : months.map(month => ({
        month,
        utilization_billing_rate: reportNumber(toPct(rates[month])),
        total_headcount: totalHeadcount || ''
      }));
  return {
    ...report,
    months,
    modeled_rows: modeled,
    formula: report.formula || {
      label:'Utilization Billing Rate',
      calculation:'Utilization Billing Rate is read from EazyBI by month',
      note:'EazyBI is the source of truth. The dashboard does not derive billed headcount or use Jira/Harvest rates for this report.'
    },
    raw_table: report.raw_table || {
      columns:['Month','Utilization Billing %','Total Headcount'],
      rows: modeled.map(row => [row.month, `${row.utilization_billing_rate}%`, row.total_headcount || ''])
    }
  };
}
function renderRawTable(table, theadId, tbodyId, emptyMessage='No raw rows available.'){
  const thead = document.getElementById(theadId);
  const tbody = document.getElementById(tbodyId);
  if(!thead || !tbody) return;
  const columns = table?.columns || [];
  const rows = table?.rows || [];
  if(!columns.length || !rows.length){
    thead.innerHTML = '<tr><th>Raw data</th></tr>';
    tbody.innerHTML = `<tr><td style="color:var(--muted);padding:1rem">${esc(emptyMessage)}</td></tr>`;
    return;
  }
  const visibleColumns = columns.slice(0, 14);
  thead.innerHTML = `<tr>${visibleColumns.map(col => `<th>${esc(col)}</th>`).join('')}${columns.length > visibleColumns.length ? '<th>More</th>' : ''}</tr>`;
  tbody.innerHTML = rows.slice(0, 200).map(row => {
    const cells = visibleColumns.map((_, idx) => `<td>${esc(Array.isArray(row) ? row[idx] : row?.[columns[idx]])}</td>`).join('');
    const more = columns.length > visibleColumns.length ? `<td style="color:var(--muted)">+${columns.length-visibleColumns.length} cols</td>` : '';
    return `<tr>${cells}${more}</tr>`;
  }).join('') + (rows.length > 200 ? `<tr><td colspan="${visibleColumns.length + 1}" style="color:var(--muted);padding:1rem">Showing first 200 of ${rows.length} raw rows.</td></tr>` : '');
}
function renderEazyBIReports(){
  renderUtilizationBillingRateReport();
  renderBenchByMonthReport();
}
function harvestPayload(){ return latest?.harvest || {}; }
function harvestIdentityKey(row = {}){
  const email = String(row.email || row.user_email || '').trim().toLowerCase();
  if(email) return `email:${email}`;
  const id = row.id || row.user_id;
  if(id) return `id:${id}`;
  const name = String(row.name || row.user_name || '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}
function harvestProjectKey(row = {}){
  // Project objects use `id`; Harvest user-assignment rows use their own `id`
  // plus `project_id`. Prefer project_id so Team rows attach to the project.
  return String(row.project_id || row.id || `${row.client_name || ''}:${row.name || row.project_name || ''}`);
}
function harvestProjectUrl(project = {}){
  return project.id ? `https://azumo.harvestapp.com/projects/${project.id}` : '';
}
function normalizeSowSummary(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();
}
function harvestNonBillableTeamIndex(){
  const index = new Set();
  (latest?.non_billable_epic_assignments || []).forEach(row => {
    const summary = normalizeSowSummary(row.summary || row.sow || '');
    if(!summary) return;
    const email = String(row.email || '').trim().toLowerCase();
    const name = normalizeIdentity(row.assignee || row.epic_assignee || '');
    if(email) index.add(`${summary}|email:${email}`);
    if(name) index.add(`${summary}|name:${name}`);
  });
  return index;
}
function isHarvestNonBillableTeamMember(row = {}, nonBillableIndex = new Set()){
  if(!nonBillableIndex.size) return false;
  const summary = normalizeSowSummary(row.project_name || row.name || '');
  if(!summary) return false;
  const email = String(row.user_email || row.email || '').trim().toLowerCase();
  const name = normalizeIdentity(row.user_name || row.name || '');
  return Boolean((email && nonBillableIndex.has(`${summary}|email:${email}`)) || (name && nonBillableIndex.has(`${summary}|name:${name}`)));
}
function toggleHarvestUsers(force){
  harvestUsersOpen = typeof force === 'boolean' ? force : !harvestUsersOpen;
  renderHarvestAccess();
}
function setHarvestSearch(value){
  harvestSearch = String(value || '');
  renderHarvestAccess();
}
function toggleHarvestClient(key){
  if(harvestCollapsedClients.has(key)) harvestCollapsedClients.delete(key);
  else harvestCollapsedClients.add(key);
  renderHarvestAccess();
}
function harvestPeopleChips(values, limit=10){
  const list = uniqueNonEmpty(values).sort((a,b)=>a.localeCompare(b));
  if(!list.length) return '<span style="color:var(--muted)">No team members</span>';
  const shown = list.slice(0, limit).map(person => `<span class="assignment-chip">${esc(person)}</span>`).join('');
  const more = list.length > limit ? `<span class="assignment-chip">+${list.length - limit} more</span>` : '';
  return shown + more;
}
function renderHarvestAccess(){
  const harvest = harvestPayload();
  const activeProjects = (harvest.projects || []).filter(project => project.is_active !== false);
  const activeUsers = (harvest.users || []).filter(user => user.is_active !== false);
  const rawActiveAssignments = (harvest.user_assignments || []).filter(row => row.is_active !== false && row.project_is_active !== false);
  const nonBillableTeamIndex = harvestNonBillableTeamIndex();
  const activeAssignments = rawActiveAssignments.filter(row => !isHarvestNonBillableTeamMember(row, nonBillableTeamIndex));
  const hiddenNonBillableTeamRows = rawActiveAssignments.length - activeAssignments.length;
  const harvestStatus = serviceHealth?.harvest_status || {};
  const missingHarvest = harvestStatus.missing || [];
  const harvestConfigured = harvestStatus.configured === true || Boolean(harvest.fetched_at);

  const tag = document.getElementById('harvestAccessTag');
  if(tag) tag.textContent = harvest.fetched_at
    ? `Synced ${new Date(harvest.fetched_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}`
    : (missingHarvest.length ? `Missing ${missingHarvest.length} credential${missingHarvest.length === 1 ? '' : 's'}` : 'Not configured yet');

  const assignmentsByProject = new Map();
  const userAccess = new Map();
  activeAssignments.forEach(row => {
    const projectKey = harvestProjectKey(row);
    if(!assignmentsByProject.has(projectKey)) assignmentsByProject.set(projectKey, []);
    assignmentsByProject.get(projectKey).push(row);

    const userKey = harvestIdentityKey(row);
    if(userKey){
      if(!userAccess.has(userKey)) userAccess.set(userKey, {projects:new Set(), pmProjects:new Set(), clients:new Set()});
      const access = userAccess.get(userKey);
      if(row.project_name) access.projects.add(row.project_name);
      if(row.client_name) access.clients.add(row.client_name);
      if(row.is_project_manager && row.project_name) access.pmProjects.add(row.project_name);
    }
  });

  const userRows = activeUsers
    .slice()
    .sort((a,b)=>String(a.name || '').localeCompare(String(b.name || '')))
    .map(user => {
      const access = userAccess.get(harvestIdentityKey(user)) || {projects:new Set(), pmProjects:new Set(), clients:new Set()};
      return {...user, access};
    });

  const cards = document.getElementById('harvestSummaryCards');
  if(cards){
    cards.innerHTML = `<button type="button" class="action-card harvest-user-card ${harvestUsersOpen ? 'open' : ''} ${harvestConfigured ? 'ok' : 'warning'}" onclick="toggleHarvestUsers()" aria-expanded="${harvestUsersOpen ? 'true' : 'false'}">
      <div class="action-label">Active users</div>
      <div class="action-value">${activeUsers.length || harvest.counts?.active_users || 0}</div>
      <div class="action-copy">Harvest active user records · click to show team list</div>
    </button>`;
  }

  const usersPanel = document.getElementById('harvestUsersPanel');
  const usersSummary = document.getElementById('harvestUsersSummary');
  const usersTbody = document.getElementById('harvestUsersTbody');
  if(usersPanel) usersPanel.classList.toggle('open', harvestUsersOpen);
  if(usersSummary) usersSummary.textContent = `${userRows.length} active users · ${activeAssignments.length} billable team access rows${hiddenNonBillableTeamRows ? ` · ${hiddenNonBillableTeamRows} non-billable hidden` : ''}`;
  if(usersTbody){
    usersTbody.innerHTML = userRows.length
      ? userRows.map(user => {
          const projects = user.access?.projects?.size || 0;
          const pmProjects = user.access?.pmProjects?.size || 0;
          const clients = [...(user.access?.clients || [])].sort((a,b)=>a.localeCompare(b)).slice(0,4).join(', ');
          return `<tr>
            <td style="font-weight:800">${esc(user.name || 'Unnamed user')}<div style="color:var(--muted);font-size:.72rem;margin-top:2px">${esc(clients || 'No active client access')}</div></td>
            <td style="color:var(--muted)">${esc(user.email || '—')}</td>
            <td>${user.is_contractor ? '<span class="chip badge-yellow">Contractor</span>' : '<span class="chip badge-green">Employee</span>'}</td>
            <td style="font-weight:800">${projects}</td>
            <td>${pmProjects || '—'}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem">No active Harvest users loaded yet.</td></tr>';
  }

  const note = document.getElementById('harvestSourceNote');
  if(note){
    note.textContent = harvest.fetched_at
      ? `Harvest read-only · Non-billable Jira rows hidden${hiddenNonBillableTeamRows ? ` (${hiddenNonBillableTeamRows})` : ''}.`
      : missingHarvest.length
        ? `Harvest not connected: ${missingHarvest.join(', ')}.`
        : 'Harvest ready. Run Sync sources.';
  }

  const projectsByClient = new Map();
  activeProjects.forEach(project => {
    const projectKey = harvestProjectKey(project);
    const assignments = assignmentsByProject.get(projectKey) || [];
    const people = assignments.map(row => row.user_name || row.user_email).filter(Boolean);
    const pms = assignments.filter(row => row.is_project_manager).map(row => row.user_name || row.user_email).filter(Boolean);
    const clientKey = String(project.client_id || project.client_name || 'unknown');
    if(!projectsByClient.has(clientKey)){
      projectsByClient.set(clientKey, {
        key: clientKey,
        client_name: project.client_name || 'No client',
        projects: [],
        people: new Set(),
        pms: new Set()
      });
    }
    const client = projectsByClient.get(clientKey);
    people.forEach(person => client.people.add(person));
    pms.forEach(person => client.pms.add(person));
    client.projects.push({project, people: uniqueNonEmpty(people), pms: uniqueNonEmpty(pms), assignment_count: assignments.length});
  });

  let clientGroups = [...projectsByClient.values()].map(client => ({
    ...client,
    projects: client.projects.sort((a,b)=>String(a.project.name || '').localeCompare(String(b.project.name || '')))
  })).sort((a,b)=>String(a.client_name || '').localeCompare(String(b.client_name || '')));

  const query = harvestSearch.trim().toLowerCase();
  if(query){
    clientGroups = clientGroups.map(client => {
      const clientMatches = String(client.client_name || '').toLowerCase().includes(query);
      const projects = client.projects.filter(item => {
        const haystack = [
          client.client_name,
          item.project.name,
          item.project.code,
          item.people.join(' '),
          item.pms.join(' ')
        ].join(' ').toLowerCase();
        return clientMatches || haystack.includes(query);
      });
      return {...client, projects};
    }).filter(client => client.projects.length);
  }

  const searchInput = document.getElementById('harvestSearchInput');
  if(searchInput && searchInput.value !== harvestSearch) searchInput.value = harvestSearch;

  const projectsSummary = document.getElementById('harvestProjectsSummary');
  const visibleProjectCount = clientGroups.reduce((sum, client) => sum + client.projects.length, 0);
  if(projectsSummary){
    projectsSummary.textContent = query
      ? `${visibleProjectCount} of ${activeProjects.length} active projects · ${clientGroups.length} matching clients`
      : `${activeProjects.length} active projects under ${projectsByClient.size} clients · ${activeAssignments.length} billable team access rows${hiddenNonBillableTeamRows ? ` · ${hiddenNonBillableTeamRows} non-billable hidden` : ''}`;
  }

  const list = document.getElementById('harvestClientsList');
  const empty = document.getElementById('harvestEmptyState');
  if(!list) return;
  if(!clientGroups.length){
    list.innerHTML = '';
    if(empty){
      empty.style.display = '';
      empty.textContent = activeProjects.length ? 'No active Harvest projects match the current search.' : 'No active Harvest projects loaded yet.';
    }
    return;
  }
  if(empty) empty.style.display = 'none';

  list.innerHTML = clientGroups.map(client => {
    const peopleCount = client.projects.reduce((set, item) => {
      item.people.forEach(person => set.add(person));
      return set;
    }, new Set()).size;
    const pmCount = client.projects.reduce((set, item) => {
      item.pms.forEach(person => set.add(person));
      return set;
    }, new Set()).size;
    const collapsed = harvestCollapsedClients.has(client.key);
    const projectRows = client.projects.map(item => {
      const project = item.project || {};
      const url = harvestProjectUrl(project);
      const name = url
        ? `<a class="action-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(project.name || 'Untitled project')}</a>`
        : esc(project.name || 'Untitled project');
      const billable = project.is_billable === false ? '<span class="chip badge-yellow">Non-billable</span>' : '<span class="chip badge-green">Billable</span>';
      return `<div class="harvest-project-row">
        <div>
          <div class="harvest-project-name">${name}</div>
          <div class="harvest-project-meta">${billable} ${project.code ? `· Code: ${esc(project.code)}` : ''}${project.updated_at ? ` · Updated ${esc(fmtDate(String(project.updated_at).slice(0,10)))}` : ''}</div>
        </div>
        <div class="harvest-people">${harvestPeopleChips(item.people, 12)}</div>
        <div class="harvest-pm">${item.pms.length ? harvestPeopleChips(item.pms, 6) : '<span style="color:var(--muted)">No PM marked in Harvest</span>'}</div>
        <div style="font-weight:900;text-align:right">${item.people.length}</div>
      </div>`;
    }).join('');
    return `<article class="harvest-client-card">
      <div class="harvest-client-head" onclick='toggleHarvestClient(${jsArg(client.key)})'>
        <div>
          <div class="harvest-client-title">${collapsed ? '▸' : '▾'} ${esc(client.client_name || 'No client')}</div>
          <div class="harvest-client-sub">Active Harvest projects/files nested under this client.</div>
        </div>
        <div class="harvest-client-stats">
          <span class="harvest-stat">${client.projects.length} projects</span>
          <span class="harvest-stat">${peopleCount} team</span>
          <span class="harvest-stat">${pmCount} PMs</span>
        </div>
      </div>
      <div class="harvest-projects" style="${collapsed ? 'display:none' : ''}">
        <div class="harvest-project-row" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:900;background:rgba(255,255,255,.02)">
          <div>Project / SOW file</div><div>Team</div><div>Project managers</div><div style="text-align:right">#</div>
        </div>
        ${projectRows}
      </div>
    </article>`;
  }).join('');
}
window.toggleHarvestUsers = toggleHarvestUsers;
window.setHarvestSearch = setHarvestSearch;
window.toggleHarvestClient = toggleHarvestClient;

function billingBenchRows(){
  const byPerson = new Map();
  (latest?.bench_list || []).forEach(row => {
    if(String(row.status || '').trim() && String(row.status || '').trim() !== 'In Progress') return;
    const name = String(row.assignee || row.epic_assignee || row.name || '').trim();
    if(!name) return;
    const key = normalizeIdentity(row.email || name);
    const pct = firstPct(row.bench_pct, row.pct, row.assignment_pct, row.assignment_percent, row.assignment_percentage) ?? 0;
    const position = row.epic_position || row.position || row.assignment_position || '—';
    const current = byPerson.get(key);
    if(!current || pct > current.pct){
      byPerson.set(key, {assignee:name, position, pct});
    }
  });
  return [...byPerson.values()].sort((a,b)=>(b.pct || 0) - (a.pct || 0) || a.assignee.localeCompare(b.assignee));
}
function renderUtilBillingBenchHover(){
  const count = document.getElementById('utilBenchHoverCount');
  const panel = document.getElementById('utilBenchHoverPanel');
  if(!count || !panel) return;
  const rows = billingBenchRows();
  count.textContent = rows.length;
  if(!rows.length){
    panel.innerHTML = '<div class="bench-tip-title">No active Bench people</div>';
    return;
  }
  const visible = rows.slice(0, 16);
  panel.innerHTML = `
    <div class="bench-tip-title">Active Bench people</div>
    <div class="bench-tip-list">
      ${visible.map(row => `<div class="bench-tip-row"><div class="bench-tip-name">${esc(row.assignee)}</div><div class="bench-tip-position">${esc(row.position || '—')}</div><div class="bench-tip-pct">${fmtPct(row.pct)}</div></div>`).join('')}
    </div>
    ${rows.length > visible.length ? `<div class="bench-tip-more">+${rows.length - visible.length} more</div>` : ''}
  `;
}

function renderUtilizationBillingRateReport(){
  const report = normalizeUtilBillingReport(latest.utilization_billing_rate || {});
  const months = report.months || [];
  const rows = report.modeled_rows || [];
  const cards = document.getElementById('utilBillingCards');
  const procedure = document.getElementById('utilBillingProcedure');
  const thead = document.getElementById('utilBillingThead');
  const tbody = document.getElementById('utilBillingTbody');
  const source = document.getElementById('utilBillingSource');
  if(!thead || !tbody) return;
  if(source) source.textContent = reportSourceLabel(report, 'EazyBI');
  renderUtilBillingBenchHover();
  if(!months.length){
    if(cards) cards.innerHTML = '';
    if(procedure) procedure.textContent = 'No Utilization Billing Rate report loaded yet.';
    thead.innerHTML = '<tr><th>Report</th></tr>';
    tbody.innerHTML = '<tr><td style="color:var(--muted);padding:1rem">No Utilization Billing Rate report loaded yet.</td></tr>';
    return;
  }
  const latestRow = rows[rows.length - 1] || {};
  const bestMonthLabel = reportMonthLabel(latestRow.month || months[months.length - 1]);
  if(cards){
    cards.innerHTML = [
      `<div class="util-card" title="${esc(report.formula?.calculation || 'EazyBI exported Utilization Billing %')}"><div class="util-card-label">Latest %</div><div class="util-card-value">${fmtPct(latestRow.utilization_billing_rate)}</div><div class="util-card-sub">${esc(bestMonthLabel)} · EazyBI only</div></div>`,
      `<div class="util-card"><div class="util-card-label">Total Headcount</div><div class="util-card-value">${esc(latestRow.total_headcount ?? report.total_headcount ?? '—')}</div><div class="util-card-sub">EazyBI denominator</div></div>`,
      `<div class="util-card"><div class="util-card-label">Months imported</div><div class="util-card-value">${months.length}</div><div class="util-card-sub">EazyBI rows</div></div>`
    ].join('');
  }
  if(procedure){
    const formula = report.formula || {};
    procedure.innerHTML = `${esc(formula.calculation || 'Read from EazyBI by month')}. EazyBI is source of truth; Jira/Harvest rates are not used.`;
  }
  thead.innerHTML = '<tr><th>Month</th><th>Utilization Billing %</th><th>Total Headcount</th></tr>';
  tbody.innerHTML = rows.map((row, idx) => {
    const isLatest = idx === rows.length - 1;
    return `<tr>
      <td style="font-weight:${isLatest ? 900 : 700};white-space:nowrap">${esc(reportMonthLabel(row.month))}</td>
      <td style="font-weight:${isLatest ? 900 : 800}">${fmtPct(row.utilization_billing_rate)}</td>
      <td>${esc(row.total_headcount ?? '—')}</td>
    </tr>`;
  }).join('');
}

function renderBenchByMonthReport(){
  const report = latest.bench_by_month || {};
  const months = report.months || [];
  const thead = document.getElementById('benchByMonthThead');
  const tbody = document.getElementById('benchByMonthTbody');
  const source = document.getElementById('benchByMonthSource');
  const sortSelect = document.getElementById('benchByMonthSortMonth');
  if(!thead || !tbody) return;
  if(source) source.textContent = reportSourceLabel(report, 'EazyBI');
  if(!months.length){
    if(sortSelect) sortSelect.innerHTML = '';
    thead.innerHTML = '<tr><th>Report</th></tr>';
    tbody.innerHTML = '<tr><td style="color:var(--muted);padding:1rem">No Bench by Month report loaded yet.</td></tr>';
    return;
  }
  if(!benchByMonthSortMonth || !months.includes(benchByMonthSortMonth)) benchByMonthSortMonth = months[months.length - 1];
  if(sortSelect){
    sortSelect.innerHTML = months.map(month => `<option value="${esc(month)}" ${month === benchByMonthSortMonth ? 'selected' : ''}>${esc(reportMonthLabel(month))}</option>`).join('');
    sortSelect.title = 'Rows sort from more available to less available for the selected month';
  }
  const sortMonth = benchByMonthSortMonth;
  const rows = (report.rows || [])
    .filter(row => String(row.assignee || '').trim().toLowerCase() !== 'assignees')
    .slice()
    .sort((a,b)=>(toPct(b.availability?.[sortMonth]) || 0) - (toPct(a.availability?.[sortMonth]) || 0) || String(a.assignee || '').localeCompare(String(b.assignee || '')));
  thead.innerHTML = `<tr><th rowspan="2">Assignee</th><th colspan="${months.length}">Availability</th><th colspan="${months.length}">Utilization</th></tr>
    <tr>${months.map(month => `<th>${esc(reportMonthLabel(month))}</th>`).join('')}${months.map(month => `<th>${esc(reportMonthLabel(month))}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(row => `<tr>
      <td style="font-weight:700;white-space:nowrap">${esc(row.assignee || '—')}</td>
      ${months.map(month => `<td class="${availCls(Math.max(0, toPct(row.availability?.[month]) || 0))}" style="${month === sortMonth ? 'font-weight:950' : ''}">${fmtPct(row.availability?.[month])}</td>`).join('')}
      ${months.map(month => `<td style="${month === sortMonth ? 'font-weight:850' : ''}">${fmtPct(row.utilization?.[month])}</td>`).join('')}
    </tr>`).join('') || '<tr><td style="color:var(--muted);padding:1rem">No Bench by Month rows.</td></tr>';
}
function setBenchByMonthSortMonth(month){
  benchByMonthSortMonth = month || '';
  renderBenchByMonthReport();
}
window.setBenchByMonthSortMonth = setBenchByMonthSortMonth;
function canSeeDataTraceability(){
  return currentUser && ['admin','pmo','executive','c-level','clevel'].includes(String(currentUser.role || '').toLowerCase());
}
function buildEpicDueBeforeChildDueRows(rows){
  const byEpic = new Map();
  rows.forEach(row => {
    if(row.status !== 'In Progress') return;
    if(isBenchRow(row)) return;
    if(!row.epic_key || !row.epic_due || !row.due) return;
    if(!byEpic.has(row.epic_key)){
      byEpic.set(row.epic_key, {
        key: row.epic_key,
        epic_key: row.epic_key,
        assignee: row.epic_assignee || row.assignee || '',
        client: row.client || '',
        position: row.epic_position || '',
        status: row.epic_status || '',
        due: row.epic_due,
        epic_due: row.epic_due,
        max_child_due: row.due,
        child_key: row.key,
        project_manager: row.project_manager || ''
      });
      return;
    }
    const current = byEpic.get(row.epic_key);
    if(String(row.due) > String(current.max_child_due || '')){
      current.max_child_due = row.due;
      current.child_key = row.key;
      current.client = row.client || current.client;
      current.project_manager = row.project_manager || current.project_manager;
    }
  });
  return [...byEpic.values()].filter(row => String(row.epic_due || '') < String(row.max_child_due || ''));
}
function activeCapacityPersonKey(row){
  const email = String(row.email || '').trim().toLowerCase();
  if(email) return `email:${email}`;
  const name = normalizeIdentity(row.epic_assignee || row.assignee || row.name || '');
  return name ? `name:${name}` : '';
}
function benchResidualMismatchRows(rows){
  const consumedByPerson = new Map();
  (rows || []).forEach(row => {
    if(String(row.status || '').trim() !== 'In Progress') return;
    if(isBenchRow(row)) return;
    const key = activeCapacityPersonKey(row);
    if(!key) return;
    const pct = rowAssignmentPct(row);
    consumedByPerson.set(key, (consumedByPerson.get(key) || 0) + Number(pct || 0));
  });
  return (rows || []).filter(row => {
    if(!isBenchRow(row) || String(row.status || '').trim() !== 'In Progress') return false;
    const key = activeCapacityPersonKey(row);
    const consumed = Math.min(100, Math.max(0, consumedByPerson.get(key) || 0));
    const expected = Math.round((100 - consumed) * 100) / 100;
    const jiraPct = firstRawPct(row.jira_bench_pct);
    row.bench_expected_pct = row.bench_expected_pct ?? expected;
    row.bench_consumed_pct = row.bench_consumed_pct ?? Math.round(consumed * 100) / 100;
    if(row.bench_pct_mismatch === true || row.bench_pct_mismatch === 'true') return true;
    if(jiraPct === null) return false;
    return Math.abs(jiraPct - expected) > 0.01;
  });
}
function buildClientDataQuality(){
  const rows = allAssignmentRows();
  const coverage = latest.account_coverage || [];
  const summarize = row => ({key:row.key||'', assignee:row.assignee||row.name||row.harvest_user||'', client:row.client||'', position:row.position||'', status:row.status||'', due:row.due||'', assignment_pct:rowAssignmentPct(row) ?? '', project_manager:row.project_manager||'', epic_status:row.epic_status||'', epic_key:row.epic_key||'', epic_due:row.epic_due||'', max_child_due:row.max_child_due||'', child_key:row.child_key||'', harvest_project:row.harvest_project||'', harvest_client:row.harvest_client||'', harvest_user:row.harvest_user||'', reason:row.reason||'', jira_bench_pct:row.jira_bench_pct ?? '', bench_expected_pct:row.bench_expected_pct ?? '', bench_consumed_pct:row.bench_consumed_pct ?? ''});
  const check = (id,label,severity,items,description)=>({id,label,severity,status:items.length?severity:'ok',count:items.length,description,rows:items.slice(0,75).map(summarize)});
  const checks = [
    check('missing_assignee','Missing assignee','error', rows.filter(row => !displayName(row) || /^Unassigned/.test(displayName(row))), 'Assignment rows should identify the person or be explicitly investigated.'),
    check('missing_epic_position','Position QA — missing Epic Position - Assignee','warning', missingEpicPositionRows(rows), 'Visible Position comes only from the AA parent Epic field "Position - Assignee"; child Assignment positions are audit-only.'),
    check('missing_due_date','Missing due date','warning', rows.filter(row => row.status === 'In Progress' && !isBenchRow(row) && !row.due), 'Due dates feed Forecast and the 60-day expiration list. Bench due dates are placeholders and are ignored.'),
    check('missing_project_manager','Missing Project Manager','warning', rows.filter(row => isExternalInProgress(row) && !row.project_manager), 'External client assignments should have a PM for escalation and Slack reminders.'),
    check('zero_assignment_pct','In-progress rows with 0% assignment','warning', rows.filter(row => row.status === 'In Progress' && row.client && !isBenchRow(row) && rowAssignmentPct(row) === 0), 'Assignment (%) should be populated for active capacity calculations.'),
    check('external_zero_billing','External assignments with Billing 0','warning', externalZeroBillingRows(rows), 'List people with Billing 0 while assigned to a real client. Bench and Azumo are excluded.'),
    check('account_coverage_gaps','Account Coverage gaps','warning', coverage.filter(row => row.complete === false || (row.missing || []).length), 'PSA account coverage should include PM, CSM, and TL where applicable.'),
    check('epic_due_before_child_due','Epic due date before child assignment due date','warning', buildEpicDueBeforeChildDueRows(rows), 'The Epic due date should be equal to or later than the furthest In Progress child Assignment due date.'),
    check('bench_residual_mismatch','Bench assignment percent does not match residual capacity','error', benchResidualMismatchRows(rows), 'Active Bench should equal 100% minus all active non-Bench assignments for the same person, including Azumo/internal work. Correct Jira if the Bench issue percent differs.')
  ];
  const snapshotChecks = latest.data_quality?.checks || [];
  const harvestChecks = snapshotChecks.filter(item => String(item.id || '').startsWith('harvest_'));
  if(harvestChecks.length && !checks.some(existing => existing.id === 'harvest_access_inconsistencies')){
    const count = harvestChecks.reduce((sum,item)=>sum + Number(item.count || 0), 0);
    const rows = harvestChecks.flatMap(item => (item.rows || []).map(row => ({
      ...row,
      reason: row.reason || item.label || 'Harvest / Jira mismatch',
      harvest_check: item.label || item.id || 'Harvest QA'
    })));
    checks.push({
      id:'harvest_access_inconsistencies',
      label:'Harvest/Jira access',
      severity:'warning',
      status:count ? 'warning' : 'ok',
      count,
      description:'Jira/Harvest access mismatch. ✓ present, × missing.',
      rows:rows.slice(0,75),
      grouped_checks:harvestChecks.map(item => ({id:item.id, label:item.label, count:item.count || 0}))
    });
  }
  snapshotChecks
    .filter(item => !String(item.id || '').startsWith('harvest_'))
    .forEach(item => {
      if(!checks.some(existing => existing.id === item.id)) checks.push(item);
    });
  const issueCount = checks.reduce((sum,item)=>sum+item.count,0);
  return {
    status:issueCount?'needs_review':'ok',
    issue_count:issueCount,
    checks,
    daily_review:[
      'Sync all sources.',
      'Check Position QA: AA Epic "Position - Assignee".',
      'Check Billing 0 outside Bench/Azumo.',
      'Check Bench residual = 100% minus active non-Bench work.',
      'Review overdue assignments.',
      'Review Account Coverage gaps.',
      'Review Harvest/Jira access mismatches.',
      'Confirm EazyBI reports are fresh.'
    ]
  };
}

function localDateIso(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function todayStartDate(){ return new Date(today.getFullYear(), today.getMonth(), today.getDate()); }
function actionTodayIso(){ return localDateIso(todayStartDate()); }
function daysUntil(dateStr){
  const parsed = parseLocalDate(dateStr);
  if(!parsed || Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed - todayStartDate()) / 86400000);
}
function loadLocalActionState(){
  try { return JSON.parse(localStorage.getItem(ACTION_STATE_KEY) || '{}') || {}; }
  catch(error){ return {}; }
}
function actionStateTime(value){
  const d = new Date(value?.updated_at || value?.reviewed_at || value?.created_at || 0);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function mergeActionStates(...states){
  const merged = {};
  states.filter(Boolean).forEach(state => {
    Object.entries(state || {}).forEach(([id, value]) => {
      if(!value) return;
      const existing = merged[id];
      if(!existing || actionStateTime(value) >= actionStateTime(existing)) merged[id] = value;
    });
  });
  return merged;
}
function loadActionState(){ return mergeActionStates(loadLocalActionState(), remoteActionState); }
function saveActionState(state){ localStorage.setItem(ACTION_STATE_KEY, JSON.stringify(state || {})); }
function getActionState(id){ return loadActionState()[id] || {}; }
function normalizeActionStateNote(note){
  const parsed = parseJsonSafe(note.body, {});
  const actionId = parsed.action_id || parsed.id || (Array.isArray(note.tags) ? note.tags.find(tag => String(tag).startsWith('action:'))?.slice(7) : '') || '';
  if(!actionId) return null;
  return {
    status: parsed.status || 'reviewed',
    date: parsed.date || String(note.created_at || '').slice(0,10) || actionTodayIso(),
    until: parsed.until || '',
    updated_at: parsed.updated_at || parsed.reviewed_at || note.created_at || new Date().toISOString(),
    reviewed_by: parsed.reviewed_by || parsed.user || '',
    note_id: note.id || '',
    jira_ticket: parsed.jira_ticket || undefined
  };
}
function actionStatesFromNotes(notes){
  const byAction = {};
  (notes || []).forEach(note => {
    const tags = Array.isArray(note.tags) ? note.tags : [];
    if(!tags.includes(ACTION_REVIEW_TAG)) return;
    const state = normalizeActionStateNote(note);
    const actionId = parseJsonSafe(note.body, {}).action_id || tags.find(tag => String(tag).startsWith('action:'))?.slice(7) || '';
    if(!actionId || !state) return;
    const existing = byAction[actionId];
    if(!existing || actionStateTime(state) >= actionStateTime(existing)) byAction[actionId] = state;
  });
  return byAction;
}
async function loadActionReviews(){
  if(actionReviewsLoaded) return remoteActionState;
  if(actionReviewsPromise) return actionReviewsPromise;
  actionReviewsPromise = (async()=>{
    if(location.protocol === 'file:' || !currentUser){
      remoteActionState = {};
      actionReviewsLoaded = true;
      return remoteActionState;
    }
    try{
      const response = await fetch('/api/notes', {cache:'no-store', credentials:'same-origin'});
      if(response.ok){
        const result = await response.json().catch(()=>({}));
        remoteActionState = actionStatesFromNotes(result.notes || []);
      }else{
        remoteActionState = {};
      }
    }catch(error){
      console.info('Remote action review state unavailable:', error.message);
      remoteActionState = {};
    }
    actionReviewsLoaded = true;
    return remoteActionState;
  })();
  return actionReviewsPromise;
}
async function persistActionState(id, patch){
  if(location.protocol === 'file:' || !currentUser) return;
  try{
    const payload = {
      type:'pmo_action_state',
      action_id:id,
      snapshot_date:latest?.date || '',
      reviewed_by:currentUser?.name || currentUser?.email || 'PMO',
      ...patch
    };
    const response = await fetch('/api/notes', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        title:`PMO action ${payload.status || 'review'}: ${id}`,
        body:JSON.stringify(payload),
        tags:[ACTION_REVIEW_TAG, `action:${id}`]
      })
    });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    actionReviewsLoaded = false;
    actionReviewsPromise = null;
  }catch(error){
    console.info('Action state saved locally only:', error.message);
  }
}
function isActionReviewed(action){
  const state = getActionState(action.id);
  return state.status === 'reviewed' && state.date === actionTodayIso();
}
function isActionSnoozed(action){
  const state = getActionState(action.id);
  return state.status === 'snoozed' && state.until && state.until > actionTodayIso();
}
function actionRuntimeState(action){
  if(isActionReviewed(action)) return 'reviewed';
  if(isActionSnoozed(action)) return 'snoozed';
  return 'open';
}
function saveActionPatch(id, patch){
  const state = loadActionState();
  state[id] = {...(state[id] || {}), ...patch, updated_at:patch.updated_at || new Date().toISOString()};
  saveActionState(state);
  return state[id];
}
function markActionReviewed(id){
  const patch = {status:'reviewed', date:actionTodayIso(), updated_at:new Date().toISOString()};
  saveActionPatch(id, patch);
  renderPmoActionCenter();
  persistActionState(id, patch);
}
function snoozeAction(id){
  const until = todayStartDate();
  until.setDate(until.getDate() + 1);
  const patch = {status:'snoozed', date:actionTodayIso(), until:localDateIso(until), updated_at:new Date().toISOString()};
  saveActionPatch(id, patch);
  renderPmoActionCenter();
  persistActionState(id, patch);
}
function reopenAction(id){
  const state = loadActionState();
  const ticket = state[id]?.jira_ticket;
  if(ticket){
    state[id] = {jira_ticket: ticket, status:'open', updated_at:new Date().toISOString()};
  }else{
    state[id] = {status:'open', updated_at:new Date().toISOString()};
  }
  saveActionState(state);
  renderPmoActionCenter();
  persistActionState(id, state[id]);
}
function severityRank(severity){ return {critical:0,error:0,warning:1,info:2,ok:3}[severity] ?? 2; }
function actionCategoryLabel(category){
  return ({urgent:'Due date', qa:'Data QA', harvest:'Harvest QA', billing:'Billing', coverage:'Coverage', freshness:'Freshness'}[category] || category || 'Action');
}
function normalizeActionSeverity(severity){ return severity === 'error' ? 'critical' : (severity || 'info'); }
function rowActionKey(row, fallback='row'){
  return row.key || row.epic_key || `${fallback}:${normalizeIdentity(row.assignee || row.name || '')}:${normalizeClientKey(row.client || '')}:${row.due || row.epic_due || ''}`;
}
function rowsByKey(rows){
  const map = new Map();
  (rows || []).filter(Boolean).forEach(row => {
    const key = rowActionKey(row);
    if(key && !map.has(key)) map.set(key, row);
  });
  return [...map.values()];
}
function dueRowsForActionCenter(){
  const due = new Map();
  (latest.expiring_60d || []).forEach(row => {
    if(!row || !row.due || isBenchRow(row)) return;
    const d = daysUntil(row.due);
    if(d !== null && d <= 0) due.set(rowActionKey(row, 'due'), row);
  });
  allAssignmentRows().forEach(row => {
    if(!row || row.status !== 'In Progress' || !row.due || isBenchRow(row)) return;
    const d = daysUntil(row.due);
    if(d !== null && d <= 0) due.set(rowActionKey(row, 'due'), row);
  });
  return [...due.values()].sort((a,b)=>String(a.due || '').localeCompare(String(b.due || '')) || String(a.client || '').localeCompare(String(b.client || '')));
}
function buildPmoActions(){
  if(!latest) return [];
  const actions = [];
  const add = action => actions.push({
    severity: normalizeActionSeverity(action.severity),
    category: action.category || 'qa',
    source: action.source || 'Dashboard QA',
    rows: action.rows || [],
    ...action
  });

  dueRowsForActionCenter().forEach(row => {
    const d = daysUntil(row.due);
    if(d === null) return;
    const overdue = d < 0;
    const dueToday = d === 0;
    add({
      id:`due:${rowActionKey(row, 'due')}`,
      severity: overdue ? 'critical' : 'warning',
      category:'urgent',
      title: overdue ? `Action needed: ${displayName(row)} ended ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago` : dueToday ? `Last day today: ${displayName(row)}` : `Due in ${d} day${d === 1 ? '' : 's'}: ${displayName(row)}`,
      description:`${row.client || 'No client'} · ${row.position || 'No position'} · ${row.sow || row.summary || 'No SOW summary'}`,
      key: row.key,
      due: row.due,
      assignee: displayName(row),
      client: row.client || '',
      position: row.position || '',
      project_manager: row.project_manager || '',
      action_url: row.key ? jiraIssueUrl(row.key) : '',
      source: row.source || 'Jira / EazyBI Next Due Dates',
      rows:[row]
    });
  });

  const dq = buildClientDataQuality();
  (dq.checks || []).filter(check => check.count > 0).forEach(check => {
    const category = check.id === 'external_zero_billing' ? 'billing'
      : check.id === 'account_coverage_gaps' ? 'coverage'
      : check.id === 'harvest_access_inconsistencies' ? 'harvest'
      : 'qa';
    const title = check.id === 'external_zero_billing' ? 'Billing 0 outside Bench/Azumo'
      : check.id === 'account_coverage_gaps' ? 'Account Coverage assignments missing'
      : check.id === 'harvest_access_inconsistencies' ? 'Harvest/Jira access'
      : check.label;
    add({
      id:`qa:${check.id}`,
      severity: check.severity,
      category,
      title,
      description: check.id === 'harvest_access_inconsistencies'
        ? `${check.count} mismatches. ✓ present · × missing. Full rows in QA Trace.`
        : `${check.count} row${check.count === 1 ? '' : 's'} to review.`,
      rows: check.rows || [],
      source:'Daily QA checks'
    });
  });

  const lastRefreshDate = String(PMO.last_refresh || PMO.last_refresh_at || '').slice(0,10);
  if(lastRefreshDate && lastRefreshDate !== actionTodayIso()){
    add({
      id:'freshness:last-refresh',
      severity:'warning',
      category:'freshness',
      title:'Dashboard data is not refreshed today',
      description:`Last refresh: ${PMO.last_refresh_at || PMO.last_refresh}. Sync sources.`,
      rows:[],
      source:'Dashboard metadata'
    });
  }

  return actions.sort((a,b)=> severityRank(a.severity) - severityRank(b.severity)
    || String(a.due || '').localeCompare(String(b.due || ''))
    || String(a.title || '').localeCompare(String(b.title || '')));
}
function visibleActionCounts(actions){
  const openActions = actions.filter(action => actionRuntimeState(action) === 'open');
  return {
    total: actions.length,
    open: openActions.length,
    urgent: openActions.filter(action => action.severity === 'critical').length,
    qa: openActions.filter(action => action.category === 'qa').length,
    harvest: openActions.filter(action => action.category === 'harvest').length,
    billing: openActions.filter(action => action.category === 'billing').length,
    coverage: openActions.filter(action => action.category === 'coverage').length,
    reviewed: actions.filter(isActionReviewed).length,
    snoozed: actions.filter(isActionSnoozed).length
  };
}
function setActionFilter(filter){ actionFilter = filter || 'open'; renderPmoActionCenter(); }
function filteredPmoActions(actions){
  return actions.filter(action => {
    const state = actionRuntimeState(action);
    if(actionFilter === 'reviewed') return state === 'reviewed';
    if(actionFilter === 'snoozed') return state === 'snoozed';
    if(actionFilter === 'all') return true;
    if(state !== 'open') return false;
    if(actionFilter === 'open') return true;
    if(actionFilter === 'urgent') return action.severity === 'critical';
    if(actionFilter === 'qa') return action.category === 'qa';
    if(actionFilter === 'harvest') return action.category === 'harvest';
    if(actionFilter === 'billing') return action.category === 'billing';
    if(actionFilter === 'coverage') return action.category === 'coverage';
    return true;
  });
}
function compactText(value, max=72){
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}
function compactCheckLabel(text){
  const raw = String(text || '').trim();
  const value = raw.toLowerCase();
  if(value.includes('missing matching harvest') || value.includes('missing project access')) return 'Missing in Harvest';
  if(value.includes('extra active harvest') || value.includes('extra project access')) return 'Extra in Harvest';
  if(value.includes('no matching active jira') || value.includes('without matching active jira')) return 'No active Jira assignment';
  if(value.includes('billing 0')) return 'Billing 0';
  if(value.includes('account coverage')) return 'Coverage gap';
  if(value.includes('bench assignment percent')) return 'Bench % mismatch';
  if(value.includes('epic due date')) return 'Due date mismatch';
  return raw || 'Review';
}
function harvestRowsBySignature(rows){
  const map = new Map();
  (rows || []).filter(Boolean).forEach(row => {
    const key = [
      row.reason || row.harvest_check || '',
      row.key || row.epic_key || '',
      row.assignee || row.name || row.harvest_user || '',
      row.client || '',
      row.harvest_client || '',
      row.harvest_project || '',
      row.project_manager || ''
    ].map(value => normalizeClientKey(value)).join('|');
    if(key && !map.has(key)) map.set(key, row);
  });
  return [...map.values()];
}
function harvestPresenceForRow(row){
  const reason = String(row.reason || row.harvest_check || '').toLowerCase();
  if(reason.includes('missing matching harvest') || reason.includes('missing project access')) return {jira:true, harvest:false};
  if(reason.includes('extra active harvest') || reason.includes('extra project access')) return {jira:false, harvest:true};
  if(reason.includes('no matching active jira') || reason.includes('without matching active jira')) return {jira:false, harvest:true};
  return {
    jira:Boolean(row.key || row.epic_key || row.client || row.due || row.epic_due),
    harvest:Boolean(row.harvest_project || row.harvest_client || row.harvest_user || String(row.status || '').toLowerCase().includes('harvest'))
  };
}
function presenceBadge(ok, label){
  return `<span class="presence-pill ${ok ? 'ok' : 'miss'}" title="${esc(label || (ok ? 'Present' : 'Missing'))}">${ok ? '✓' : '×'}</span>`;
}
function harvestPresenceTable(rows){
  const deduped = harvestRowsBySignature(rows);
  const list = deduped.slice(0,10);
  if(!list.length) return '';
  const missingHarvest = deduped.filter(row => !harvestPresenceForRow(row).harvest).length;
  const missingJira = deduped.filter(row => !harvestPresenceForRow(row).jira).length;
  const legend = `<div class="presence-legend"><span><b>✓</b> present</span><span><b>×</b> missing</span><span>${missingHarvest} missing in Harvest</span><span>${missingJira} extra in Harvest</span></div>`;
  const body = list.map(row => {
    const status = harvestPresenceForRow(row);
    const person = row.assignee || row.name || row.harvest_user || '—';
    const position = row.position ? `<div class="presence-detail">${esc(compactText(row.position, 42))}</div>` : '';
    const client = row.client || row.harvest_client || '—';
    const project = row.harvest_project ? `<div class="presence-detail">${esc(compactText(row.harvest_project, 58))}</div>` : '';
    const jiraDetail = row.key ? `<div class="presence-detail">${sowLink(row, row.key)}</div>` : '';
    const harvestDetail = row.harvest_client ? `<div class="presence-detail">${esc(compactText(row.harvest_client, 34))}</div>` : '';
    return `<tr>
      <td>${esc(compactText(person, 34))}${position}</td>
      <td>${esc(compactText(client, 42))}${project}</td>
      <td class="presence-cell">${presenceBadge(status.jira, status.jira ? 'In Jira' : 'Missing in Jira')}${jiraDetail}</td>
      <td class="presence-cell">${presenceBadge(status.harvest, status.harvest ? 'In Harvest' : 'Missing in Harvest')}${harvestDetail}</td>
      <td>${esc(compactText(row.project_manager || '—', 30))}</td>
    </tr>`;
  }).join('');
  return `<div class="action-mini-table harvest-presence-table">${legend}<table><thead><tr><th>Person</th><th>Client / Project</th><th class="presence-cell">Jira</th><th class="presence-cell">Harvest</th><th>PM</th></tr></thead><tbody>${body}</tbody></table>${deduped.length > list.length ? `<div class="audit-note" style="border-bottom:0;padding:.55rem .75rem">+${deduped.length - list.length} more in QA Trace.</div>` : ''}</div>`;
}
function actionRowsTable(rows, action={}){
  const isHarvest = action.category === 'harvest' || (rows || []).some(row => row && (row.harvest_check || row.harvest_project || row.harvest_client || String(row.reason || '').toLowerCase().includes('harvest')));
  if(isHarvest) return harvestPresenceTable(rows);
  const deduped = rowsByKey(rows);
  const list = deduped.slice(0,8);
  if(!list.length) return '';
  return `<div class="action-mini-table"><table><thead><tr><th>Key</th><th>Person</th><th>Client</th><th>Position</th><th>Due</th><th>PM</th></tr></thead><tbody>${list.map(row => `<tr><td>${row.key ? sowLink(row,row.key) : '—'}</td><td>${esc(row.assignee || row.name || row.harvest_user || '—')}</td><td>${esc(row.client || row.harvest_client || '—')}</td><td>${esc(row.position || '—')}</td><td>${esc(fmtDate(row.due || row.epic_due || ''))}</td><td>${esc(row.project_manager || '—')}</td></tr>`).join('')}</tbody></table>${deduped.length > list.length ? `<div class="audit-note" style="border-bottom:0;padding:.55rem .75rem">+${deduped.length - list.length} more in QA Trace.</div>` : ''}</div>`;
}

function actionJiraTicket(action){
  const state = getActionState(action.id);
  return state.jira_ticket && state.jira_ticket.key ? state.jira_ticket : null;
}
function saveActionJiraTicket(id, ticket){
  const state = loadActionState();
  state[id] = {
    ...(state[id] || {}),
    jira_ticket:{
      key: ticket.key,
      id: ticket.id || '',
      url: ticket.url || jiraIssueUrl(ticket.key),
      created_at: ticket.created_at || new Date().toISOString()
    },
    updated_at:new Date().toISOString()
  };
  saveActionState(state);
}
function actionPayloadForJira(action){
  return {
    id: action.id,
    title: action.title || 'PMO dashboard action',
    description: action.description || '',
    category: action.category || 'qa',
    severity: action.severity || 'warning',
    due: action.due || '',
    client: action.client || '',
    assignee: action.assignee || '',
    project_manager: action.project_manager || '',
    key: action.key || '',
    source: action.source || 'PMO Dashboard',
    dashboard_url: 'https://pmoboard.vercel.app',
    pmo_board_url: PMO_JIRA_BOARD_URL,
    snapshot_date: latest?.date || '',
    last_refresh: PMO.last_refresh_at || PMO.last_refresh || '',
    rows: rowsByKey(action.rows || []).slice(0,20)
  };
}
function jiraTicketControl(action){
  const ticket = actionJiraTicket(action);
  if(ticket){
    const url = ticket.url || jiraIssueUrl(ticket.key);
    return `<a class="jira-ticket-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(ticket.key)}</a>`;
  }
  return `<button class="btn btn-ghost btn-sm jira-ticket-btn" data-jira-ticket-action="${esc(action.id)}" onclick="createActionJiraTicket(${jsArg(action.id)})">Create PMO Jira task</button>`;
}
async function createActionJiraTicket(id){
  if(location.protocol === 'file:'){
    alert('Jira ticket creation needs the deployed dashboard/API. Open https://pmoboard.vercel.app first.');
    return;
  }
  if(!currentUser){
    showAuthModal('login', `jiraTicket:${id}`);
    return;
  }
  const action = buildPmoActions().find(item => item.id === id);
  if(!action) return;
  const btn = document.querySelector(`[data-jira-ticket-action="${CSS.escape(id)}"]`);
  const original = btn?.textContent || 'Create PMO Jira task';
  if(btn){ btn.disabled = true; btn.textContent = 'Creating...'; }
  try{
    const response = await fetch('/api/notes', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'jira_action_ticket', action:actionPayloadForJira(action)})
    });
    const result = await response.json().catch(()=>({}));
    if(response.status === 401){
      currentUser = null;
      updateAuthUi();
      showAuthModal('login', `jiraTicket:${id}`);
      throw new Error('Please sign in again.');
    }
    if(!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    saveActionJiraTicket(id, result.ticket || result.issue || result);
    renderPmoActionCenter();
  }catch(error){
    alert(`Could not create Jira task: ${error.message}`);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = original; }
  }
}

function renderActionItem(action){
  const state = actionRuntimeState(action);
  const severity = action.severity || 'info';
  const statePill = state === 'reviewed' ? '<span class="action-pill reviewed">Reviewed</span>'
    : state === 'snoozed' ? '<span class="action-pill snoozed">Snoozed</span>'
    : `<span class="action-pill ${severity}">${severity === 'critical' ? 'Urgent' : severity === 'warning' ? 'Review' : severity}</span>`;
  const meta = [
    `<span class="action-pill">${esc(actionCategoryLabel(action.category))}</span>`,
    statePill,
    action.due ? `<span class="action-pill">Due ${esc(fmtDate(action.due))}</span>` : '',
    action.client ? `<span class="action-pill">Client: ${esc(action.client)}</span>` : '',
    action.assignee ? `<span class="action-pill">Assignee: ${esc(action.assignee)}</span>` : '',
    action.project_manager ? `<span class="action-pill">PM: ${esc(action.project_manager)}</span>` : ''
  ].filter(Boolean).join('');
  const actionId = jsArg(action.id);
  const stateButtons = state === 'open'
    ? `<button class="btn btn-ghost btn-sm" onclick="markActionReviewed(${actionId})">Mark reviewed</button><button class="btn btn-ghost btn-sm" onclick="snoozeAction(${actionId})">Snooze 1 day</button>`
    : `<button class="btn btn-ghost btn-sm" onclick="reopenAction(${actionId})">Reopen</button>`;
  const urgentButton = action.category === 'urgent' && action.severity === 'critical' ? `<button class="btn btn-primary btn-sm" onclick="openDueAssignmentsSlackDraft()">Slack #assignments-hub</button>` : '';
  const jiraButton = action.action_url ? `<a class="btn btn-ghost btn-sm" href="${action.action_url}" target="_blank" rel="noopener noreferrer">Open source Jira</a>` : '';
  const pmoTicketButton = jiraTicketControl(action);
  return `<div class="action-item ${severity} ${state}">
    <div class="action-top">
      <div>
        <div class="action-title">${esc(action.title || 'PMO action')}</div>
        <div class="action-desc">${esc(action.description || '')}</div>
      </div>
    </div>
    <div class="action-meta">${meta}</div>
    ${actionRowsTable(action.rows || [], action)}
    <div class="action-actions">${jiraButton}${pmoTicketButton}${urgentButton}${stateButtons}</div>
  </div>`;
}
function renderPmoActionCenter(){
  if(!latest) return;
  if(!actionReviewsLoaded && !actionReviewsPromise && currentUser){
    loadActionReviews().then(()=>renderPmoActionCenter()).catch(()=>{});
  }
  const actions = buildPmoActions();
  const counts = visibleActionCounts(actions);
  const tag = document.getElementById('actionCenterTag');
  if(tag) tag.textContent = `${counts.open} open · ${counts.urgent} urgent`;
  const badge = document.getElementById('actionNavBadge');
  if(badge){
    badge.textContent = counts.open > 99 ? '99+' : String(counts.open);
    badge.style.display = counts.open ? 'inline-flex' : 'none';
    badge.classList.toggle('critical', counts.urgent > 0);
  }
  const summary = document.getElementById('actionSummaryCards');
  if(summary){
    summary.innerHTML = [
      `<div class="action-card ${counts.open ? 'warning' : 'ok'}"><div class="action-label">Open</div><div class="action-value">${counts.open}</div><div class="action-copy">Needs review</div></div>`,
      `<div class="action-card ${counts.urgent ? 'critical' : 'ok'}"><div class="action-label">Urgent</div><div class="action-value">${counts.urgent}</div><div class="action-copy">Past last day</div></div>`,
      `<div class="action-card ${counts.qa ? 'warning' : 'ok'}"><div class="action-label">Data QA</div><div class="action-value">${counts.qa}</div><div class="action-copy">Checks</div></div>`,
      `<div class="action-card ${counts.harvest ? 'warning' : 'ok'}"><div class="action-label">Harvest</div><div class="action-value">${counts.harvest}</div><div class="action-copy">Access mismatches</div></div>`,
      `<div class="action-card ${(counts.billing + counts.coverage) ? 'warning' : 'ok'}"><div class="action-label">Billing + Coverage</div><div class="action-value">${counts.billing + counts.coverage}</div><div class="action-copy">Gaps</div></div>`
    ].join('');
  }
  const daily = document.getElementById('actionDailyTasks');
  if(daily){
    const dq = buildClientDataQuality();
    daily.innerHTML = (dq.daily_review || []).map(item => `<li>${esc(item)}</li>`).join('');
  }
  const tabs = document.getElementById('actionFilterTabs');
  if(tabs){
    const tabDefs = [
      ['open','Open',counts.open], ['urgent','Urgent',counts.urgent], ['qa','Data QA',counts.qa], ['harvest','Harvest',counts.harvest],
      ['billing','Billing',counts.billing], ['coverage','Coverage',counts.coverage], ['reviewed','Reviewed',counts.reviewed], ['snoozed','Snoozed',counts.snoozed], ['all','All',counts.total]
    ];
    tabs.innerHTML = tabDefs.map(([id,label,count]) => `<button class="action-filter ${actionFilter === id ? 'active' : ''}" onclick="setActionFilter('${id}')">${label} · ${count}</button>`).join('');
  }
  const list = document.getElementById('actionList');
  if(list){
    const visible = filteredPmoActions(actions);
    list.innerHTML = visible.length
      ? visible.map(renderActionItem).join('')
      : `<div class="action-empty">No actions in this filter.</div>`;
  }
}
function actionCenterSummaryText(){
  const actions = buildPmoActions();
  const counts = visibleActionCounts(actions);
  const open = actions.filter(action => actionRuntimeState(action) === 'open').slice(0,20);
  const lines = open.map(action => `• [${actionCategoryLabel(action.category)}] ${action.title}${action.due ? ` — due ${fmtDate(action.due)}` : ''}${action.project_manager ? ` — PM: ${action.project_manager}` : ''}`);
  return `PMO Action Center — ${latest?.date || actionTodayIso()}\nLast refresh: ${PMO.last_refresh_at || PMO.last_refresh || '—'}\nOpen actions: ${counts.open}\nUrgent: ${counts.urgent}\nData QA: ${counts.qa}\nHarvest QA: ${counts.harvest}\nBilling/Coverage: ${counts.billing + counts.coverage}\n\n${lines.join('\n') || 'No open actions.'}\n\nDashboard: https://pmoboard.vercel.app`;
}
async function copyActionCenterSummary(){
  const text = actionCenterSummaryText();
  try{ await navigator.clipboard.writeText(text); alert('PMO action summary copied.'); }
  catch(error){ prompt('Copy PMO action summary:', text); }
}
async function copySingleAction(id){
  const action = buildPmoActions().find(item => item.id === id);
  if(!action) return;
  const text = `[${actionCategoryLabel(action.category)}] ${action.title}\n${action.description || ''}\n${action.due ? `Due: ${fmtDate(action.due)}\n` : ''}${action.project_manager ? `PM: ${action.project_manager}\n` : ''}${action.action_url || 'https://pmoboard.vercel.app'}`;
  try{ await navigator.clipboard.writeText(text); alert('Action copied.'); }
  catch(error){ prompt('Copy action:', text); }
}
window.setActionFilter = setActionFilter;
window.markActionReviewed = markActionReviewed;
window.snoozeAction = snoozeAction;
window.reopenAction = reopenAction;
window.copyActionCenterSummary = copyActionCenterSummary;
window.copySingleAction = copySingleAction;
window.createActionJiraTicket = createActionJiraTicket;


const QA_CHECKLIST_TAG = 'qa-checklist-review';
const QA_REVIEW_CHECKLIST = [
  {id:'sync_sources', label:'Sync Jira + EazyBI + Harvest', cadenceDays:1, owner:'PMO', description:'Confirm all sources were synced before reviewing staffing and billing numbers.'},
  {id:'due_assignments', label:'Due assignments and PMO Jira tasks', cadenceDays:1, owner:'PMO', description:'Review today/overdue assignments, create PMO Jira tasks, and send Slack follow-up when needed.'},
  {id:'harvest_jira_access', label:'Harvest vs Jira access QA', cadenceDays:2, owner:'PMO', description:'Check grouped Harvest inconsistencies: missing access, extra access for non-PMs, and unmatched active users.'},
  {id:'account_coverage', label:'Account Coverage completeness', cadenceDays:3, owner:'PMO', description:'Review missing PM, CSM, or TL ownership in Accounts Coverage and follow up.'},
  {id:'position_bench_qa', label:'Position + Bench residual QA', cadenceDays:3, owner:'PMO', description:'Confirm positions come from AA Epic and active Bench equals residual capacity.'},
  {id:'eazybi_kpis', label:'EazyBI KPI source freshness', cadenceDays:7, owner:'PMO', description:'Confirm Utilization Billing Rate and Bench by Month are current and match EazyBI.'},
  {id:'monthly_reporting', label:'Monthly report repository review', cadenceDays:30, owner:'PMO', description:'Review historical snapshots, monthly reporting repository, and MoM narrative readiness.'}
];
function qaChecklistStorageKey(){ return 'pmo_qa_checklist_reviews_v1'; }
function parseJsonSafe(value, fallback={}){ try{return JSON.parse(value || '');}catch(error){return fallback;} }
function qaIsoDateTime(value){
  if(!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatReviewDate(value){
  const d = qaIsoDateTime(value);
  return d ? d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}) : 'Never';
}
function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate() + Number(days || 0)); return d; }
function qaChecklistStatus(item, review){
  const last = qaIsoDateTime(review?.reviewed_at || review?.created_at);
  if(!last) return {state:'never', label:'Needs first review', last:null, next:null, daysUntil:null};
  const next = addDays(last, item.cadenceDays);
  const todayDate = todayStartDate();
  const due = next <= todayDate;
  const diff = Math.ceil((next - todayDate) / 86400000);
  return {
    state: due ? 'due' : 'ok',
    label: due ? 'Due now' : `Renews in ${Math.max(0, diff)} day${Math.max(0, diff) === 1 ? '' : 's'}`,
    last,
    next,
    daysUntil: diff
  };
}
function normalizeChecklistReview(note){
  const parsed = parseJsonSafe(note.body, {});
  const itemId = parsed.item_id || parsed.id || (Array.isArray(note.tags) ? note.tags.find(tag => String(tag).startsWith('item:'))?.slice(5) : '') || '';
  if(!itemId) return null;
  return {
    item_id:itemId,
    reviewed_at: parsed.reviewed_at || note.created_at || '',
    reviewed_by: parsed.reviewed_by || parsed.user || '',
    snapshot_date: parsed.snapshot_date || '',
    cadence_days: parsed.cadence_days || '',
    note_id: note.id || ''
  };
}
function reviewsFromNotes(notes){
  const byItem = {};
  (notes || []).forEach(note => {
    const tags = Array.isArray(note.tags) ? note.tags : [];
    if(!tags.includes(QA_CHECKLIST_TAG)) return;
    const review = normalizeChecklistReview(note);
    if(!review?.item_id) return;
    const previous = byItem[review.item_id];
    const prevDate = qaIsoDateTime(previous?.reviewed_at);
    const nextDate = qaIsoDateTime(review.reviewed_at);
    if(!previous || (nextDate && (!prevDate || nextDate > prevDate))) byItem[review.item_id] = review;
  });
  return byItem;
}
function loadLocalChecklistReviews(){ return parseJsonSafe(localStorage.getItem(qaChecklistStorageKey()), {}); }
function saveLocalChecklistReview(review){
  const current = loadLocalChecklistReviews();
  current[review.item_id] = review;
  localStorage.setItem(qaChecklistStorageKey(), JSON.stringify(current));
  return current;
}
function mergeChecklistReviews(...sources){
  const merged = {};
  sources.filter(Boolean).forEach(source => {
    Object.entries(source || {}).forEach(([id, review]) => {
      if(!review) return;
      const current = merged[id];
      const currentDate = qaIsoDateTime(current?.reviewed_at || current?.created_at);
      const nextDate = qaIsoDateTime(review.reviewed_at || review.created_at);
      if(!current || (nextDate && (!currentDate || nextDate >= currentDate))) merged[id] = review;
    });
  });
  return merged;
}
async function loadQaChecklistReviews(){
  if(qaChecklistReviewsLoaded) return qaChecklistReviews;
  if(qaChecklistReviewsPromise) return qaChecklistReviewsPromise;
  qaChecklistReviewsPromise = (async()=>{
    const localReviews = loadLocalChecklistReviews();
    if(location.protocol === 'file:'){
      qaChecklistReviews = localReviews;
      qaChecklistReviewsLoaded = true;
      return qaChecklistReviews;
    }
    try{
      const response = await fetch('/api/notes', {cache:'no-store', credentials:'same-origin'});
      if(response.status === 401 || response.status === 403){
        qaChecklistReviews = localReviews;
      }else if(response.ok){
        const result = await response.json().catch(()=>({}));
        qaChecklistReviews = mergeChecklistReviews(localReviews, reviewsFromNotes(result.notes || []));
      }else{
        qaChecklistReviews = localReviews;
      }
    }catch(error){
      console.info('QA checklist reviews unavailable:', error.message);
      qaChecklistReviews = localReviews;
    }
    qaChecklistReviewsLoaded = true;
    return qaChecklistReviews;
  })();
  return qaChecklistReviewsPromise;
}
function renderQaChecklist(){
  const summary = document.getElementById('qaChecklistSummary');
  const list = document.getElementById('qaChecklistList');
  if(!summary || !list) return;
  const statuses = QA_REVIEW_CHECKLIST.map(item => ({item, review:qaChecklistReviews[item.id], status:qaChecklistStatus(item, qaChecklistReviews[item.id])}));
  const dueCount = statuses.filter(row => row.status.state !== 'ok').length;
  summary.textContent = `${dueCount} due · ${QA_REVIEW_CHECKLIST.length} controls`;
  list.innerHTML = statuses.map(({item, review, status}) => {
    const last = review?.reviewed_at || '';
    const by = review?.reviewed_by ? ` · ${review.reviewed_by}` : '';
    const next = status.next ? status.next.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'After first review';
    return `<div class="qa-checklist-item ${status.state}">
      <div>
        <div class="qa-checklist-title">${esc(item.label)}</div>
        <div class="qa-checklist-copy">${esc(item.description)}</div>
      </div>
      <div class="qa-checklist-meta">
        <span class="qa-checklist-pill ${status.state}">${esc(status.label)}</span>
        <span class="qa-checklist-pill">Every ${item.cadenceDays} day${item.cadenceDays === 1 ? '' : 's'}</span>
        <span class="qa-checklist-pill">Next: ${esc(next)}</span>
      </div>
      <div class="qa-review-date">Last review:<br/><strong>${esc(formatReviewDate(last))}</strong>${esc(by)}</div>
      <div class="qa-checklist-actions"><button class="btn btn-ghost btn-sm" data-qa-review="${esc(item.id)}" onclick="markQaChecklistReviewed(${jsArg(item.id)})">${status.state === 'ok' ? 'Reviewed' : 'Mark reviewed'}</button></div>
    </div>`;
  }).join('');
}
function refreshQaChecklist(){
  renderQaChecklist();
  loadQaChecklistReviews().then(() => renderQaChecklist());
}
function qaReviewButton(id){
  return [...document.querySelectorAll('[data-qa-review]')].find(button => button.dataset.qaReview === id) || null;
}
async function markQaChecklistReviewed(id){
  if(!canSeeDataTraceability()){
    showAuthModal('login', `qaReview:${id}`);
    return;
  }
  const item = QA_REVIEW_CHECKLIST.find(entry => entry.id === id);
  if(!item) return;
  const reviewedAt = new Date().toISOString();
  const review = {
    type:'qa_checklist_review',
    item_id:item.id,
    item_label:item.label,
    cadence_days:item.cadenceDays,
    snapshot_date:latest?.date || '',
    reviewed_at:reviewedAt,
    reviewed_by:currentUser?.name || currentUser?.email || 'PMO'
  };
  const btn = qaReviewButton(id);
  const original = btn?.textContent || 'Mark reviewed';
  if(btn){ btn.disabled = true; btn.textContent = 'Saving...'; }

  // Make the UI respond immediately; server persistence follows below.
  qaChecklistReviews[item.id] = review;
  saveLocalChecklistReview(review);
  renderQaChecklist();

  try{
    if(location.protocol !== 'file:'){
      const response = await fetch('/api/notes', {
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          title:`QA checklist review: ${item.label}`,
          body:JSON.stringify(review),
          tags:[QA_CHECKLIST_TAG, `item:${item.id}`]
        })
      });
      const result = await response.json().catch(()=>({}));
      if(response.status === 401 || response.status === 403){
        currentUser = null;
        updateAuthUi();
        showAuthModal('login', `qaReview:${id}`);
        throw new Error('Please sign in again. The review was saved locally for this browser.');
      }
      if(!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      qaChecklistReviewsLoaded = false;
      qaChecklistReviewsPromise = null;
      await loadQaChecklistReviews();
      renderQaChecklist();
    }
  }catch(error){
    console.warn('QA checklist review saved locally but not persisted remotely:', error.message);
  }finally{
    const latestBtn = qaReviewButton(id);
    if(latestBtn){ latestBtn.disabled = false; latestBtn.textContent = original; }
  }
}

function currentTracePayload(){
  const util = normalizeUtilBillingReport(latest.utilization_billing_rate || {});
  return {
    generated_at: new Date().toISOString(),
    user: currentUser ? {email:currentUser.email, role:currentUser.role, name:currentUser.name} : null,
    last_refresh: PMO.last_refresh,
    last_refresh_at: PMO.last_refresh_at,
    snapshot_date: latest.date,
    metrics: latest.metrics,
    utilization_billing_rate: util,
    bench_by_month: latest.bench_by_month || {},
    data_quality: buildClientDataQuality(),
    data_lineage: latest.data_lineage || {},
    sample_assignment_rows: (latest.assignment_rows || []).slice(0, 250)
  };
}
function renderDataTraceability(){
  const gate = document.getElementById('qaAdminGate');
  const content = document.getElementById('qaTraceContent');
  if(!gate || !content || !latest) return;
  const allowed = canSeeDataTraceability();
  content.style.display = allowed ? '' : 'none';
  gate.innerHTML = allowed ? '' : `<div class="locked-note">🔒 Sign in as an <strong>admin</strong> or <strong>PMO</strong> user to open raw KPI tables, QA checks, and trace JSON. This keeps daily audit tools separate from normal dashboard viewing.</div>`;
  if(!allowed) return;
  const payload = currentTracePayload();
  const dq = payload.data_quality || buildClientDataQuality();
  const checks = dq.checks || [];
  const openChecks = checks.filter(check => check.count > 0);
  const summary = document.getElementById('qaSummaryCards');
  if(summary){
    summary.innerHTML = [
      `<div class="qa-card ${dq.issue_count ? 'warning' : 'ok'}"><div class="qa-label">Issues</div><div class="qa-value">${dq.issue_count || 0}</div><div class="qa-copy">Open rows</div></div>`,
      `<div class="qa-card ${openChecks.length ? 'warning' : 'ok'}"><div class="qa-label">Open checks</div><div class="qa-value">${openChecks.length}</div><div class="qa-copy">Alerts</div></div>`,
      `<div class="qa-card"><div class="qa-label">Last refresh</div><div class="qa-value" style="font-size:1rem">${esc(PMO.last_refresh || latest.date || '—')}</div><div class="qa-copy">${esc(PMO.last_refresh_at || '')}</div></div>`
    ].join('');
  }
  refreshQaChecklist();
  const tasks = document.getElementById('dailyTasksList');
  if(tasks){
    const daily = (dq.daily_review && dq.daily_review.length ? dq.daily_review : buildClientDataQuality().daily_review) || [];
    tasks.innerHTML = daily.map(item => `<li>${esc(item)}</li>`).join('');
  }
  const list = document.getElementById('qaChecksList');
  if(list){
    list.innerHTML = checks.map(check => {
      const rows = check.rows || [];
      const rowTable = rows.length ? `<div class="fc-table-wrap" style="max-height:240px;margin-top:.7rem"><table><thead><tr><th>Key</th><th>Assignee</th><th>Client</th><th>Position</th><th>Due / Epic due</th><th>Max child due</th><th>Harvest project</th><th>PM</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.key ? sowLink(row,row.key) : '—'}</td><td>${esc(row.assignee || row.harvest_user || '—')}</td><td>${esc(row.client || row.harvest_client || '—')}</td><td>${esc(row.position || '—')}</td><td>${esc(row.epic_due || row.due || '—')}</td><td>${row.child_key ? `${sowLink({key:row.child_key}, row.max_child_due || row.child_key)}` : esc(row.max_child_due || '—')}</td><td>${esc(row.harvest_project || '—')}</td><td>${esc(row.project_manager || '—')}</td></tr>`).join('')}</tbody></table></div>` : '';
      return `<details class="qa-check" ${check.count ? 'open' : ''}>
        <summary><span>${esc(check.label)}</span><span class="qa-status ${check.status}">${esc(check.status)} · ${check.count}</span></summary>
        <div class="qa-check-body">${esc(check.description || '')}${rowTable}</div>
      </details>`;
    }).join('');
  }
  const lineage = document.getElementById('lineageList');
  if(lineage){
    const sources = payload.data_lineage?.sources || [
      {name:'Jira AA Assignments', rule:'Assignment rows, bench, and forecast come from Jira AA.'},
      {name:'EazyBI KPIs', rule:'Utilization, billing, and headcount metrics come from EazyBI.'}
    ];
    lineage.innerHTML = sources.map(source => `<div class="lineage-item"><b>${esc(source.name)}</b><div>${esc(source.rule || '')}</div><div style="margin-top:.25rem">Feeds: ${esc((source.feeds || []).join(', ') || '—')}</div></div>`).join('');
  }
}
function dailyQaSummaryText(){
  const payload = currentTracePayload();
  const checks = payload.data_quality?.checks || [];
  const open = checks.filter(check => check.count > 0);
  const lines = open.map(check => `• ${check.label}: ${check.count}`);
  return `PMO Daily QA — ${payload.snapshot_date}\nLast refresh: ${payload.last_refresh_at || payload.last_refresh}\nIssues detected: ${payload.data_quality?.issue_count || 0}\n${lines.join('\n') || 'No open QA checks.'}\n\nUtilization Billing Rate source: ${payload.utilization_billing_rate?.source || 'EazyBI'}\nProcedure: ${payload.utilization_billing_rate?.formula?.calculation || 'EazyBI KPI'}\nDashboard: https://pmoboard.vercel.app`;
}
async function copyDailyQaSummary(){
  if(!canSeeDataTraceability()){ showAuthModal('login'); return; }
  const text = dailyQaSummaryText();
  try{ await navigator.clipboard.writeText(text); alert('QA summary copied.'); }
  catch(error){ prompt('Copy QA summary:', text); }
}
function downloadTraceJson(){
  if(!canSeeDataTraceability()){ showAuthModal('login'); return; }
  const payload = currentTracePayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pmo-trace-${payload.snapshot_date || 'snapshot'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
window.copyDailyQaSummary = copyDailyQaSummary;
window.downloadTraceJson = downloadTraceJson;
window.markQaChecklistReviewed = markQaChecklistReviewed;
function displayName(p){ return p.name || p.assignee || (p.key ? `Unassigned (${p.key})` : 'Unassigned'); }
function displayStatus(p){ return p.epic_status || p.project_status || p.aa_project_status || p.resource_status || ''; }
function statusChip(status){
  if(!status) return '<span style="color:var(--muted)">—</span>';
  const normalized = String(status).toLowerCase();
  const cls = normalized.includes('hire') ? 'badge-blue' : normalized.includes('active') ? 'badge-green' : 'badge-yellow';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}
function normalizeIdentity(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim()
    .toLowerCase()
    .replace(/\s+/g,' ');
}
function normalizeClientKey(value){
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]/g,'');
}
function jsArg(value){
  return JSON.stringify(String(value ?? '')).replace(/</g,'\\u003c');
}
const SLACK_USER_BY_NAME = {
  [normalizeIdentity('Antonella Grasso')]: 'U025NH9QE1E',
  [normalizeIdentity('Cesar Ramirez')]: 'U0B508RSP9U',
  [normalizeIdentity('Desiree Pepermans')]: 'UEGMYGJ4T',
  [normalizeIdentity('Eliana Naveira')]: 'U08FXJ05JQ4',
  [normalizeIdentity('German Isaurralde')]: 'U03F6NWJ2NT',
  [normalizeIdentity('Graciela Kremer')]: 'U03DRA8BGQK',
  [normalizeIdentity('Jennifer Greyling')]: 'U09JZ926A72',
  [normalizeIdentity('Leandro Lacave')]: 'U042S3UQQG6',
  [normalizeIdentity('Mauricio Besse')]: 'U09QEEU70HG',
  [normalizeIdentity('Micaela Goicoechea')]: 'U09GZSP04HH',
  [normalizeIdentity('Roberta Ferreira')]: 'U09MS2DV155',
  [normalizeIdentity('Roberta Ferreira de Moura')]: 'U09MS2DV155'
};

function renderBench(){
  const bench = (latest.bench_list || []).slice().sort((a,b)=>{
    const av = rowAvailability(a);
    const bv = rowAvailability(b);
    if(av === null && bv === null) return displayName(a).localeCompare(displayName(b));
    if(av === null) return 1;
    if(bv === null) return -1;
    return bv - av || displayName(a).localeCompare(displayName(b));
  });
  document.getElementById('benchBadge').textContent = bench.length;
  document.getElementById('benchTag').textContent = latest.label;
  const benchSource = latest.bench_source || 'Jira Bench In Progress assignments';
  const benchSourceTag = document.getElementById('benchSourceTag');
  if(benchSourceTag) benchSourceTag.textContent = benchSource;
  document.getElementById('benchTbody').innerHTML = bench.map(p=>{
    const avail = rowAvailability(p);
    const tech = [p.technology, p.frameworks].filter(Boolean).join(' · ');
    return `<tr>
      <td style="font-weight:600;white-space:nowrap">${esc(displayName(p))}</td>
      <td>${posChip(p.position)}</td>
      <td><span class="${avail===null?'':availCls(avail)}">${fmtRawPct(avail)}</span></td>
      <td>${statusChip(displayStatus(p))}</td>
      <td style="color:var(--muted);font-size:.78rem">${esc(p.potential_next_assignment || '—')}</td>
      <td style="color:var(--muted);font-size:.78rem">${esc(tech || '—')}</td>
      <td style="color:var(--muted);font-size:.78rem;white-space:nowrap"></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:1rem;color:var(--muted)">No bench data</td></tr>';
}

function renderPending(){
  const pend = latest.pending_list || [];
  const badge = document.getElementById('pendingBadge');
  if(badge) badge.textContent = pend.length;
  const tag = document.getElementById('pendingTag');
  if(tag) tag.textContent = pend.length ? `${pend.length} pending` : 'No pending assignments';
  const navBadge = document.getElementById('pendingNavBadge');
  if(navBadge){
    navBadge.textContent = pend.length > 99 ? '99+' : String(pend.length);
    navBadge.style.display = pend.length ? 'inline-flex' : 'none';
  }
  const tbody = document.getElementById('pendingTbody');
  if(!tbody) return;
  tbody.innerHTML = pend.length
    ? pend.map(p=>`<tr>
        <td><span style="color:var(--blue-lt);font-weight:700">${esc(p.key)}</span></td>
        <td style="font-weight:600">${esc(p.assignee)}</td>
        <td style="color:var(--muted)">${esc(p.client)}</td>
        <td>${posChip(p.position)}</td>
        <td style="color:var(--muted);font-size:.78rem">${fmtDate(p.start)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--muted)">No pending assignments</td></tr>';
}

function renderExpiring(){
  const exp = (latest.expiring_60d || []).filter(e => {
    if(!e || !e.due) return false;
    const d = daysUntil(e.due);
    return d !== null && d <= 0;
  });
  const dueBadge = document.getElementById('expiringBadge');
  if(dueBadge) dueBadge.textContent = exp.length;
  const dueTag = document.getElementById('dueDatesTag');
  if(dueTag) dueTag.textContent = exp.length ? `${exp.length} today / overdue` : 'No due assignments today';
  document.getElementById('expiringTbody').innerHTML = exp.map(e=>`<tr>
    <td style="font-weight:600;font-size:.8rem;white-space:nowrap">${esc(e.assignee)}</td>
    <td style="color:var(--muted);font-size:.8rem">${esc(e.client)}</td>
    <td style="color:var(--muted);font-size:.75rem">${esc(e.position)}</td>
    <td><span class="${expCls(e.due)}">${fmtDate(e.due)}</span></td>
  </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--muted)">No assignment due dates requiring PMO action today</td></tr>';
}

function slackMentionName(name){
  const id = SLACK_USER_BY_NAME[normalizeIdentity(name)];
  return id ? `<@${id}>` : (name ? `@${name}` : '@Project Manager');
}
function buildDueAssignmentsSlackMessage(){
  const exp = latest.expiring_60d || [];
  const rows = exp.filter(row => {
    const d = daysUntil(row.due);
    return d !== null && d <= 0;
  });
  const overdue = rows.filter(row => {
    const d = daysUntil(row.due);
    return d !== null && d < 0;
  });
  const title = overdue.length
    ? `:rotating_light: PMO Due Assignments — action needed after last day (${overdue.length})`
    : `:warning: PMO Due Assignments — last day today (${rows.length})`;
  const lines = rows.map(row => {
    const pm = slackMentionName(row.project_manager || '');
    const key = row.key ? `<${jiraIssueUrl(row.key)}|${row.key}>` : 'No key';
    const due = fmtDate(row.due);
    const summary = row.sow || row.summary || '';
    return `• ${pm} — ${key} — ${row.assignee || 'Unassigned'} / ${row.client || 'No client'} / ${row.position || 'No position'} — due ${due}${summary ? ` — ${summary}` : ''}`;
  });
  return `${title}\n${lines.join('\n') || 'No assignments require PMO action today.'}\n\nDashboard: https://pmoboard.vercel.app`;
}
async function openDueAssignmentsSlackDraft(){
  const message = buildDueAssignmentsSlackMessage();
  try{
    await navigator.clipboard.writeText(message);
    alert('Slack update copied. Paste it in #assignments-hub; opening the channel now.');
  }catch(error){
    prompt('Copy this Slack update and paste it in #assignments-hub:', message);
  }
  window.open('https://slack.com/app_redirect?channel=C07HPPLH6PQ', '_blank', 'noopener,noreferrer');
}
window.openDueAssignmentsSlackDraft = openDueAssignmentsSlackDraft;

// ════════════════════════════════════════════════════
// OPERATING VIEWS — ASSIGNEES / CLIENTS / POSITIONS
// ════════════════════════════════════════════════════
function personId(row){
  return normalizeIdentity(row.email || row.assignee || row.name || row.key || '');
}
function rowTechnology(row){
  return [row.technology, row.frameworks]
    .map(v => String(v || '').trim())
    .filter(v => v && !['(none)','n/a','na'].includes(v.toLowerCase()))
    .join(' · ');
}
function rowStatus(row){
  const client = String(row.client || '').trim();
  const status = String(row.status || '').trim();
  if(client === 'Bench' || status === 'On Hold') return 'Bench';
  if(client === 'Azumo') return 'Azumo';
  if(status === 'Assigned') return 'Pending';
  if(status === 'In Progress' && client) return 'Active';
  return status || 'Unknown';
}
function isClientRow(row){
  return Boolean(row.client) && !['Bench','Azumo'].includes(row.client) && rowStatus(row) === 'Active';
}
function isBenchRow(row){
  return String(row.client || '').trim() === 'Bench';
}
function isInternalCapacityRow(row){
  return ['Bench','Azumo'].includes(String(row.client || '').trim());
}
function operationalDue(row){
  return isBenchRow(row) ? '' : (row.due || '');
}
function fmtOperationalDue(row){
  return isBenchRow(row) ? '' : fmtDate(row.due);
}
function operationalDueValues(rows){
  return (rows || []).map(operationalDue).filter(Boolean).sort();
}
function rowAvailability(row){
  const explicit = firstRawPct(row.availability_pct, row.avail, row.bench_pct);
  if(explicit !== null) return explicit;
  const assign = rowAssignmentPct(row);
  return assign === null ? null : Math.max(0, 100 - assign);
}
function rowAssignmentPct(row){
  return firstRawPct(row.assignment_pct, row.assign, row.pct);
}
function rowBillingPct(row){
  return firstRawPct(row.billing_pct, row.epic_billing);
}
function isExternalInProgress(row){
  return String(row.status || '').trim() === 'In Progress'
    && Boolean(row.client)
    && !['Bench','Azumo'].includes(String(row.client || '').trim());
}
function externalZeroBillingRows(rows){
  return (rows || []).filter(row => isExternalInProgress(row) && rowBillingPct(row) === 0);
}
function missingEpicPositionRows(rows){
  const byEpic = new Map();
  (rows || []).forEach(row => {
    if(row.status !== 'In Progress') return;
    if(!row.epic_key) return;
    if(String(row.epic_position || '').trim()) return;
    const key = row.epic_key || row.assignee || row.key;
    if(!byEpic.has(key)){
      byEpic.set(key, {
        ...row,
        key: row.epic_key || row.key,
        due: row.epic_due || row.due,
        position: row.epic_position || ''
      });
    }
  });
  return [...byEpic.values()].sort((a,b)=>String(a.assignee || '').localeCompare(String(b.assignee || '')));
}
function isFreelance(row){
  return String(row.freelance || '').trim().toLowerCase() === 'yes';
}
function rowBillingClass(row){
  const status = String(row.status || '').trim();
  const client = String(row.client || '').trim();
  if(status === 'In Progress'){
    if(['Azumo','Bench'].includes(client)) return 'Non-Billable';
    if(client) return 'Billable';
  }
  const explicit = String(row.billing_class || '').trim();
  if(explicit) return explicit;
  const billing = firstPct(row.epic_billing);
  if(billing === null) return '';
  return billing === 0 ? 'Non-Billable' : 'Billable';
}
function jiraIssueUrl(key){
  const safeKey = String(key || '').trim();
  if(!safeKey) return '';
  return `https://azumohq.atlassian.net/browse/${encodeURIComponent(safeKey)}`;
}
function sowLink(row, label){
  const key = row.key || '';
  if(!key) return `<span style="color:var(--muted)">—</span>`;
  return `<a class="inline-filter" href="${jiraIssueUrl(key)}" target="_blank" rel="noopener noreferrer">${esc(label || key)}</a>`;
}
function allAssignmentRows(){
  const direct = (latest.assignment_rows || []).filter(Boolean);
  if(direct.length) return direct;
  return [
    ...Object.values(latest.forecast || {}).flat(),
    ...(latest.bench_list || []),
    ...(latest.pending_list || [])
  ].filter(Boolean);
}
function searchableRowText(row){
  return [
    row.key, displayName(row), row.assignee, row.name, row.client, row.position,
    row.status, row.project_status, rowTechnology(row), row.potential_next_assignment,
    row.project_manager, row.csm, row.csm_assigned, row.summary, row.sow,
    row.freelance, rowBillingClass(row)
  ].filter(Boolean).join(' ').toLowerCase();
}
function opsRowMatches(row){
  const search = String(opsFilters.search || '').trim().toLowerCase();
  return (!search || searchableRowText(row).includes(search))
    && (!opsFilters.client || (row.client || '') === opsFilters.client)
    && (!opsFilters.position || (row.position || '') === opsFilters.position)
    && (!opsFilters.projectManager || (row.project_manager || '') === opsFilters.projectManager)
    && (!opsFilters.freelance || (isFreelance(row) ? 'Yes' : 'No') === opsFilters.freelance)
    && (!opsFilters.billingClass || rowBillingClass(row) === opsFilters.billingClass);
}
function filteredOpsRows(){
  return allAssignmentRows().filter(opsRowMatches);
}
function countBy(items, getter){
  const counts = new Map();
  items.forEach(item => {
    const value = getter(item);
    if(value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}
function uniqueNonEmpty(values){
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
}
function renderOpsFilterControls(){
  const rows = allAssignmentRows();
  const clientCounts = countBy(rows, row => row.client || '');
  const positionCounts = countBy(rows, row => row.position || '');
  const projectManagerCounts = countBy(rows, row => row.project_manager || '');
  if(opsFilters.client && !clientCounts.has(opsFilters.client)) opsFilters.client = '';
  if(opsFilters.position && !positionCounts.has(opsFilters.position)) opsFilters.position = '';
  if(opsFilters.projectManager && !projectManagerCounts.has(opsFilters.projectManager)) opsFilters.projectManager = '';

  const search = document.getElementById('opsSearchFilter');
  const clientSelect = document.getElementById('opsClientFilter');
  const positionSelect = document.getElementById('opsPositionFilter');
  const projectManagerSelect = document.getElementById('opsProjectManagerFilter');
  const freelanceSelect = document.getElementById('opsFreelanceFilter');
  const billableSelect = document.getElementById('opsBillableFilter');
  const clientModeSelect = document.getElementById('opsClientModeFilter');
  const clientSortSelect = document.getElementById('opsClientSortFilter');
  document.querySelectorAll('.ops-clients-only').forEach(el => el.classList.toggle('ops-hidden', opsView !== 'clients'));
  if(search && search.value !== opsFilters.search) search.value = opsFilters.search;
  if(clientSelect){
    const clients = [...clientCounts.keys()].sort((a,b)=>a.localeCompare(b));
    clientSelect.innerHTML = optionHTML('', `All clients / assignments (${rows.length})`) + clients.map(c => optionHTML(c, `${c} (${clientCounts.get(c)})`)).join('');
    clientSelect.value = opsFilters.client;
  }
  if(positionSelect){
    const positions = [...positionCounts.keys()].sort((a,b)=>a.localeCompare(b));
    positionSelect.innerHTML = optionHTML('', `All positions (${rows.length})`) + positions.map(p => optionHTML(p, `${p} (${positionCounts.get(p)})`)).join('');
    positionSelect.value = opsFilters.position;
  }
  if(projectManagerSelect){
    const projectManagers = [...projectManagerCounts.keys()].sort((a,b)=>a.localeCompare(b));
    projectManagerSelect.innerHTML = optionHTML('', `All PMs (${rows.length})`) + projectManagers.map(pm => optionHTML(pm, `${pm} (${projectManagerCounts.get(pm)})`)).join('');
    projectManagerSelect.value = opsFilters.projectManager;
  }
  if(freelanceSelect) freelanceSelect.value = opsFilters.freelance;
  if(billableSelect) billableSelect.value = opsFilters.billingClass;
  if(clientModeSelect) clientModeSelect.value = opsClientMode;
  if(clientSortSelect) clientSortSelect.value = opsClientSort;
}
function summaryCard(label, value, sub=''){
  return `<div class="ops-summary-card"><div class="ops-summary-label">${esc(label)}</div><div class="ops-summary-value">${esc(value)}</div>${sub ? `<div class="mc-sub">${esc(sub)}</div>` : ''}</div>`;
}
function renderOpsSummary(rows){
  const people = new Set(rows.map(personId).filter(Boolean));
  const clientRows = rows.filter(isClientRow);
  const clients = new Set(clientRows.map(row => row.client).filter(Boolean));
  const positions = new Set(rows.map(row => row.position).filter(Boolean));
  const uniqueLabel = opsFilters.freelance === 'No'
    ? 'Unique assignees (excluding freelancers)'
    : opsFilters.freelance === 'Yes'
      ? 'Unique assignees (freelancers only)'
      : 'Unique assignees (including freelancers)';
  const grid = document.getElementById('opsSummaryGrid');
  if(!grid) return;
  grid.innerHTML = [
    summaryCard(uniqueLabel, people.size),
    summaryCard('Billable HC', latest.metrics?.headcount_billable ?? '—', 'EazyBI source metric'),
    summaryCard('Clients', clients.size, 'External clients only'),
    summaryCard('Positions', positions.size)
  ].join('');
}
function assigneeGroups(rows){
  const groups = new Map();
  rows.forEach(row => {
    const id = personId(row);
    if(!id) return;
    if(!groups.has(id)) groups.set(id, {id, rows:[], names:[], emails:[]});
    const group = groups.get(id);
    group.rows.push(row);
    if(row.assignee || row.name) group.names.push(row.assignee || row.name);
    if(row.email) group.emails.push(row.email);
  });
  return [...groups.values()].map(group => {
    const assignments = group.rows.slice().sort((a,b)=>{
      const order = {Bench: 3, Azumo: 2, Active: 1, Pending: 4, Unknown: 5};
      return (order[rowStatus(a)] || 9) - (order[rowStatus(b)] || 9)
        || String(a.client || '').localeCompare(String(b.client || ''))
        || String(a.due || '9999-12-31').localeCompare(String(b.due || '9999-12-31'));
    });
    const availValues = assignments.map(rowAvailability).filter(v => v !== null);
    const dueDates = operationalDueValues(assignments);
    return {
      ...group,
      name: uniqueNonEmpty(group.names)[0] || 'Unassigned',
      email: uniqueNonEmpty(group.emails)[0] || '',
      assignments,
      clients: uniqueNonEmpty(assignments.map(row => row.client)),
      positions: uniqueNonEmpty(assignments.map(row => row.position)),
      availability: availValues.length ? Math.max(...availValues) : null,
      nextDue: dueDates[0] || ''
    };
  });
}
function assignmentChip(row){
  const label = row.client || 'No client';
  const pct = rowAssignmentPct(row);
  const internal = label === 'Azumo' ? ' · internal' : '';
  return `<span class="assignment-chip" title="${esc(row.summary || row.sow || row.key || label)}">${esc(label)}${internal}: ${fmtRawPct(pct)}</span>`;
}
function renderAssignmentDetails(group){
  return `<tr><td colspan="6" style="padding:0;background:var(--surf)">
    <div style="padding:12px 16px 16px">
      <table class="nested-table"><thead><tr><th>Assignment</th><th>Project Manager</th><th>%</th><th>Available</th><th>Due Date</th><th>SOW / Summary</th><th>Link</th></tr></thead><tbody>
      ${group.assignments.map(row => {
        const client = row.client === 'Azumo' ? 'Azumo (Internal)' : (row.client || '—');
        const pct = rowAssignmentPct(row);
        const avail = rowAvailability(row);
        return `<tr>
          <td style="font-weight:700">${esc(client)}</td>
          <td style="color:var(--muted)">${esc(row.project_manager || '—')}</td>
          <td>${fmtRawPct(pct)}</td>
          <td><span class="${avail===null?'':availCls(avail)}">${fmtRawPct(avail)}</span></td>
          <td style="white-space:nowrap">${fmtOperationalDue(row)}</td>
          <td style="color:var(--muted);max-width:420px">${row.key ? sowLink(row, row.summary || row.sow || row.key) : esc(row.summary || row.sow || row.potential_next_assignment || '—')}</td>
          <td>${sowLink(row)}</td>
        </tr>`;
      }).join('')}
      </tbody></table>
    </div>
  </td></tr>`;
}
function renderOpsAssignees(rows){
  const groups = assigneeGroups(rows).sort((a,b)=>{
    if(a.availability !== null && b.availability !== null && b.availability !== a.availability) return b.availability - a.availability;
    if(a.availability !== null && b.availability === null) return -1;
    if(a.availability === null && b.availability !== null) return 1;
    return a.name.localeCompare(b.name);
  });
  document.getElementById('opsThead').innerHTML = '<tr><th>Assignee</th><th>Position</th><th>Assignments</th><th>Available</th><th>Next Due</th><th>SOWs</th></tr>';
  document.getElementById('opsTbody').innerHTML = groups.map(group => {
    const expanded = expandedAssignees.has(group.id);
    const avail = group.availability;
    const main = `<tr>
      <td style="font-weight:800;white-space:nowrap"><button class="ops-expand" onclick='toggleAssigneeGroup(${jsArg(group.id)})'>${expanded ? '−' : '+'}</button>${esc(group.name)}</td>
      <td>${esc(group.positions.join(', ') || '—')}</td>
      <td>${group.assignments.map(assignmentChip).join('')}</td>
      <td><span class="${avail===null?'':availCls(avail)}">${fmtRawPct(avail)}</span></td>
      <td style="white-space:nowrap">${fmtDate(group.nextDue)}</td>
      <td><button class="inline-filter" onclick='toggleAssigneeGroup(${jsArg(group.id)})'>${expanded ? 'Hide' : 'Show'} ${group.assignments.length} SOW${group.assignments.length === 1 ? '' : 's'}</button></td>
    </tr>`;
    return main + (expanded ? renderAssignmentDetails(group) : '');
  }).join('') || '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--muted)">No assignees match the selected filters</td></tr>';
}
function accountCoverageMap(){
  const map = new Map();
  (latest.account_coverage || []).forEach(row => {
    const key = row.client_key || normalizeClientKey(row.client);
    if(key && !map.has(key)) map.set(key, row);
  });
  return map;
}
function coverageForClient(client){
  const row = accountCoverageMap().get(normalizeClientKey(client));
  if(row) return {
    ...row,
    missing: Array.isArray(row.missing)
      ? row.missing
      : [['PM', row.pm_assigned], ['CSM', row.csm_assigned], ['TL', row.tl_assigned]].filter(([,value]) => !value).map(([label]) => label)
  };
  return {
    client,
    client_key: normalizeClientKey(client),
    pm_assigned: '',
    csm_assigned: '',
    tl_assigned: '',
    missing: ['PM','CSM','TL'],
    complete: false,
    source: latest.account_coverage_source || 'Jira PSA Epic Account Coverage'
  };
}
function coverageBadge(value){
  return value ? esc(value) : '<span class="badge badge-red">Missing</span>';
}
function jiraSearchUrl(jql){
  return `https://azumohq.atlassian.net/issues/?jql=${encodeURIComponent(jql)}`;
}
function accountCoverageUrl(coverage){
  if(coverage?.key) return jiraIssueUrl(coverage.key);
  const client = coverage?.client || '';
  return jiraSearchUrl(`project = PSA AND issuetype = Epic AND summary ~ "${client.replace(/"/g,'')}" ORDER BY updated DESC`);
}
function accountCoverageMissingUrl(){
  return jiraSearchUrl('project = PSA AND issuetype = Epic AND status in ("In Progress", Backlog) AND ("PM Assigned" is EMPTY OR "CSM Assigned" is EMPTY OR "TL assigned" is EMPTY) ORDER BY updated DESC');
}
function accountCoverageLink(coverage, label='Complete in Jira'){
  return `<a class="inline-filter" href="${accountCoverageUrl(coverage)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}
function coverageCell(coverage){
  return `<div class="coverage-cell">
    <b>PM:</b> ${coverageBadge(coverage.pm_assigned)}<br/>
    <b>CSM:</b> ${coverageBadge(coverage.csm_assigned)}<br/>
    <b>TL:</b> ${coverageBadge(coverage.tl_assigned)}<br/>
    ${accountCoverageLink(coverage)}
  </div>`;
}
function setAccountCoverageSearch(value){
  accountCoverageSearch = String(value || '');
  renderAccountCoverageModule();
}
function setAccountCoverageFilter(value){
  accountCoverageFilter = value || 'all';
  renderAccountCoverageModule();
}
function accountCoverageRows(){
  const rowsByClient = new Map();
  const assignmentClientRows = clientRowsFromAssignments(latest.assignment_rows || []);
  assignmentClientRows.forEach(row => {
    rowsByClient.set(normalizeClientKey(row.client), {
      client: row.client,
      assignees: row.people || [],
      positions: row.positions || [],
      coverage: row.coverage || coverageForClient(row.client)
    });
  });
  (latest.account_coverage || []).forEach(row => {
    const key = row.client_key || normalizeClientKey(row.client);
    if(!key) return;
    const existing = rowsByClient.get(key) || {client: row.client, assignees: [], positions: []};
    rowsByClient.set(key, {
      ...existing,
      client: existing.client || row.client,
      coverage: coverageForClient(existing.client || row.client)
    });
  });
  return [...rowsByClient.values()].map(row => {
    const coverage = row.coverage || coverageForClient(row.client);
    const missing = coverage.missing || [];
    return {
      ...row,
      coverage,
      missing,
      complete: !missing.length
    };
  }).sort((a,b)=>a.client.localeCompare(b.client));
}
function renderAccountCoverageModule(){
  if(!latest) return;
  const sourceTag = document.getElementById('accountCoverageTag');
  if(sourceTag) sourceTag.textContent = latest.account_coverage_source || 'Jira PSA Account Coverage';
  const missingLink = document.getElementById('accountCoverageMissingLink');
  if(missingLink) missingLink.href = accountCoverageMissingUrl();

  let rows = accountCoverageRows();
  const total = rows.length;
  const missingRowsAll = rows.filter(row => !row.complete);
  const completeRowsAll = rows.filter(row => row.complete);
  const search = accountCoverageSearch.trim().toLowerCase();
  if(search){
    rows = rows.filter(row => [
      row.client,
      row.coverage.pm_assigned,
      row.coverage.csm_assigned,
      row.coverage.tl_assigned,
      row.assignees.join(' ')
    ].join(' ').toLowerCase().includes(search));
  }
  if(accountCoverageFilter === 'missing') rows = rows.filter(row => !row.complete);
  if(accountCoverageFilter === 'complete') rows = rows.filter(row => row.complete);

  const searchInput = document.getElementById('accountCoverageSearchInput');
  if(searchInput && searchInput.value !== accountCoverageSearch) searchInput.value = accountCoverageSearch;
  ['all','missing','complete'].forEach(filter => {
    const btn = document.getElementById(`coverageFilter${filter[0].toUpperCase()}${filter.slice(1)}`);
    if(btn) btn.classList.toggle('active', accountCoverageFilter === filter);
  });

  const cards = document.getElementById('accountCoverageSummaryCards');
  if(cards){
    cards.innerHTML = [
      `<div class="action-card"><div class="action-label">Clients tracked</div><div class="action-value">${total}</div><div class="action-copy">Active Jira clients + PSA coverage records</div></div>`,
      `<div class="action-card ${missingRowsAll.length ? 'warning' : 'ok'}"><div class="action-label">Missing coverage</div><div class="action-value">${missingRowsAll.length}</div><div class="action-copy">Need PM, CSM, or TL assigned</div></div>`,
      `<div class="action-card ok"><div class="action-label">Complete</div><div class="action-value">${completeRowsAll.length}</div><div class="action-copy">PM + CSM + TL populated</div></div>`,
      `<div class="action-card"><div class="action-label">Visible rows</div><div class="action-value">${rows.length}</div><div class="action-copy">${search ? 'Filtered by search' : 'Current filter'}</div></div>`
    ].join('');
  }

  const alert = document.getElementById('accountCoverageAlert');
  if(alert){
    if(missingRowsAll.length){
      const details = missingRowsAll.slice(0,8).map(row => `${row.client}: ${row.missing.join('/')}`).join(' · ');
      alert.style.display = 'block';
      alert.innerHTML = `<strong>Account Coverage incomplete:</strong> ${missingRowsAll.length} client${missingRowsAll.length === 1 ? '' : 's'} need updates. ${esc(details)}${missingRowsAll.length > 8 ? ` · +${missingRowsAll.length - 8} more` : ''}`;
    }else{
      alert.style.display = 'none';
      alert.innerHTML = '';
    }
  }

  const tbody = document.getElementById('accountCoverageTbody');
  if(!tbody) return;
  tbody.innerHTML = rows.map(row => {
    const coverage = row.coverage;
    const assignees = row.assignees || [];
    return `<tr>
      <td style="font-weight:900">${esc(row.client || '—')}</td>
      <td>${coverageBadge(coverage.pm_assigned)}</td>
      <td>${coverageBadge(coverage.csm_assigned)}</td>
      <td>${coverageBadge(coverage.tl_assigned)}</td>
      <td>${row.complete ? '<span class="badge badge-green">Complete</span>' : `<span class="badge badge-red">Missing ${esc(row.missing.join(' / '))}</span>`}</td>
      <td class="ops-people">${esc(assignees.slice(0,8).join(', ') || '—')}${assignees.length > 8 ? ` +${assignees.length - 8} more` : ''}</td>
      <td>${accountCoverageLink(coverage, coverage.key ? 'Open in Jira' : 'Find in Jira')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:1rem;color:var(--muted)">No account coverage rows match the selected filters.</td></tr>';
}
window.setAccountCoverageSearch = setAccountCoverageSearch;
window.setAccountCoverageFilter = setAccountCoverageFilter;
function clientRowsFromAssignments(rows){
  const grouped = new Map();
  rows
    .filter(isClientRow)
    .forEach(row => {
      const client = row.client;
      if(!grouped.has(client)) grouped.set(client, []);
      grouped.get(client).push(row);
    });

  return [...grouped.entries()].map(([client, items]) => {
    const peopleById = new Map();
    items.forEach(item => peopleById.set(personId(item), displayName(item)));
    const people = [...peopleById.values()].filter(Boolean).sort((a,b)=>a.localeCompare(b));
    const dueDates = operationalDueValues(items);
    const nextDue = dueDates[0] || '';
    const positions = uniqueNonEmpty(items.map(row => row.position));
    const coverage = coverageForClient(client);
    return {client, items, people, positions, nextDue, coverage};
  });
}
function sortClientRows(rows){
  return rows.slice().sort((a,b)=>{
    if(opsClientSort === 'assigneesAsc') return a.people.length - b.people.length || a.client.localeCompare(b.client);
    if(opsClientSort === 'assigneesDesc') return b.people.length - a.people.length || a.client.localeCompare(b.client);
    if(opsClientSort === 'clientAsc') return a.client.localeCompare(b.client);
    return String(a.nextDue || '9999-12-31').localeCompare(String(b.nextDue || '9999-12-31')) || a.client.localeCompare(b.client);
  });
}
function renderCoverageAlert(clientRows){
  const alert = document.getElementById('opsCoverageAlert');
  if(!alert) return;
  if(opsView !== 'clients'){
    alert.style.display = 'none';
    alert.innerHTML = '';
    return;
  }
  const incomplete = clientRows.filter(row => row.coverage.missing && row.coverage.missing.length);
  if(!incomplete.length){
    alert.style.display = 'none';
    alert.innerHTML = '';
    return;
  }
  const details = incomplete.slice(0,8).map(row => `${row.client}: missing ${row.coverage.missing.join('/')}`).join(' · ');
  alert.style.display = 'block';
  alert.innerHTML = `<strong>Account Coverage incomplete:</strong> ${incomplete.length} client${incomplete.length === 1 ? '' : 's'} need PM, CSM, or TL assignment. ${esc(details)}${incomplete.length > 8 ? ` · +${incomplete.length-8} more` : ''} · <a class="inline-filter" href="${accountCoverageMissingUrl()}" target="_blank" rel="noopener noreferrer">Open missing coverage in Jira</a>`;
}
function renderOpsClients(rows){
  const clientRows = sortClientRows(clientRowsFromAssignments(rows));
  renderCoverageAlert(clientRows);

  if(opsClientMode === 'coverage'){
    document.getElementById('opsThead').innerHTML = '<tr><th>Client</th><th>PM Assigned</th><th>CSM Assigned</th><th>TL Assigned</th><th>Alert</th><th>Link</th></tr>';
    document.getElementById('opsTbody').innerHTML = clientRows.map(row => {
      const missing = row.coverage.missing || [];
      return `<tr>
        <td style="font-weight:800"><button class="inline-filter" onclick='setOpsFilter("client", ${jsArg(row.client)})'>${esc(row.client)}</button></td>
        <td>${coverageBadge(row.coverage.pm_assigned)}</td>
        <td>${coverageBadge(row.coverage.csm_assigned)}</td>
        <td>${coverageBadge(row.coverage.tl_assigned)}</td>
        <td>${missing.length ? `<span class="badge badge-red">Complete ${esc(missing.join(' / '))}</span>` : '<span class="badge badge-green">Complete</span>'}</td>
        <td>${accountCoverageLink(row.coverage)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--muted)">No Account Coverage rows match the selected filters</td></tr>';
    return;
  }

  document.getElementById('opsThead').innerHTML = '<tr><th>Client</th><th># Assignees</th><th>Positions</th><th>Accounts Coverage</th><th>Next Due</th><th>Assignees</th></tr>';
  document.getElementById('opsTbody').innerHTML = clientRows.map(row => `<tr>
      <td style="font-weight:800"><button class="inline-filter" onclick='setOpsFilter("client", ${jsArg(row.client)})'>${esc(row.client)}</button></td>
      <td>${row.people.length}</td>
      <td>${esc(row.positions.slice(0,5).join(', ') || '—')}${row.positions.length > 5 ? ` <span style="color:var(--muted)">+${row.positions.length-5}</span>` : ''}</td>
      <td>${coverageCell(row.coverage)}</td>
      <td><span class="${row.nextDue ? expCls(row.nextDue) : ''}">${fmtDate(row.nextDue)}</span></td>
      <td class="ops-people">${esc(row.people.slice(0,10).join(', ') || '—')}${row.people.length > 10 ? ` +${row.people.length-10} more` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--muted)">No client rows match the selected filters</td></tr>';
}
function renderOpsProjectManagers(rows){
  const grouped = new Map();
  rows
    .filter(row => row.client !== 'Bench' && ['Active','Azumo'].includes(rowStatus(row)))
    .forEach(row => {
      const pm = row.project_manager || 'Unassigned PM';
      if(!grouped.has(pm)) grouped.set(pm, []);
      grouped.get(pm).push(row);
    });

  const pmRows = [...grouped.entries()].map(([projectManager, items]) => {
    const id = normalizeIdentity(projectManager);
    const peopleById = new Map();
    items.forEach(item => peopleById.set(personId(item), displayName(item)));
    const people = [...peopleById.values()].filter(Boolean).sort((a,b)=>a.localeCompare(b));
    const clients = uniqueNonEmpty(items.map(row => row.client === 'Azumo' ? 'Azumo (Internal)' : row.client));
    const positions = uniqueNonEmpty(items.map(row => row.position));
    const dueDates = operationalDueValues(items);
    const nextDue = dueDates[0] || '';
    const assignments = items
      .slice()
      .sort((a,b)=>String(a.due || '9999-12-31').localeCompare(String(b.due || '9999-12-31')) || String(a.client || '').localeCompare(String(b.client || '')) || String(a.assignee || '').localeCompare(String(b.assignee || '')));
    return {id, projectManager, people, clients, positions, nextDue, assignments, sowCount: items.length};
  }).sort((a,b)=>a.projectManager.localeCompare(b.projectManager));

  function pmDetails(row){
    return `<tr><td colspan="7" style="padding:0;background:var(--surf)">
      <div style="padding:12px 16px 16px">
        <table class="nested-table"><thead><tr><th>Client</th><th>Assignee</th><th>Position</th><th>%</th><th>Available</th><th>Due Date</th><th>SOW / Link</th></tr></thead><tbody>
        ${row.assignments.map(item => {
          const pct = rowAssignmentPct(item);
          const avail = rowAvailability(item);
          return `<tr>
            <td style="font-weight:700">${esc(item.client === 'Azumo' ? 'Azumo (Internal)' : (item.client || '—'))}</td>
            <td>${esc(displayName(item))}</td>
            <td>${posChip(item.position)}</td>
            <td>${fmtRawPct(pct)}</td>
            <td><span class="${avail===null?'':availCls(avail)}">${fmtRawPct(avail)}</span></td>
            <td style="white-space:nowrap">${fmtOperationalDue(item)}</td>
            <td style="max-width:480px">${item.key ? sowLink(item, item.summary || item.sow || item.key) : esc(item.summary || item.sow || '—')}</td>
          </tr>`;
        }).join('')}
        </tbody></table>
      </div>
    </td></tr>`;
  }

  document.getElementById('opsThead').innerHTML = '<tr><th>Project Manager</th><th># Assignees</th><th># SOWs</th><th>Clients</th><th>Positions</th><th>Next Due</th><th>Assignments</th></tr>';
  document.getElementById('opsTbody').innerHTML = pmRows.map(row => {
    const expanded = expandedProjectManagers.has(row.id);
    const main = `<tr>
    <td style="font-weight:800;white-space:nowrap"><button class="ops-expand" onclick='toggleProjectManagerGroup(${jsArg(row.id)})'>${expanded ? '−' : '+'}</button>${esc(row.projectManager)}</td>
    <td>${row.people.length}</td>
    <td>${row.sowCount}</td>
    <td style="color:var(--muted);font-size:.78rem;white-space:normal">${esc(row.clients.join(', ') || '—')}</td>
    <td style="white-space:normal">${esc(row.positions.join(', ') || '—')}</td>
    <td style="white-space:nowrap"><span class="${row.nextDue ? expCls(row.nextDue) : ''}">${fmtDate(row.nextDue)}</span></td>
    <td><button class="inline-filter" onclick='toggleProjectManagerGroup(${jsArg(row.id)})'>${expanded ? 'Hide' : 'Show'} ${row.sowCount} SOW${row.sowCount === 1 ? '' : 's'} / ${row.people.length} assignee${row.people.length === 1 ? '' : 's'}</button></td>
  </tr>`;
    return main + (expanded ? pmDetails(row) : '');
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:1rem;color:var(--muted)">No Project Manager rows match the selected filters</td></tr>';
}
function renderOpsPositions(rows){
  const grouped = new Map();
  rows.forEach(row => {
    const position = row.position || 'No position';
    if(!grouped.has(position)) grouped.set(position, []);
    grouped.get(position).push(row);
  });
  const positionRows = [...grouped.entries()].map(([position, items]) => {
    const total = new Set();
    const assigned = new Set();
    const benchAvailable = new Set();
    items.forEach(row => {
      const id = personId(row);
      if(!id) return;
      total.add(id);
      const status = rowStatus(row);
      const avail = rowAvailability(row);
      if(['Active','Azumo'].includes(status) && row.client !== 'Bench') assigned.add(id);
      if(status === 'Bench' || (avail !== null && avail > 0)) benchAvailable.add(id);
    });
    const utilization = total.size ? (assigned.size / total.size) * 100 : 0;
    const people = uniqueNonEmpty(items.map(displayName));
    return {position, total: total.size, assigned: assigned.size, benchAvailable: benchAvailable.size, utilization, people};
  }).sort((a,b)=>b.benchAvailable - a.benchAvailable || b.total - a.total || a.position.localeCompare(b.position));

  document.getElementById('opsThead').innerHTML = '<tr><th>Position</th><th># Total</th><th># Assigned</th><th># Bench / Available</th><th>Utilization</th><th>People</th></tr>';
  document.getElementById('opsTbody').innerHTML = positionRows.map(row => `<tr>
    <td>${posChip(row.position)}</td>
    <td>${row.total}</td>
    <td>${row.assigned}</td>
    <td>${row.benchAvailable}</td>
    <td>${fmtPct(row.utilization)}</td>
    <td class="ops-people">${esc(row.people.slice(0,10).join(', ') || '—')}${row.people.length > 10 ? ` +${row.people.length-10} more` : ''}</td>
  </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--muted)">No position rows match the selected filters</td></tr>';
}
function renderOpsViews(){
  renderOpsFilterControls();
  const rows = filteredOpsRows();
  renderOpsSummary(rows);
  const totalRows = allAssignmentRows().length;
  const labelByView = {
    assignees: 'Assignees',
    projectManagers: 'Project Managers',
    clients: 'Clients',
    positions: 'Positions'
  };
  const tabIdByView = {
    assignees: 'opsTabAssignees',
    projectManagers: 'opsTabProjectManagers',
    clients: 'opsTabClients',
    positions: 'opsTabPositions'
  };
  const label = labelByView[opsView] || 'Assignees';
  const activeFilterLabels = [
    opsFilters.search ? `Search: ${opsFilters.search}` : '',
    opsFilters.client ? `Client/assignment: ${opsFilters.client}` : '',
	    opsFilters.position ? `Position: ${opsFilters.position}` : '',
	    opsFilters.projectManager ? `PM: ${opsFilters.projectManager}` : '',
	    opsFilters.freelance ? `Freelancer: ${opsFilters.freelance}` : '',
	    opsFilters.billingClass ? `Billing: ${opsFilters.billingClass}` : '',
	    opsView === 'clients' && opsClientMode === 'coverage' ? 'Client subview: Accounts Coverage' : '',
	    opsView === 'clients' ? `Sort: ${opsClientSort.replace('assignees','Assignees ').replace('Desc','↓').replace('Asc','↑').replace('due','Due').replace('client','Client')}` : '',
	  ].filter(Boolean);
	  document.getElementById('opsViewsTag').textContent = `${label} view`;
	  if(opsView === 'clients'){
	    const clientRows = clientRowsFromAssignments(rows);
	    const incomplete = clientRows.filter(row => row.coverage.missing && row.coverage.missing.length).length;
	    document.getElementById('opsFilterSummary').textContent =
	      `${clientRows.length} clients · ${incomplete} incomplete coverage${activeFilterLabels.length ? ` · ${activeFilterLabels.join(' · ')}` : ''}`;
	  } else {
	    document.getElementById('opsFilterSummary').textContent = activeFilterLabels.length
	      ? `${rows.length} of ${totalRows} assignment rows · ${activeFilterLabels.join(' · ')}`
	      : `${assigneeGroups(rows).length} assignees · ${rows.length} assignment rows`;
	  }
  document.querySelectorAll('.view-tab').forEach(btn => btn.classList.remove('active'));
  const activeTab = document.getElementById(tabIdByView[opsView] || 'opsTabAssignees');
  if(activeTab) activeTab.classList.add('active');
	  if(opsView !== 'clients') renderCoverageAlert([]);
	  if(opsView === 'projectManagers') renderOpsProjectManagers(rows);
	  else if(opsView === 'clients') renderOpsClients(rows);
	  else if(opsView === 'positions') renderOpsPositions(rows);
	  else renderOpsAssignees(rows);
}
function setOpsView(view){
  opsView = view || 'assignees';
  renderOpsViews();
}
function setOpsFilter(field, value){
  opsFilters[field] = value || '';
  renderOpsViews();
}
function resetOpsFilters(){
  opsFilters = {search:'', client:'', position:'', projectManager:'', freelance:'', billingClass:''};
  opsClientMode = 'overview';
  opsClientSort = 'assigneesDesc';
  expandedAssignees = new Set();
  expandedProjectManagers = new Set();
  renderOpsViews();
}
function setOpsClientMode(value){
  opsClientMode = value || 'overview';
  renderOpsViews();
}
function setOpsClientSort(value){
  opsClientSort = value || 'assigneesDesc';
  renderOpsViews();
}
function toggleAssigneeGroup(id){
  if(expandedAssignees.has(id)) expandedAssignees.delete(id);
  else expandedAssignees.add(id);
  renderOpsViews();
}
function toggleProjectManagerGroup(id){
  if(expandedProjectManagers.has(id)) expandedProjectManagers.delete(id);
  else expandedProjectManagers.add(id);
  renderOpsViews();
}
window.setOpsView = setOpsView;
window.setOpsFilter = setOpsFilter;
window.resetOpsFilters = resetOpsFilters;
window.toggleAssigneeGroup = toggleAssigneeGroup;
window.toggleProjectManagerGroup = toggleProjectManagerGroup;
window.setOpsClientMode = setOpsClientMode;
window.setOpsClientSort = setOpsClientSort;


// ════════════════════════════════════════════════════
// HISTORY CARDS
// ════════════════════════════════════════════════════
function monthlyHistorySnapshots(){
  const byMonth = new Map();
  (PMO.snapshots || []).forEach(snapshot => {
    const key = String(snapshot.date || snapshot.label || '').slice(0,7) || snapshot.label || 'unknown';
    byMonth.set(key, snapshot);
  });
  return [...byMonth.entries()]
    .sort(([a],[b]) => String(a).localeCompare(String(b)))
    .map(([,snapshot]) => snapshot);
}
function renderHistory(){
  const grid = document.getElementById('historyGrid');
  const monthly = monthlyHistorySnapshots();
  const historyTag = document.getElementById('historySnapshotsTag');
  if(historyTag) historyTag.textContent = `${monthly.length} months · ${(PMO.snapshots || []).length} snapshots stored`;
  grid.innerHTML = '';
  if(monthly.length < 2){
    grid.innerHTML='<p style="color:var(--muted)">At least 2 months are needed to show monthly trends. The data repository can keep multiple snapshots per month, but this view shows one monthly point.</p>';
    return;
  }
  const currentMonthly = monthly[monthly.length - 1];
  const previousMonthly = monthly[monthly.length - 2];
  METRIC_CFG.forEach(cfg => {
    const card = document.createElement('div');
    card.className = 'hist-card';
    const cur = currentMonthly.metrics[cfg.key];
    const prv = previousMonthly ? previousMonthly.metrics[cfg.key] : null;
    const {text,cls} = deltaStr(cur, prv, cfg.higherBetter);
    card.innerHTML = `
      <div class="hist-label">${cfg.label}</div>
      <div class="hist-vals">
        <div class="hist-cur" style="color:${cfg.color}">${typeof cur==='number'?(cur%1!==0?cur.toFixed(2):cur):'—'}${cfg.unit}</div>
        ${prv!=null?`<div class="hist-prev">prev month: ${typeof prv==='number'?(prv%1!==0?prv.toFixed(2):prv):'—'}${cfg.unit}</div>`:''}
        <div class="hist-delta ${cls}">${text}</div>
      </div>
      ${sparklineSVG(monthly, cfg.key, cfg.color)}
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        ${monthly.map(s=>`<span style="font-size:.68rem;background:var(--surf);border:1px solid var(--brd);border-radius:4px;padding:2px 6px;color:var(--muted)">${s.label}: <strong style="color:var(--txt)">${s.metrics[cfg.key]!=null?(typeof s.metrics[cfg.key]==='number'&&s.metrics[cfg.key]%1!==0?s.metrics[cfg.key].toFixed(1):s.metrics[cfg.key]):'—'}</strong></span>`).join('')}
      </div>
    `;
    grid.appendChild(card);
  });
}

// ════════════════════════════════════════════════════
// FORECAST
// ════════════════════════════════════════════════════
function allForecastItems(){
  return Object.values(latest.forecast || {}).flat().filter(Boolean);
}
function countByForecastField(items, field){
  const counts = new Map();
  items.forEach(item => {
    const value = item[field] || '';
    if(value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}
function optionHTML(value, label){
  return `<option value="${esc(value)}">${esc(label)}</option>`;
}
function renderForecastFilterControls(){
  const items = allForecastItems();
  const clientCounts = countByForecastField(items, 'client');
  const positionCounts = countByForecastField(items, 'position');
  const assigneeCounts = countByForecastField(items, 'assignee');
  const monthCounts = new Map();
  Object.entries(latest.forecast || {}).forEach(([month, rows]) => {
    const count = (rows || []).filter(row => {
      return (!forecastFilters.client || (row.client || '') === forecastFilters.client)
        && (!forecastFilters.position || (row.position || '') === forecastFilters.position)
        && (!forecastFilters.assignee || (row.assignee || '') === forecastFilters.assignee);
    }).length;
    if(count) monthCounts.set(month, count);
  });
  if(forecastFilters.client && !clientCounts.has(forecastFilters.client)) forecastFilters.client = '';
  if(forecastFilters.position && !positionCounts.has(forecastFilters.position)) forecastFilters.position = '';
  if(forecastFilters.assignee && !assigneeCounts.has(forecastFilters.assignee)) forecastFilters.assignee = '';
  if(forecastFilters.month && !monthCounts.has(forecastFilters.month)) forecastFilters.month = '';

  const clientSelect = document.getElementById('forecastClientFilter');
  const positionSelect = document.getElementById('forecastPositionFilter');
  const monthSelect = document.getElementById('forecastMonthFilter');
  const assigneeSelect = document.getElementById('forecastAssigneeFilter');
  if(clientSelect){
    const clients = [...clientCounts.keys()].sort((a,b)=>a.localeCompare(b));
    clientSelect.innerHTML = optionHTML('', `All clients (${items.length})`) + clients.map(c => optionHTML(c, `${c} (${clientCounts.get(c)})`)).join('');
    clientSelect.value = forecastFilters.client;
    clientSelect.onchange = () => setForecastFilter('client', clientSelect.value);
  }
  const resetButton = document.getElementById('forecastResetFilters');
  if(resetButton) resetButton.onclick = resetForecastFilters;
  if(positionSelect){
    const positions = [...positionCounts.keys()].sort((a,b)=>a.localeCompare(b));
    positionSelect.innerHTML = optionHTML('', `All positions (${items.length})`) + positions.map(p => optionHTML(p, `${p} (${positionCounts.get(p)})`)).join('');
    positionSelect.value = forecastFilters.position;
    positionSelect.onchange = () => setForecastFilter('position', positionSelect.value);
  }
  if(assigneeSelect){
    const assignees = [...assigneeCounts.keys()].sort((a,b)=>a.localeCompare(b));
    assigneeSelect.innerHTML = optionHTML('', `All assignees (${items.length})`) + assignees.map(a => optionHTML(a, `${a} (${assigneeCounts.get(a)})`)).join('');
    assigneeSelect.value = forecastFilters.assignee;
    assigneeSelect.onchange = () => setForecastFilter('assignee', assigneeSelect.value);
  }
  if(monthSelect){
    const months = [...monthCounts.keys()].sort();
    const monthTotal = [...monthCounts.values()].reduce((sum, count) => sum + count, 0);
    monthSelect.innerHTML = optionHTML('', `All months (${monthTotal})`) + months.map(m => {
      const mDate = new Date(m + '-01T00:00:00');
      const label = Number.isNaN(mDate.getTime()) ? m : mDate.toLocaleDateString('en-US',{month:'short',year:'numeric'});
      return optionHTML(m, `${label} (${monthCounts.get(m)})`);
    }).join('');
    monthSelect.value = forecastFilters.month;
    monthSelect.onchange = () => setForecastFilter('month', monthSelect.value);
  }
}
function setForecastFilter(field, value){
  forecastFilters[field] = value || '';
  renderForecast();
}
function resetForecastFilters(){
  forecastFilters = {client:'', position:'', month:'', assignee:''};
  renderForecast();
}
function forecastRowMatches(row){
  return (!forecastFilters.client || (row.client || '') === forecastFilters.client)
    && (!forecastFilters.position || (row.position || '') === forecastFilters.position)
    && (!forecastFilters.assignee || (row.assignee || '') === forecastFilters.assignee);
}
function filteredForecastByMonth(){
  const fc = latest.forecast || {};
  return Object.fromEntries(
    Object.keys(fc).sort()
      .filter(month => !forecastFilters.month || month === forecastFilters.month)
      .map(month => [month, (fc[month] || []).filter(forecastRowMatches)])
      .filter(([, rows]) => rows.length)
  );
}
function renderForecast(){
  const fcAll   = latest.forecast || {};
  const source  = latest.forecast_source || 'Jira In Progress due dates';
  const sourceTag = document.getElementById('forecastSourceTag');
  if(sourceTag) sourceTag.textContent = source;
  renderForecastFilterControls();

  const allItems = allForecastItems();
  const fc = filteredForecastByMonth();
  const months  = Object.keys(fc).sort();
  const filteredTotal = months.reduce((sum, m) => sum + (fc[m] || []).length, 0);
  const summary = document.getElementById('forecastFilterSummary');
  const activeFilterLabels = [
    forecastFilters.client ? `Client: ${forecastFilters.client}` : '',
    forecastFilters.position ? `Position: ${forecastFilters.position}` : '',
    forecastFilters.month ? `Month: ${new Date(forecastFilters.month + '-01T00:00:00').toLocaleDateString('en-US',{month:'short',year:'numeric'})}` : '',
    forecastFilters.assignee ? `Assignee: ${forecastFilters.assignee}` : '',
  ].filter(Boolean);
  if(summary){
    summary.textContent = activeFilterLabels.length
      ? `${filteredTotal} of ${allItems.length} assignments · ${activeFilterLabels.join(' · ')}`
      : `${allItems.length} assignments across ${Object.keys(fcAll).length} months`;
  }

  const chart = document.getElementById('forecastChart');
  const tbody = document.getElementById('forecastTbody');
  if(!months.length){
    chart.innerHTML='<p style="color:var(--muted)">No forecast rows match the selected filters.</p>';
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--muted)">No assignments match the selected filters</td></tr>';
    return;
  }

  const counts  = months.map(m => fc[m].length);
  const maxCnt  = Math.max(...counts, 1);
  const MAX_H   = 130; // px

  // Chart bars stay grouped by month; table below shows the exact due date per assignment.
  chart.innerHTML = '';
  months.forEach((m) => {
    const rows  = fc[m] || [];
    const cnt   = rows.length;
    const h     = Math.max(8, (cnt / maxCnt) * MAX_H);
    const today2= new Date();
    const mDate = new Date(m + '-01T00:00:00');
    const diff  = (mDate.getFullYear()-today2.getFullYear())*12 + mDate.getMonth()-today2.getMonth();
    const cls   = diff <= 0 ? 'urgent' : diff <= 1 ? 'soon' : 'ok';
    const label = mDate.toLocaleDateString('en-US',{month:'short',year:'2-digit'});
    const detail = rows.slice(0,18).map(a=>`${a.key ? a.key + ' · ' : ''}${a.assignee || 'Unassigned'} (${a.client || 'No client'} · ${a.position || 'No position'})${a.due ? ' — ' + a.due : ''}`).join('\n');
    const more = rows.length > 18 ? `
+${rows.length-18} more` : '';
    const wrap  = document.createElement('div');
    wrap.className = 'fc-bar-wrap';
    wrap.style.cursor = 'pointer';
    wrap.onclick = () => setForecastFilter('month', m);
    wrap.title = `Click to filter ${label}`;
    wrap.innerHTML = `
      <div class="fc-count">${cnt}</div>
      <div class="fc-bar-outer" style="height:${MAX_H}px">
        <div class="fc-bar ${cls}" style="height:${h}px;width:100%"
             title="${esc(label)}: ${cnt} due assignments
${esc(detail + more)}">
        </div>
      </div>
      <div class="fc-month">${label}</div>
    `;
    chart.appendChild(wrap);
  });

  const filteredRows = months
    .flatMap(month => (fc[month] || []).map(row => ({...row, month})))
    .sort((a,b)=>String(a.due||'').localeCompare(String(b.due||'')) || String(a.client||'').localeCompare(String(b.client||'')) || String(a.key||'').localeCompare(String(b.key||'')));

  tbody.innerHTML = filteredRows.map(a => {
    const mDate = new Date((a.month || String(a.due || '').slice(0,7)) + '-01T00:00:00');
    const monthLabel = Number.isNaN(mDate.getTime()) ? '—' : mDate.toLocaleDateString('en-US',{month:'short',year:'numeric'});
    const key = a.key ? sowLink(a) : '<span style="color:var(--muted)">—</span>';
    const sow = a.sow ? `<div style="color:var(--muted);font-size:.72rem;margin-top:2px;max-width:320px">${esc(a.sow)}</div>` : '';
    const client = a.client ? `<button class="inline-filter" onclick='setForecastFilter("client", ${jsArg(a.client)})'>${esc(a.client)}</button>` : '<span style="color:var(--muted)">No client</span>';
    const assignee = a.assignee ? `<button class="inline-filter" onclick='setForecastFilter("assignee", ${jsArg(a.assignee)})'>${esc(a.assignee)}</button>` : '<span style="color:var(--muted)">Unassigned</span>';
    return `<tr>
      <td style="white-space:nowrap"><span class="${a.due ? expCls(a.due) : ''}">${fmtDate(a.due)}</span></td>
      <td style="font-weight:600;white-space:nowrap"><button class="inline-filter" onclick='setForecastFilter("month", ${jsArg(a.month || String(a.due || '').slice(0,7))})'>${monthLabel}</button></td>
      <td style="color:var(--txt);font-weight:600">${client}</td>
      <td style="white-space:nowrap">${assignee}</td>
      <td>${posChip(a.position)}</td>
      <td>${key}${sow}</td>
    </tr>`;
  }).join('');
}

window.setForecastFilter = setForecastFilter;
window.resetForecastFilters = resetForecastFilters;


// ════════════════════════════════════════════════════
// END
// ════════════════════════════════════════════════════
async function bootDashboard(){
  await loadCurrentUser();
  if(currentUser){
    await loadDashboardData();
    await resumeStoredAuthAction();
  }else{
    updateAuthUi();
  }
}
window.loginFromGate = loginFromGate;
window.startGoogleSignIn = startGoogleSignIn;
bootDashboard();
