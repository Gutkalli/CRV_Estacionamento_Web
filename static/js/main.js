/* CRV Parking Web - GitHub Pages (LocalStorage) */

const LS_KEY = "crv_parking_demo_v1";

const fmtMoney = (n) => (Number(n || 0)).toFixed(2).replace(".", ",");
const nowISO = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0,10);

function loadDB(){
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return seedDB();
  try { return JSON.parse(raw); } catch { return seedDB(); }
}
function saveDB(db){ localStorage.setItem(LS_KEY, JSON.stringify(db)); }

function seedDB(){
  const db = {
    settings: { totalSpots: 50 },
    users: [{ id: 1, username: "admin", password: "admin123" }],
    clients: [],
    vehicles: [],
    priceRules: [{
      id: 1, name: "Padrão", active: true,
      firstHourValue: 10.00,
      fractionMinutes: 15,
      fractionValue: 2.00,
      dailyMax: 30.00
    }],
    stays: [],
    cashShifts: [],
    payments: []
  };
  saveDB(db);
  return db;
}

function normalizePlate(p){
  return (p || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getOpenShift(db){
  return db.cashShifts.find(s => !s.closedAt) || null;
}

function pickRule(db){
  return db.priceRules.find(r => r.active) || null;
}

function calcAmount(rule, entryAtISO, exitAtISO){
  const entry = new Date(entryAtISO);
  const exit = new Date(exitAtISO);
  const diffMin = Math.max(1, Math.floor((exit - entry) / 60000));

  let amount = 0;
  let desc = "";

  if (diffMin <= 60){
    amount = Number(rule.firstHourValue);
    desc = `${rule.name}: até 1h`;
  } else {
    const extra = diffMin - 60;
    const fracMin = Number(rule.fractionMinutes || 15);
    const n = Math.ceil(extra / fracMin);
    amount = Number(rule.firstHourValue) + n * Number(rule.fractionValue);
    desc = `${rule.name}: 1h + ${n}x fração`;
  }
  if (rule.dailyMax != null && rule.dailyMax !== "" && amount > Number(rule.dailyMax)){
    amount = Number(rule.dailyMax);
    desc += " (teto diário)";
  }
  return { amount: Number(amount.toFixed(2)), desc, minutes: diffMin };
}

/* UI helpers */
const $ = (id) => document.getElementById(id);

function setLoggedUI(isLogged){
  const appRoot = $("appRoot");
  const overlay = $("loginOverlay");

  if (isLogged){
    overlay.classList.add("hidden");
    appRoot.classList.remove("hidden");
    document.body.classList.remove("no-scroll");
  } else {
    overlay.classList.remove("hidden");
    appRoot.classList.add("hidden");
    document.body.classList.add("no-scroll");
  }
}

function requireAuth(){
  const u = sessionStorage.getItem("crv_user");
  if (!u) {
    setLoggedUI(false);
    return false;
  }
  setLoggedUI(true);
  $("currentUser").textContent = u;
  return true;
}

function setActiveRoute(route){
  document.querySelectorAll(".nav-item").forEach(a => {
    a.classList.toggle("active", a.dataset.route === route);
  });
}

function showView(route){
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const view = $(`view-${route}`);
  if (view) view.classList.remove("hidden");

  const titleMap = {
    dashboard: "Dashboard",
    stays: "Entrada / Saída",
    clients: "Clientes",
    vehicles: "Veículos",
    prices: "Tabela de Preços",
    cash: "Caixa"
  };
  $("pageTitle").textContent = titleMap[route] || "Dashboard";
}

/* Render */
function renderDashboard(db){
  const open = db.stays.filter(s => !s.exitAt).length;
  const total = Number(db.settings.totalSpots || 50);
  const free = Math.max(total - open, 0);

  const today = todayKey();
  const paysToday = db.payments.filter(p => (p.paidAt || "").slice(0,10) === today);
  const revenue = paysToday.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const ticketAvg = paysToday.length ? revenue / paysToday.length : 0;

  const closedToday = db.stays.filter(s => s.exitAt && (s.exitAt.slice(0,10) === today));
  const avgMin = closedToday.length
    ? (closedToday.reduce((acc, s) => acc + Number(s.minutes || 0), 0) / closedToday.length)
    : 0;

  $("dashOpen").textContent = open;
  $("dashFree").textContent = free;
  $("dashTotal").textContent = total;
  $("dashRevenue").textContent = fmtMoney(revenue);
  $("dashAvg").textContent = fmtMoney(ticketAvg);
  $("dashAvgMin").textContent = Math.round(avgMin);

  $("totalSpotsInput").value = total;
}

function renderOpenStays(db){
  const list = $("openStaysList");
  list.innerHTML = "";
  const open = db.stays.filter(s => !s.exitAt).sort((a,b) => (b.entryAt.localeCompare(a.entryAt)));

  if (!open.length){
    list.innerHTML = `<div class="muted">Nenhum carro no pátio.</div>`;
    return;
  }

  open.forEach(s => {
    const v = db.vehicles.find(vv => vv.id === s.vehicleId);
    const plate = v?.plate || "???";
    const entry = new Date(s.entryAt).toLocaleString("pt-BR");
    const item = document.createElement("div");
    item.className = "tr";
    item.style.gridTemplateColumns = "1fr 2fr 1fr";
    item.innerHTML = `
      <div><b>${plate}</b></div>
      <div>${entry}</div>
      <div class="muted">Aberto</div>
    `;
    list.appendChild(item);
  });
}

function renderClients(db){
  const t = $("clientsTable");
  t.innerHTML = `<div class="tr head"><div>ID</div><div>Nome</div><div>Telefone</div><div>VIP</div><div>Ações</div></div>`;
  db.clients.slice().sort((a,b)=>b.id-a.id).forEach(c => {
    const row = document.createElement("div");
    row.className = "tr";
    row.innerHTML = `
      <div>${c.id}</div>
      <div>${c.name}</div>
      <div>${c.phone || "-"}</div>
      <div>${c.isVip ? "Sim" : "Não"}</div>
      <div><button class="btn btn-danger" data-del-client="${c.id}">Excluir</button></div>
    `;
    t.appendChild(row);
  });

  const sel = $("vClient");
  sel.innerHTML = `<option value="">Sem cliente</option>` + db.clients
    .slice().sort((a,b)=>a.name.localeCompare(b.name))
    .map(c => `<option value="${c.id}">${c.name}</option>`).join("");
}

function renderVehicles(db){
  const t = $("vehiclesTable");
  t.innerHTML = `<div class="tr head"><div>ID</div><div>Placa</div><div>Modelo</div><div>Cor</div><div>Cliente</div></div>`;
  db.vehicles.slice().sort((a,b)=>b.id-a.id).forEach(v => {
    const c = db.clients.find(cc => cc.id === v.clientId);
    const row = document.createElement("div");
    row.className = "tr";
    row.innerHTML = `
      <div>${v.id}</div>
      <div><b>${v.plate}</b></div>
      <div>${v.model || "-"}</div>
      <div>${v.color || "-"}</div>
      <div>${c ? c.name : "-"}</div>
    `;
    t.appendChild(row);
  });
}

function renderPrices(db){
  const t = $("pricesTable");
  t.innerHTML = `<div class="tr head"><div>Nome</div><div>1ª hora</div><div>Fração</div><div>Teto</div><div>Ativa</div></div>`;
  db.priceRules.slice().sort((a,b)=>b.id-a.id).forEach(r => {
    const row = document.createElement("div");
    row.className = "tr";
    row.innerHTML = `
      <div><b>${r.name}</b></div>
      <div>R$ ${fmtMoney(r.firstHourValue)}</div>
      <div>${r.fractionMinutes} min / R$ ${fmtMoney(r.fractionValue)}</div>
      <div>${(r.dailyMax != null && r.dailyMax !== "") ? ("R$ " + fmtMoney(r.dailyMax)) : "-"}</div>
      <div><button class="btn btn-ghost" data-toggle-rule="${r.id}">${r.active ? "Desativar" : "Ativar"}</button></div>
    `;
    t.appendChild(row);
  });
}

function renderCash(db){
  const shift = getOpenShift(db);
  $("cashStatus").textContent = shift
    ? `Status: ABERTO desde ${new Date(shift.openedAt).toLocaleString("pt-BR")}`
    : "Status: FECHADO (nenhum turno aberto)";

  const pays = shift
    ? db.payments.filter(p => p.cashShiftId === shift.id).slice().sort((a,b)=>b.paidAt.localeCompare(a.paidAt))
    : [];

  const total = pays.reduce((acc,p)=>acc+Number(p.amount||0),0);
  $("cashTotal").textContent = fmtMoney(total);

  const t = $("cashPaymentsTable");
  t.innerHTML = `<div class="tr head"><div>Data</div><div>Método</div><div>Valor</div><div>Placa</div><div>Regra</div></div>`;
  pays.forEach(p => {
    const stay = db.stays.find(s=>s.id===p.stayId);
    const v = db.vehicles.find(vv=>vv.id===stay?.vehicleId);
    const row = document.createElement("div");
    row.className="tr";
    row.innerHTML = `
      <div>${new Date(p.paidAt).toLocaleString("pt-BR")}</div>
      <div>${p.method}</div>
      <div>R$ ${fmtMoney(p.amount)}</div>
      <div>${v?.plate || "-"}</div>
      <div class="muted">${stay?.ruleDesc || "-"}</div>
    `;
    t.appendChild(row);
  });
}

function renderAll(){
  const db = loadDB();
  renderDashboard(db);
  renderOpenStays(db);
  renderClients(db);
  renderVehicles(db);
  renderPrices(db);
  renderCash(db);
}

/* Router */
function route(){
  if (!requireAuth()) return;

  const hash = (location.hash || "#dashboard").replace("#","");
  const allowed = ["dashboard","stays","clients","vehicles","prices","cash"];
  const routeName = allowed.includes(hash) ? hash : "dashboard";

  setActiveRoute(routeName);
  showView(routeName);
  renderAll();
}

window.addEventListener("hashchange", route);

/* Login */
$("loginForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  const user = $("loginUser").value.trim();
  const pass = $("loginPass").value;

  const ok = db.users.some(u => u.username === user && u.password === pass);
  const err = $("loginError");
  if (!ok){
    err.textContent = "Usuário ou senha inválidos";
    err.classList.remove("hidden");
    return;
  }
  err.classList.add("hidden");
  sessionStorage.setItem("crv_user", user);

  // depois do login, mostra app e renderiza
  setLoggedUI(true);
  route();
});

/* Logout */
$("logoutBtn").addEventListener("click", ()=>{
  sessionStorage.removeItem("crv_user");
  setLoggedUI(false);
});

/* Reset demo */
$("resetDemo").addEventListener("click", ()=>{
  localStorage.removeItem(LS_KEY);
  seedDB();
  sessionStorage.removeItem("crv_user");
  location.hash = "#dashboard";
  setLoggedUI(false);
});

/* Settings */
$("saveSettingsBtn").addEventListener("click", ()=>{
  const db = loadDB();
  const v = Number($("totalSpotsInput").value || 50);
  db.settings.totalSpots = Math.max(1, v);
  saveDB(db);
  renderDashboard(db);
});

/* Entrada */
$("enterForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  const plate = normalizePlate($("enterPlate").value);
  if (!plate) return;

  let vehicle = db.vehicles.find(v=>v.plate===plate);
  if (!vehicle){
    vehicle = { id: (db.vehicles.at(-1)?.id || 0) + 1, plate, model:"", color:"", clientId:null };
    db.vehicles.push(vehicle);
  }
  const open = db.stays.find(s=>s.vehicleId===vehicle.id && !s.exitAt);
  if (open){
    $("enterPlate").value = "";
    saveDB(db);
    renderOpenStays(db);
    renderDashboard(db);
    return;
  }

  db.stays.push({
    id: (db.stays.at(-1)?.id || 0) + 1,
    vehicleId: vehicle.id,
    entryAt: nowISO(),
    exitAt: null,
    minutes: null,
    amount: 0,
    ruleDesc: null
  });

  saveDB(db);
  $("enterPlate").value = "";
  renderOpenStays(db);
  renderDashboard(db);
});

