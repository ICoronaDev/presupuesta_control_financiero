const DEMO_EMAIL = "demo@presupuesta.mx";
const DEMO_PASSWORD = "Presupuesta123!";
const KEYS = { session: "presupuesta_demo_session_v2", data: "presupuesta_demo_data_v2" };
const DEFAULT_CATEGORIES = [
  {name:"Alimentación",type:"expense",builtIn:true},{name:"Transporte",type:"expense",builtIn:true},
  {name:"Servicios",type:"expense",builtIn:true},{name:"Educación",type:"expense",builtIn:true},
  {name:"Entretenimiento",type:"expense",builtIn:true},{name:"Salario",type:"income",builtIn:true},
  {name:"Ventas",type:"income",builtIn:true},{name:"Otros",type:"both",builtIn:true}
];
const DEFAULT_BUDGETS = {"Alimentación":2500,"Transporte":1000,"Servicios":1500,"Educación":1200,"Entretenimiento":800,"Otros":1000};
const TITLES = {
  dashboard:["Resumen financiero","Una vista clara de tu dinero."],
  transactions:["Ingresos y gastos","Registra y organiza cada movimiento."],
  categories:["Categorías","Clasifica tus ingresos y gastos a tu manera."],
  budgets:["Presupuestos","Define límites y mantén tus gastos bajo control."],
  reports:["Informes y exportación","Consulta tus resultados y exporta tus datos."]
};
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:2});
let currentView = "dashboard";
let toastTimer = null;
let state = loadState();

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function loadState(){
  try {
    const raw = localStorage.getItem(KEYS.data);
    if(raw){ const data=JSON.parse(raw); return {transactions:Array.isArray(data.transactions)?data.transactions:[],categories:Array.isArray(data.categories)?data.categories:clone(DEFAULT_CATEGORIES),budgets:data.budgets&&typeof data.budgets==="object"?data.budgets:clone(DEFAULT_BUDGETS)}; }
  } catch(e) {}
  return {transactions:[],categories:clone(DEFAULT_CATEGORIES),budgets:clone(DEFAULT_BUDGETS)};
}
function saveState(){ localStorage.setItem(KEYS.data,JSON.stringify(state)); }
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function monthStart(){return `${todayISO().slice(0,7)}-01`;}
function monthEnd(){return todayISO().slice(0,7)+"-"+String(new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()).padStart(2,"0");}
function fmt(value){return money.format(Number(value)||0);}
function toast(message){const node=$("toast");node.textContent=message;node.classList.remove("hidden");clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.add("hidden"),3200);}
function showMessage(id,message,isError=false){const el=$(id);if(!el)return;el.textContent=message;el.classList.toggle("error",isError);}
function inRange(item,from,to){return (!from||item.date>=from)&&(!to||item.date<=to);}
function sum(items,type){return items.filter(x=>!type||x.type===type).reduce((total,x)=>total+x.amount,0);}
function categoryTypeLabel(type){return type==="income"?"Ingresos":type==="expense"?"Gastos":"Ingresos y gastos";}
function categoriesFor(type){return state.categories.filter(c=>c.type==="both"||c.type===type);}
function refreshCategorySelects(){
  const transactionType=$("transactionType")?.value||"expense";
  const txOptions=categoriesFor(transactionType);
  $("transactionCategory").innerHTML=txOptions.map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  const expenseCategories=state.categories.filter(c=>c.type!=="income");
  $("budgetCategory").innerHTML=expenseCategories.map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  if(!$("transactionCategory").options.length)$("transactionCategory").innerHTML='<option value="">Crea una categoría primero</option>';
  if(!$("budgetCategory").options.length)$("budgetCategory").innerHTML='<option value="">Crea una categoría de gastos</option>';
}
function navigate(view){
  if(!TITLES[view])return;
  currentView=view;
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id===`view-${view}`));
  document.querySelectorAll(".nav-link").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  $("pageTitle").textContent=TITLES[view][0];$("pageSubtitle").textContent=TITLES[view][1];
  if(view==="reports")renderReport();
  if(view==="categories")renderCategories();
  if(view==="budgets")renderBudgets();
  if(view==="transactions")renderTransactions();
  window.scrollTo({top:0,behavior:"smooth"});
}
function startApp(email){
  $("loginScreen").classList.add("hidden");$("appShell").classList.remove("hidden");
  $("sidebarEmail").textContent=email;$("loginMessage").textContent="";
  const session={email,startedAt:Date.now()};sessionStorage.setItem(KEYS.session,JSON.stringify(session));
  refreshCategorySelects();setDefaultDates();renderAll();navigate("dashboard");
}
function logout(){sessionStorage.removeItem(KEYS.session);$("appShell").classList.add("hidden");$("loginScreen").classList.remove("hidden");$("loginPassword").value="";showMessage("loginMessage","Has cerrado la sesión.");}
function setDefaultDates(){
  $("transactionDate").value=todayISO();
  $("summaryFrom").value=monthStart();$("summaryTo").value=monthEnd();
  $("reportFrom").value=monthStart();$("reportTo").value=monthEnd();
}
function renderAll(){renderDashboard();renderTransactions();renderCategories();renderBudgets();renderReport();}
function getSummaryTransactions(){return state.transactions.filter(x=>inRange(x,$("summaryFrom").value,$("summaryTo").value));}
function renderDashboard(){
  const items=getSummaryTransactions(),income=sum(items,"income"),expense=sum(items,"expense"),balance=income-expense;
  $("totalIncome").textContent=fmt(income);$("totalExpense").textContent=fmt(expense);$("balance").textContent=fmt(balance);
  $("balance").classList.toggle("negative",balance<0);$("balance").classList.toggle("positive",balance>=0);
  const budgetedExpense=items.filter(x=>x.type==="expense"&&Object.hasOwn(state.budgets,x.category)).reduce((t,x)=>t+x.amount,0);
  $("budgetUsed").textContent=fmt(budgetedExpense);$("budgetFoot").textContent=`${items.filter(x=>x.type==="expense").length} gastos en el período`;
  renderCategoryChart(items);renderBudgetPreview();renderRecent();
  const alerts=budgetAlerts();const center=$("alertCenter");
  if(!alerts.length){center.classList.add("hidden");center.classList.remove("danger");center.textContent="";}
  else{center.classList.remove("hidden");const danger=alerts.some(a=>a.status==="danger");center.classList.toggle("danger",danger);center.textContent="Avisos de presupuesto: "+alerts.map(a=>`${a.category}: ${a.message}`).join(" · ");}
}
function renderCategoryChart(items){
  const expenses=items.filter(x=>x.type==="expense"),groups={};
  expenses.forEach(x=>groups[x.category]=(groups[x.category]||0)+x.amount);
  const entries=Object.entries(groups).sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...entries.map(x=>x[1]));
  $("categoryChart").innerHTML=entries.length?entries.map(([name,value])=>`<div class="chart-line"><div class="chart-labels"><strong>${escapeHtml(name)}</strong><span>${fmt(value)}</span></div><div class="progress-track"><div class="progress-fill normal" style="width:${value/max*100}%"></div></div></div>`).join(""):'<div class="empty-state">No hay gastos en este período.<br>Agrega un movimiento para ver la distribución.</div>';
}
function budgetStats(category){
  const limit=Number(state.budgets[category])||0;
  const spent=state.transactions.filter(x=>x.type==="expense"&&x.category===category&&x.date.startsWith(todayISO().slice(0,7))).reduce((t,x)=>t+x.amount,0);
  const pct=limit>0?spent/limit*100:0;
  let status="normal",message=`${fmt(Math.max(0,limit-spent))} disponibles de ${fmt(limit)}`;
  if(pct>=100){status="danger";message=`Límite alcanzado o superado por ${fmt(Math.max(0,spent-limit))}`;}
  else if(pct>=80){status="warning";message=`Atención: llevas usado el ${Math.round(pct)}% del presupuesto`;}
  return {limit,spent,pct,status,message};
}
function budgetAlerts(){return Object.keys(state.budgets).map(category=>({category,...budgetStats(category)})).filter(x=>x.limit>0&&x.status!=="normal");}
function budgetMarkup(category){
  const s=budgetStats(category);
  return `<div class="budget-item"><div class="budget-topline"><span class="budget-name">${escapeHtml(category)}</span><span class="budget-amount">${fmt(s.spent)} / ${fmt(s.limit)}</span></div><div class="progress-track" role="progressbar" aria-label="Presupuesto de ${escapeHtml(category)}" aria-valuemin="0" aria-valuemax="${s.limit}" aria-valuenow="${Math.min(s.spent,s.limit)}"><div class="progress-fill ${s.status}" style="width:${Math.min(s.pct,100)}%"></div></div><p class="budget-status ${s.status}">${s.message}</p></div>`;
}
function renderBudgetPreview(){
  const keys=Object.keys(state.budgets).slice(0,5);
  $("budgetPreview").innerHTML=keys.length?keys.map(budgetMarkup).join(""):'<div class="empty-state">Todavía no has definido presupuestos.</div>';
}
function renderRecent(){
  const rows=[...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  $("recentRows").innerHTML=rows.length?rows.map(x=>`<tr><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.date)}</td><td><span class="type-pill ${x.type}">${x.type==="income"?"Ingreso":"Gasto"}</span></td><td class="right ${x.type==="income"?"amount-income":"amount-expense"}">${x.type==="income"?"+":"−"}${fmt(x.amount)}</td></tr>`).join(""):'<tr><td colspan="5" class="empty-state">No hay movimientos todavía.</td></tr>';
}
function renderTransactions(){
  const query=($("transactionSearch").value||"").trim().toLocaleLowerCase("es-MX");
  const type=$("transactionTypeFilter").value,from=$("transactionFrom").value,to=$("transactionTo").value;
  const items=[...state.transactions].filter(x=>(type==="all"||x.type===type)&&inRange(x,from,to)&&(`${x.description} ${x.category}`.toLocaleLowerCase("es-MX").includes(query))).sort((a,b)=>b.date.localeCompare(a.date));
  $("transactionRows").innerHTML=items.length?items.map(x=>`<tr><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.date)}</td><td><span class="type-pill ${x.type}">${x.type==="income"?"Ingreso":"Gasto"}</span></td><td class="right ${x.type==="income"?"amount-income":"amount-expense"}">${x.type==="income"?"+":"−"}${fmt(x.amount)}</td><td><div class="row-actions"><button class="icon-button" data-edit="${escapeHtml(x.id)}" type="button">Editar</button><button class="icon-button delete" data-delete="${escapeHtml(x.id)}" type="button">Borrar</button></div></td></tr>`).join(""):'<tr><td colspan="6" class="empty-state">No se encontraron movimientos con esos filtros.</td></tr>';
}
function renderCategories(){
  $("categoryList").innerHTML=state.categories.map(c=>{
    const count=state.transactions.filter(t=>t.category===c.name).length;
    return `<div class="category-card"><span class="category-dot"></span><div class="category-card-main"><strong>${escapeHtml(c.name)}</strong><span>${categoryTypeLabel(c.type)} · ${count} movimiento(s)${c.builtIn?" · Predeterminada":""}</span></div>${c.builtIn?"":`<button class="category-delete" data-delete-category="${escapeHtml(c.name)}" type="button">Eliminar</button>`}</div>`;
  }).join("");
}
function renderBudgets(){
  const keys=Object.keys(state.budgets);
  $("budgetList").innerHTML=keys.length?keys.map(category=>`${budgetMarkup(category)}<div class="budget-manage-row"><span class="muted small">Límite mensual: ${fmt(state.budgets[category])}</span><button class="icon-button delete" type="button" data-delete-budget="${escapeHtml(category)}">Eliminar presupuesto</button></div>`).join(""):'<div class="empty-state">Aún no hay presupuestos. Usa el formulario para crear uno.</div>';
}
function reportItems(){return state.transactions.filter(x=>inRange(x,$("reportFrom").value,$("reportTo").value));}
function renderReport(){
  if(!$("reportRows"))return;
  const items=reportItems(),income=sum(items,"income"),expense=sum(items,"expense");
  $("reportSummary").innerHTML=`<div class="report-stat"><span>Ingresos del período</span><strong class="positive">${fmt(income)}</strong></div><div class="report-stat"><span>Gastos del período</span><strong class="negative">${fmt(expense)}</strong></div><div class="report-stat"><span>Balance del período</span><strong>${fmt(income-expense)}</strong></div>`;
  const names=[...new Set([...state.categories.map(c=>c.name),...items.map(x=>x.category)])];
  const rows=names.map(name=>({name,income:sum(items.filter(x=>x.category===name),"income"),expense:sum(items.filter(x=>x.category===name),"expense")})).filter(x=>x.income||x.expense);
  $("reportRows").innerHTML=rows.length?rows.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td class="right amount-income">${fmt(x.income)}</td><td class="right amount-expense">${fmt(x.expense)}</td><td class="right">${fmt(x.income-x.expense)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty-state">No hay movimientos en el período seleccionado.</td></tr>';
}
function resetTransactionForm(){
  $("transactionForm").reset();$("transactionId").value="";$("transactionDate").value=todayISO();
  $("transactionFormTitle").textContent="Agregar movimiento";$("saveTransaction").textContent="Guardar movimiento";$("cancelEdit").classList.add("hidden");refreshCategorySelects();
}
function exportCsv(items,filename){
  const rows=[["Descripción","Fecha","Tipo","Categoría","Cantidad (MXN)"],...items.map(x=>[x.description,x.date,x.type==="income"?"Ingreso":"Gasto",x.category,x.amount.toFixed(2)])];
  const csv="\uFEFF"+rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);toast("Archivo CSV preparado para descargar.");
}
function dateFilename(){return todayISO();}
function handleTransactionSubmit(event){
  event.preventDefault();
  const id=$("transactionId").value,description=$("transactionDescription").value.trim(),amount=Number($("transactionAmount").value),date=$("transactionDate").value,type=$("transactionType").value,category=$("transactionCategory").value;
  if(!description||!date||!category||!Number.isFinite(amount)||amount<=0){showMessage("transactionMessage","Completa todos los campos y usa una cantidad mayor que cero.",true);return;}
  const existing=state.transactions.find(x=>x.id===id);
  const item={id:id||`${Date.now()}-${Math.random().toString(16).slice(2)}`,description,amount,date,type,category};
  if(existing)state.transactions=state.transactions.map(x=>x.id===id?item:x);else state.transactions.push(item);
  saveState();resetTransactionForm();renderAll();showMessage("transactionMessage",existing?"Movimiento actualizado.":"Movimiento agregado correctamente.");toast(existing?"Movimiento actualizado.":"Movimiento guardado.");
}
function editTransaction(id){
  const item=state.transactions.find(x=>x.id===id);if(!item)return;
  navigate("transactions");$("transactionId").value=item.id;$("transactionType").value=item.type;refreshCategorySelects();
  $("transactionDescription").value=item.description;$("transactionAmount").value=item.amount;$("transactionDate").value=item.date;$("transactionCategory").value=item.category;
  $("transactionFormTitle").textContent="Editar movimiento";$("saveTransaction").textContent="Guardar cambios";$("cancelEdit").classList.remove("hidden");$("transactionDescription").focus();
}
function deleteTransaction(id){
  const item=state.transactions.find(x=>x.id===id);if(!item)return;
  if(!confirm(`¿Quieres borrar el movimiento "${item.description}"?`))return;
  state.transactions=state.transactions.filter(x=>x.id!==id);saveState();renderAll();toast("Movimiento eliminado.");
}
function addCategory(event){
  event.preventDefault();const name=$("categoryName").value.trim(),type=$("categoryType").value;
  if(!name){showMessage("categoryMessage","Escribe un nombre para la categoría.",true);return;}
  if(state.categories.some(c=>c.name.toLocaleLowerCase("es-MX")===name.toLocaleLowerCase("es-MX"))){showMessage("categoryMessage","Ya existe una categoría con ese nombre.",true);return;}
  state.categories.push({name,type,builtIn:false});saveState();$("categoryForm").reset();refreshCategorySelects();renderCategories();renderBudgets();renderDashboard();showMessage("categoryMessage","Categoría creada correctamente.");toast("Categoría agregada.");
}
function deleteCategory(name){
  if(state.transactions.some(t=>t.category===name)){toast("No puedes borrar una categoría que tiene movimientos asociados.");return;}
  if(Object.hasOwn(state.budgets,name)){toast("Primero elimina el presupuesto asociado a esta categoría.");return;}
  if(!confirm(`¿Eliminar la categoría "${name}"?`))return;
  state.categories=state.categories.filter(c=>c.name!==name);saveState();refreshCategorySelects();renderCategories();renderDashboard();toast("Categoría eliminada.");
}
function saveBudget(event){
  event.preventDefault();const category=$("budgetCategory").value,limit=Number($("budgetLimit").value);
  if(!category||!Number.isFinite(limit)||limit<=0){showMessage("budgetMessage","Selecciona una categoría y escribe un límite mayor que cero.",true);return;}
  state.budgets[category]=limit;saveState();$("budgetLimit").value="";renderBudgets();renderDashboard();showMessage("budgetMessage",`Presupuesto de ${category} guardado.`);toast("Presupuesto actualizado.");
}
function deleteBudget(category){
  if(!confirm(`¿Eliminar el presupuesto de "${category}"?`))return;
  delete state.budgets[category];saveState();renderBudgets();renderDashboard();toast("Presupuesto eliminado.");
}
function applySummary(){renderDashboard();}
function resetSummary(){ $("summaryFrom").value=monthStart();$("summaryTo").value=monthEnd();renderDashboard();}
function resetTransactionFilters(){$("transactionSearch").value="";$("transactionTypeFilter").value="all";$("transactionFrom").value="";$("transactionTo").value="";renderTransactions();}
function bindEvents(){
  $("loginForm").addEventListener("submit",e=>{e.preventDefault();const email=$("loginEmail").value.trim().toLowerCase(),password=$("loginPassword").value;if(email===DEMO_EMAIL&&password===DEMO_PASSWORD)startApp(email);else showMessage("loginMessage","Datos incorrectos. Usa la cuenta de demostración indicada abajo.",true);});
  $("fillDemo").addEventListener("click",()=>{$("loginEmail").value=DEMO_EMAIL;$("loginPassword").value=DEMO_PASSWORD;showMessage("loginMessage","Datos de demostración completados.");});
  $("logoutButton").addEventListener("click",logout);
  $("mainNav").addEventListener("click",e=>{const button=e.target.closest("[data-view]");if(button)navigate(button.dataset.view);});
  document.body.addEventListener("click",e=>{const go=e.target.closest("[data-go]");if(go)navigate(go.dataset.go);});
  $("quickAdd").addEventListener("click",()=>{navigate("transactions");resetTransactionForm();$("transactionDescription").focus();});
  $("transactionType").addEventListener("change",refreshCategorySelects);
  $("transactionForm").addEventListener("submit",handleTransactionSubmit);
  $("cancelEdit").addEventListener("click",resetTransactionForm);
  $("transactionRows").addEventListener("click",e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit)editTransaction(edit.dataset.edit);if(del)deleteTransaction(del.dataset.delete);});
  $("transactionSearch").addEventListener("input",renderTransactions);$("transactionTypeFilter").addEventListener("change",renderTransactions);$("transactionFrom").addEventListener("change",renderTransactions);$("transactionTo").addEventListener("change",renderTransactions);
  $("clearTransactionFilters").addEventListener("click",resetTransactionFilters);
  $("exportTransactions").addEventListener("click",()=>exportCsv([...state.transactions].sort((a,b)=>b.date.localeCompare(a.date)),`presupuesta-movimientos-${dateFilename()}.csv`));
  $("categoryForm").addEventListener("submit",addCategory);
  $("categoryList").addEventListener("click",e=>{const btn=e.target.closest("[data-delete-category]");if(btn)deleteCategory(btn.dataset.deleteCategory);});
  $("budgetForm").addEventListener("submit",saveBudget);
  $("budgetList").addEventListener("click",e=>{const btn=e.target.closest("[data-delete-budget]");if(btn)deleteBudget(btn.dataset.deleteBudget);});
  $("applySummaryFilter").addEventListener("click",applySummary);$("resetSummaryFilter").addEventListener("click",resetSummary);
  $("generateReport").addEventListener("click",renderReport);
  $("exportCsv").addEventListener("click",()=>exportCsv(reportItems(),`presupuesta-informe-${dateFilename()}.csv`));
  $("exportPdf").addEventListener("click",()=>{navigate("reports");window.print();});
}
function init(){
  bindEvents();setDefaultDates();refreshCategorySelects();
  try{const session=JSON.parse(sessionStorage.getItem(KEYS.session)||"null");if(session?.email===DEMO_EMAIL)startApp(session.email);}catch(e){}
}
init();
