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
let state = {transactions:[],categories:[],budgets:{}};
let currentUser = null;

// ---------- "Servidor" local: cuentas y datos guardados en este navegador ----------
const LS = {users:"presupuesta.users",session:"presupuesta.session",data:id=>`presupuesta.data.${id}`};
const DEFAULT_CATEGORIES = [
  {name:"Alimentación",type:"expense"},{name:"Transporte",type:"expense"},{name:"Servicios",type:"expense"},{name:"Educación",type:"expense"},
  {name:"Entretenimiento",type:"expense"},{name:"Salario",type:"income"},{name:"Ventas",type:"income"},{name:"Otros",type:"both"}
];
function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v===null||v===undefined?fallback:v;}catch(e){return fallback;}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){throw new Error("No se pudo guardar en el navegador (almacenamiento lleno o bloqueado).");}}
function toHex(buffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function fromHex(hex){return new Uint8Array(hex.match(/../g).map(x=>parseInt(x,16)));}
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
async function hashPassword(password,saltHex){
  if(!(window.crypto&&window.crypto.subtle))throw new Error("Tu navegador no permite cifrar contraseñas aquí. Prueba con Chrome, Edge o Firefox actualizados.");
  const salt=saltHex?fromHex(saltHex):window.crypto.getRandomValues(new Uint8Array(16));
  const key=await window.crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await window.crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},key,256);
  return {salt:toHex(salt),hash:toHex(bits)};
}
function failWith(message,status=400){const e=new Error(message);e.status=status;throw e;}
function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function parseTransactionInput(body,data){
  const description=String(body.description||"").trim(),amount=Number(body.amount),date=String(body.date||""),type=body.type,category=String(body.category||"");
  if(!description||description.length>100)failWith("La descripción es obligatoria (máximo 100 caracteres).");
  if(!Number.isFinite(amount)||amount<=0||amount>999999999)failWith("Escribe una cantidad mayor que cero.");
  if(!validDate(date))failWith("La fecha no es válida.");
  if(type!=="income"&&type!=="expense")failWith("El tipo debe ser ingreso o gasto.");
  const cat=data.categories.find(c=>c.name===category);
  if(!cat)failWith("La categoría no existe.");
  if(cat.type!=="both"&&cat.type!==type)failWith("Esa categoría no es válida para este tipo de movimiento.");
  return {description,amount:Math.round(amount*100)/100,date,type,category};
}