/* Saída */
$("exitForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  const plate = normalizePlate($("exitPlate").value);
  const method = $("payMethod").value;

  const v = db.vehicles.find(vv=>vv.plate===plate);
  if (!v){ $("exitResult").textContent = "Placa não encontrada."; return; }

  const stay = db.stays.find(s=>s.vehicleId===v.id && !s.exitAt);
  if (!stay){ $("exitResult").textContent = "Não existe permanência aberta para essa placa."; return; }

  const rule = pickRule(db);
  if (!rule){ $("exitResult").textContent = "Nenhuma tabela de preço ativa."; return; }

  stay.exitAt = nowISO();
  const res = calcAmount(rule, stay.entryAt, stay.exitAt);
  stay.amount = res.amount;
  stay.minutes = res.minutes;
  stay.ruleDesc = res.desc;

  const shift = getOpenShift(db);
  db.payments.push({
    id: (db.payments.at(-1)?.id || 0) + 1,
    stayId: stay.id,
    paidAt: nowISO(),
    method,
    amount: res.amount,
    cashShiftId: shift ? shift.id : null
  });

  saveDB(db);
  $("exitResult").textContent = `Saída registrada. Total: R$ ${fmtMoney(res.amount)} — ${res.desc}`;
  $("exitPlate").value = "";

  renderOpenStays(db);
  renderDashboard(db);
  renderCash(db);
});

/* Clientes */
$("clientForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  db.clients.push({
    id: (db.clients.at(-1)?.id || 0) + 1,
    name: $("cName").value.trim(),
    phone: $("cPhone").value.trim(),
    notes: $("cNotes").value.trim(),
    isVip: $("cVip").value === "1"
  });
  saveDB(db);
  $("cName").value = ""; $("cPhone").value = ""; $("cNotes").value = ""; $("cVip").value = "0";
  renderClients(db);
});

document.addEventListener("click", (e)=>{
  const db = loadDB();

  const del = e.target?.dataset?.delClient;
  if (del){
    const id = Number(del);
    db.clients = db.clients.filter(c=>c.id!==id);
    db.vehicles.forEach(v => { if (v.clientId === id) v.clientId = null; });
    saveDB(db);
    renderClients(db);
    renderVehicles(db);
    return;
  }

  const toggle = e.target?.dataset?.toggleRule;
  if (toggle){
    const id = Number(toggle);
    const r = db.priceRules.find(rr=>rr.id===id);
    if (r) r.active = !r.active;
    saveDB(db);
    renderPrices(db);
    return;
  }
});

/* Veículos */
$("vehicleForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  const plate = normalizePlate($("vPlate").value);
  if (!plate) return;
  if (db.vehicles.some(v=>v.plate===plate)) return;

  db.vehicles.push({
    id: (db.vehicles.at(-1)?.id || 0) + 1,
    plate,
    model: $("vModel").value.trim(),
    color: $("vColor").value.trim(),
    clientId: $("vClient").value ? Number($("vClient").value) : null
  });

  saveDB(db);
  $("vPlate").value=""; $("vModel").value=""; $("vColor").value=""; $("vClient").value="";
  renderVehicles(db);
  renderClients(db);
});