async function api(path,options={}){
  const method=options.method||"GET",body=options.body||{};
  const users=readJson(LS.users,[]);
  const publicUser=u=>({id:u.id,name:u.name,email:u.email});

  if(path==="/auth/register"&&method==="POST"){
    const name=String(body.name||"").trim().replace(/\s+/g," "),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
    if(name.length<2||name.length>80)failWith("Escribe tu nombre (entre 2 y 80 caracteres).");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||email.length>120)failWith("Escribe un correo electrónico válido.");
    if(password.length<8||password.length>72||!/[A-Za-z]/.test(password)||!/\d/.test(password))failWith("La contraseña debe tener entre 8 y 72 caracteres, con letras y números.");
    if(users.some(u=>u.email===email))failWith("Ya existe una cuenta con ese correo. Inicia sesión.",409);
    const {salt,hash}=await hashPassword(password);
    const user={id:newId(),name,email,salt,hash};
    users.push(user);writeJson(LS.users,users);
    writeJson(LS.data(user.id),{categories:DEFAULT_CATEGORIES.map(c=>({...c,builtIn:true})),transactions:[],budgets:{}});
    sessionStorage.setItem(LS.session,user.id);
    return {user:publicUser(user)};
  }
  if(path==="/auth/login"&&method==="POST"){
    const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
    const user=users.find(u=>u.email===email);
    const attempt=await hashPassword(password,user?user.salt:null);
    if(!user||attempt.hash!==user.hash)failWith("Correo o contraseña incorrectos.",401);
    sessionStorage.setItem(LS.session,user.id);
    return {user:publicUser(user)};
  }
  if(path==="/auth/logout"){sessionStorage.removeItem(LS.session);return {ok:true};}

  const user=users.find(u=>u.id===sessionStorage.getItem(LS.session));
  if(!user){
    if(!path.startsWith("/auth/"))showLogin("Tu sesión expiró. Inicia sesión de nuevo.",true);
    failWith("Inicia sesión para continuar.",401);
  }
  if(path==="/auth/me")return {user:publicUser(user)};

  const data=readJson(LS.data(user.id),{categories:[],transactions:[],budgets:{}});
  const save=()=>writeJson(LS.data(user.id),data);
  let m;

  if(path==="/data"&&method==="GET")return data;

  if(path==="/transactions"&&method==="POST"){
    const item={id:newId(),...parseTransactionInput(body,data)};
    data.transactions.push(item);save();return item;
  }
  if((m=path.match(/^\/transactions\/([^/]+)$/))){
    const id=decodeURIComponent(m[1]),index=data.transactions.findIndex(t=>t.id===id);
    if(index<0)failWith("El movimiento no existe.",404);
    if(method==="PUT"){data.transactions[index]={id,...parseTransactionInput(body,data)};save();return data.transactions[index];}
    if(method==="DELETE"){data.transactions.splice(index,1);save();return {ok:true};}
  }
  if(path==="/categories"&&method==="POST"){
    const name=String(body.name||"").trim(),type=body.type;
    if(!name||name.length>35)failWith("El nombre es obligatorio (máximo 35 caracteres).");
    if(!["income","expense","both"].includes(type))failWith("El tipo de categoría no es válido.");
    if(data.categories.some(c=>c.name.toLocaleLowerCase("es-MX")===name.toLocaleLowerCase("es-MX")))failWith("Ya existe una categoría con ese nombre.",409);
    const created={name,type,builtIn:false};data.categories.push(created);save();return created;
  }
  if((m=path.match(/^\/categories\/([^/]+)$/))&&method==="DELETE"){
    const name=decodeURIComponent(m[1]),cat=data.categories.find(c=>c.name===name);
    if(!cat)failWith("La categoría no existe.",404);
    if(cat.builtIn)failWith("Las categorías predeterminadas no se pueden eliminar.");
    if(data.transactions.some(t=>t.category===name))failWith("No puedes borrar una categoría que tiene movimientos asociados.",409);
    if(Object.hasOwn(data.budgets,name))failWith("Primero elimina el presupuesto asociado a esta categoría.",409);
    data.categories=data.categories.filter(c=>c.name!==name);save();return {ok:true};
  }
  if((m=path.match(/^\/budgets\/([^/]+)$/))){
    const name=decodeURIComponent(m[1]),cat=data.categories.find(c=>c.name===name);
    if(method==="PUT"){
      const limit=Number(body.limit);
      if(!Number.isFinite(limit)||limit<=0||limit>999999999)failWith("Escribe un límite mayor que cero.");
      if(!cat)failWith("La categoría no existe.",404);
      if(cat.type==="income")failWith("Solo puedes presupuestar categorías de gastos.");
      data.budgets[name]=Math.round(limit*100)/100;save();return {category:name,limit:data.budgets[name]};
    }
    if(method==="DELETE"){
      if(!Object.hasOwn(data.budgets,name))failWith("El presupuesto no existe.",404);
      delete data.budgets[name];save();return {ok:true};
    }
  }
  failWith("Ruta no encontrada.",404);
}

async function loadState(){
  const data = await api("/data");
  state = {transactions:data.transactions, categories:data.categories, budgets:data.budgets};
}
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
async function startApp(user){
  currentUser = user;
  try{ await loadState(); }catch(err){ showMessage("loginMessage", err.message, true); return; }
  $("loginScreen").classList.add("hidden");$("appShell").classList.remove("hidden");
  $("sidebarEmail").textContent=user.email;$("sidebarName").textContent=user.name;
  $("avatarInitial").textContent=(user.name||"?").trim().charAt(0).toUpperCase();
  showMessage("loginMessage","");showMessage("registerMessage","");
  refreshCategorySelects();setDefaultDates();renderAll();navigate("dashboard");
}
function showAuthMode(mode){
  $("loginPane").classList.toggle("hidden",mode!=="login");
  $("registerPane").classList.toggle("hidden",mode!=="register");
}
function showLogin(message,isError=false){
  currentUser=null;state={transactions:[],categories:[],budgets:{}};
  $("appShell").classList.add("hidden");$("loginScreen").classList.remove("hidden");
  $("loginPassword").value="";showAuthMode("login");showMessage("loginMessage",message||"",isError);
}
async function logout(){ try{ await api("/auth/logout",{method:"POST"}); }catch(e){} showLogin("Has cerrado la sesión."); }
function setDefaultDates(){
  $("transactionDate").value=todayISO();
  $("summaryFrom").value=monthStart();$("summaryTo").value=monthEnd();
  $("reportFrom").value=monthStart();$("reportTo").value=monthEnd();
}
function renderAll(){renderTotals();renderDashboard();renderTransactions();renderCategories();renderBudgets();renderReport();}
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
function compareIds(a,b){
  const bothNumeric=/^\d+$/.test(a)&&/^\d+$/.test(b);
  return bothNumeric?Number(a)-Number(b):String(a).localeCompare(String(b));
}
function roundMoney(value){return Math.round(value*100)/100;}
// Saldo acumulado después de cada movimiento (en orden cronológico, con todos los movimientos).
function runningBalances(){
  let total=0;const map=new Map();
  [...state.transactions].sort((a,b)=>a.date.localeCompare(b.date)||compareIds(a.id,b.id)).forEach(x=>{
    total=roundMoney(total+(x.type==="income"?x.amount:-x.amount));map.set(x.id,total);
  });
  return map;
}
// Saldo total en vivo: se recalcula cada vez que cambia algún movimiento.
function renderTotals(){
  const income=roundMoney(sum(state.transactions,"income")),expense=roundMoney(sum(state.transactions,"expense")),balance=roundMoney(income-expense);
  document.querySelectorAll('[data-total="income"]').forEach(el=>{el.textContent=fmt(income);});
  document.querySelectorAll('[data-total="expense"]').forEach(el=>{el.textContent=fmt(expense);});
  document.querySelectorAll('[data-total="balance"]').forEach(el=>{
    const text=fmt(balance),changed=el.textContent!==text&&el.dataset.ready==="1";
    el.textContent=text;el.dataset.ready="1";
    el.classList.toggle("negative",balance<0);
    if(changed){el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash");}
  });
}
function renderTransactions(){
  const query=($("transactionSearch").value||"").trim().toLocaleLowerCase("es-MX");
  const type=$("transactionTypeFilter").value,from=$("transactionFrom").value,to=$("transactionTo").value;
  const balances=runningBalances();
  const items=[...state.transactions].filter(x=>(type==="all"||x.type===type)&&inRange(x,from,to)&&(`${x.description} ${x.category}`.toLocaleLowerCase("es-MX").includes(query))).sort((a,b)=>b.date.localeCompare(a.date)||compareIds(b.id,a.id));
  $("transactionRows").innerHTML=items.length?items.map(x=>{
    const after=balances.get(x.id)||0;
    return `<tr><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.date)}</td><td><span class="type-pill ${x.type}">${x.type==="income"?"Ingreso":"Gasto"}</span></td><td class="right ${x.type==="income"?"amount-income":"amount-expense"}">${x.type==="income"?"+":"−"}${fmt(x.amount)}</td><td class="right balance-cell${after<0?" negative":""}">${fmt(after)}</td><td><div class="row-actions"><button class="icon-button" data-edit="${escapeHtml(x.id)}" type="button">Editar</button><button class="icon-button delete" data-delete="${escapeHtml(x.id)}" type="button">Borrar</button></div></td></tr>`;
  }).join(""):'<tr><td colspan="7" class="empty-state">No se encontraron movimientos con esos filtros.</td></tr>';
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
function csvSafe(value){const text=String(value);return /^[=+\-@\t\r]/.test(text)?"'"+text:text;}
function exportCsv(items,filename){
  const rows=[["Descripción","Fecha","Tipo","Categoría","Cantidad (MXN)"],...items.map(x=>[csvSafe(x.description),x.date,x.type==="income"?"Ingreso":"Gasto",csvSafe(x.category),x.amount.toFixed(2)])];
  const csv="\uFEFF"+rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);toast("Archivo CSV preparado para descargar.");
}
function dateFilename(){return todayISO();}
async function handleTransactionSubmit(event){
  event.preventDefault();
  const id=$("transactionId").value,description=$("transactionDescription").value.trim(),amount=Number($("transactionAmount").value),date=$("transactionDate").value,type=$("transactionType").value,category=$("transactionCategory").value;
  if(!description||!date||!category||!Number.isFinite(amount)||amount<=0){showMessage("transactionMessage","Completa todos los campos y usa una cantidad mayor que cero.",true);return;}
  const isEdit=Boolean(id);
  try{
    const saved=await api(isEdit?`/transactions/${encodeURIComponent(id)}`:"/transactions",{method:isEdit?"PUT":"POST",body:{description,amount,date,type,category}});
    if(isEdit)state.transactions=state.transactions.map(x=>x.id===id?saved:x);else state.transactions.push(saved);
    resetTransactionForm();renderAll();showMessage("transactionMessage",isEdit?"Movimiento actualizado.":"Movimiento agregado correctamente.");toast(isEdit?"Movimiento actualizado.":"Movimiento guardado.");
  }catch(err){showMessage("transactionMessage",err.message,true);}
}
function editTransaction(id){
  const item=state.transactions.find(x=>x.id===id);if(!item)return;
  navigate("transactions");$("transactionId").value=item.id;$("transactionType").value=item.type;refreshCategorySelects();
  $("transactionDescription").value=item.description;$("transactionAmount").value=item.amount;$("transactionDate").value=item.date;$("transactionCategory").value=item.category;
  $("transactionFormTitle").textContent="Editar movimiento";$("saveTransaction").textContent="Guardar cambios";$("cancelEdit").classList.remove("hidden");$("transactionDescription").focus();
}
async function deleteTransaction(id){
  const item=state.transactions.find(x=>x.id===id);if(!item)return;
  if(!confirm(`¿Quieres borrar el movimiento "${item.description}"?`))return;
  try{await api(`/transactions/${encodeURIComponent(id)}`,{method:"DELETE"});state.transactions=state.transactions.filter(x=>x.id!==id);renderAll();toast("Movimiento eliminado.");}
  catch(err){toast(err.message);}
}
async function addCategory(event){
  event.preventDefault();const name=$("categoryName").value.trim(),type=$("categoryType").value;
  if(!name){showMessage("categoryMessage","Escribe un nombre para la categoría.",true);return;}
  if(state.categories.some(c=>c.name.toLocaleLowerCase("es-MX")===name.toLocaleLowerCase("es-MX"))){showMessage("categoryMessage","Ya existe una categoría con ese nombre.",true);return;}
  try{
    const created=await api("/categories",{method:"POST",body:{name,type}});
    state.categories.push(created);$("categoryForm").reset();refreshCategorySelects();renderCategories();renderBudgets();renderDashboard();showMessage("categoryMessage","Categoría creada correctamente.");toast("Categoría agregada.");
  }catch(err){showMessage("categoryMessage",err.message,true);}
}
async function deleteCategory(name){
  if(state.transactions.some(t=>t.category===name)){toast("No puedes borrar una categoría que tiene movimientos asociados.");return;}
  if(Object.hasOwn(state.budgets,name)){toast("Primero elimina el presupuesto asociado a esta categoría.");return;}
  if(!confirm(`¿Eliminar la categoría "${name}"?`))return;
  try{await api(`/categories/${encodeURIComponent(name)}`,{method:"DELETE"});state.categories=state.categories.filter(c=>c.name!==name);refreshCategorySelects();renderCategories();renderDashboard();toast("Categoría eliminada.");}
  catch(err){toast(err.message);}
}
async function saveBudget(event){
  event.preventDefault();const category=$("budgetCategory").value,limit=Number($("budgetLimit").value);
  if(!category||!Number.isFinite(limit)||limit<=0){showMessage("budgetMessage","Selecciona una categoría y escribe un límite mayor que cero.",true);return;}
  try{
    await api(`/budgets/${encodeURIComponent(category)}`,{method:"PUT",body:{limit}});
    state.budgets[category]=limit;$("budgetLimit").value="";renderBudgets();renderDashboard();showMessage("budgetMessage",`Presupuesto de ${category} guardado.`);toast("Presupuesto actualizado.");
  }catch(err){showMessage("budgetMessage",err.message,true);}
}
async function deleteBudget(category){
  if(!confirm(`¿Eliminar el presupuesto de "${category}"?`))return;
  try{await api(`/budgets/${encodeURIComponent(category)}`,{method:"DELETE"});delete state.budgets[category];renderBudgets();renderDashboard();toast("Presupuesto eliminado.");}
  catch(err){toast(err.message);}
}
function applySummary(){renderDashboard();}
function resetSummary(){ $("summaryFrom").value=monthStart();$("summaryTo").value=monthEnd();renderDashboard();}
function resetTransactionFilters(){$("transactionSearch").value="";$("transactionTypeFilter").value="all";$("transactionFrom").value="";$("transactionTo").value="";renderTransactions();}
function bindEvents(){
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();const email=$("loginEmail").value.trim().toLowerCase(),password=$("loginPassword").value;
    try{const data=await api("/auth/login",{method:"POST",body:{email,password}});$("loginForm").reset();await startApp(data.user);}
    catch(err){showMessage("loginMessage",err.message,true);}
  });
  $("registerForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const name=$("registerName").value.trim(),email=$("registerEmail").value.trim().toLowerCase(),password=$("registerPassword").value,again=$("registerConfirm").value;
    if(password!==again){showMessage("registerMessage","Las contraseñas no coinciden.",true);return;}
    if(password.length<8||!/[A-Za-z]/.test(password)||!/\d/.test(password)){showMessage("registerMessage","La contraseña debe tener al menos 8 caracteres, con letras y números.",true);return;}
    try{const data=await api("/auth/register",{method:"POST",body:{name,email,password}});$("registerForm").reset();await startApp(data.user);toast("¡Cuenta creada! Ya puedes registrar tus movimientos.");}
    catch(err){showMessage("registerMessage",err.message,true);}
  });
  $("showRegister").addEventListener("click",()=>{showMessage("loginMessage","");showAuthMode("register");});
  $("showLogin").addEventListener("click",()=>{showMessage("registerMessage","");showAuthMode("login");});
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
async function init(){
  bindEvents();setDefaultDates();
  try{const data=await api("/auth/me");await startApp(data.user);}catch(e){}
}
init();