/* Preços */
$("priceForm").addEventListener("submit", (e)=>{
  e.preventDefault();
  const db = loadDB();
  db.priceRules.push({
    id: (db.priceRules.at(-1)?.id || 0) + 1,
    name: $("pName").value.trim(),
    active: true,
    firstHourValue: Number($("pFirst").value || 0),
    fractionMinutes: Number($("pFracMin").value || 15),
    fractionValue: Number($("pFracVal").value || 0),
    dailyMax: $("pMax").value === "" ? null : Number($("pMax").value)
  });
  saveDB(db);
  $("pName").value=""; $("pFirst").value=""; $("pFracMin").value="15"; $("pFracVal").value="2.00"; $("pMax").value="";
  renderPrices(db);
});

/* Caixa */
$("openCashBtn").addEventListener("click", ()=>{
  const db = loadDB();
  if (getOpenShift(db)) return;
  db.cashShifts.push({
    id: (db.cashShifts.at(-1)?.id || 0) + 1,
    openedAt: nowISO(),
    closedAt: null,
    initialAmount: Number($("cashInitial").value || 0)
  });
  saveDB(db);
  $("cashInitial").value = "";
  renderCash(db);
});

$("closeCashBtn").addEventListener("click", ()=>{
  const db = loadDB();
  const shift = getOpenShift(db);
  if (!shift) return;
  shift.closedAt = nowISO();
  saveDB(db);
  renderCash(db);
});

/* Export CSV */
$("exportBtn").addEventListener("click", ()=>{
  const db = loadDB();
  const rows = [["paidAt","method","amount","plate","entryAt","exitAt","ruleDesc"].join(";")];
  db.payments.forEach(p=>{
    const s = db.stays.find(x=>x.id===p.stayId);
    const v = db.vehicles.find(x=>x.id===s?.vehicleId);
    rows.push([
      p.paidAt, p.method, p.amount,
      v?.plate || "",
      s?.entryAt || "",
      s?.exitAt || "",
      (s?.ruleDesc || "").replaceAll(";", ",")
    ].join(";"));
  });

  const blob = new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "crv_parking_export.csv";
  a.click();
  URL.revokeObjectURL(url);
});

/* init */
(function init(){
  loadDB();
  if (!location.hash) location.hash = "#dashboard";
  route();
})();
