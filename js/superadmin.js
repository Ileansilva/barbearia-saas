let session=null,tenants=[],plans=[],metrics={};

const $=(s)=>document.querySelector(s);

const STATUS_LABEL={
  trial:"Em teste",
  active:"Ativa",
  suspended:"Suspensa",
  cancelled:"Cancelada"
};

function statusLabel(v){return STATUS_LABEL[v]||v||"—";}

function statusClass(v){return `tenant-status ${v||""}`;}

function daysUntil(date){
  if(!date)return null;
  const end=new Date(date);
  const now=new Date();
  return Math.ceil((end-now)/86400000);
}

function fmtDate(v){
  if(!v)return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

function setText(id,value){const el=$(id);if(el)el.textContent=value;}

function escapeCsv(value){
  const s=String(value??"");
  return `"${s.replaceAll('"','""')}"`;
}

document.addEventListener("DOMContentLoaded",async()=>{
  document.querySelectorAll("[data-product-name]").forEach(el=>el.textContent=Util.productName());

  const {data}=await db.auth.getSession();
  session=data.session;
  if(!session)return location.href="entrar.html";

  const {data:profile,error}=await db.from("profiles").select("system_role").eq("id",session.user.id).single();
  if(error||profile?.system_role!=="superadmin"){
    $("#superShell").innerHTML='<div class="center-state"><h1>Acesso restrito.</h1><p>Este usuário não é superadministrador.</p></div>';
    return;
  }

  $("#logout")?.addEventListener("click",async()=>{await db.auth.signOut();location.href="entrar.html";});
  $("#refreshSuper")?.addEventListener("click",loadAll);
  $("#tenantSearch")?.addEventListener("input",renderTenantTable);
  $("#statusFilter")?.addEventListener("change",renderTenantTable);
  $("#exportCsv")?.addEventListener("click",exportCsv);

  await loadAll();
});

async function loadAll(){
  const refresh=$("#refreshSuper");
  if(refresh){refresh.disabled=true;refresh.textContent="Atualizando...";}

  try{
    const [m,t,p]=await Promise.all([
      db.rpc("superadmin_dashboard_metrics"),
      db.rpc("superadmin_list_tenants"),
      db.from("plans").select("*").eq("active",true).order("price_monthly")
    ]);

    if(m.error)throw m.error;
    if(t.error)throw t.error;
    if(p.error)throw p.error;

    metrics=m.data||{};
    tenants=t.data||[];
    plans=p.data||[];

    renderMetrics();
    renderPlanSummary();
    renderStatusSummary();
    renderTenantTable();
  }catch(err){
    console.error(err);
    Util.toast(err?.message||"Não foi possível carregar o Superadmin.","error");
  }finally{
    if(refresh){refresh.disabled=false;refresh.textContent="Atualizar";}
  }
}

function renderMetrics(){
  setText("#mrr",Util.money(metrics.mrr||0));
  setText("#projectedMrr",Util.money(metrics.projected_mrr||0));
  setText("#totalTenants",metrics.total_tenants||0);
  setText("#activeTenants",metrics.active_tenants||0);
  setText("#trialTenants",metrics.trial_tenants||0);
  setText("#suspendedTenants",metrics.suspended_tenants||0);
  setText("#bookings30d",metrics.bookings_30d||0);
  setText("#totalBarbers",metrics.total_barbers||0);
}

function renderPlanSummary(){
  const root=$("#planSummary");
  if(!root)return;
  root.innerHTML=plans.map(plan=>{
    const list=tenants.filter(t=>t.plan_id===plan.id && t.tenant_status!=="cancelled");
    const active=list.filter(t=>t.tenant_status==="active").length;
    const trial=list.filter(t=>t.tenant_status==="trial").length;
    return `<div class="plan-summary-card">
      <div class="plan-summary-head"><strong>${Util.esc(plan.name)}</strong><span>${Util.money(plan.price_monthly)}/mês</span></div>
      <div class="plan-summary-number">${list.length}</div>
      <small>${active} ativas • ${trial} em teste • até ${plan.max_barbers} barbeiros</small>
    </div>`;
  }).join("")||'<div class="empty">Nenhum plano ativo.</div>';
}

function renderStatusSummary(){
  const root=$("#statusSummary");
  if(!root)return;
  const items=[
    ["trial","Em teste",metrics.trial_tenants||0],
    ["active","Ativas",metrics.active_tenants||0],
    ["suspended","Suspensas",metrics.suspended_tenants||0],
    ["cancelled","Canceladas",metrics.cancelled_tenants||0]
  ];
  root.innerHTML=items.map(([key,label,value])=>`<div class="status-summary-row"><span><i class="status-dot ${key}"></i>${label}</span><strong>${value}</strong></div>`).join("");
}

function filteredTenants(){
  const q=String($("#tenantSearch")?.value||"").trim().toLowerCase();
  const st=$("#statusFilter")?.value||"";
  return tenants.filter(t=>{
    const matchText=!q || String(t.name||"").toLowerCase().includes(q) || String(t.slug||"").toLowerCase().includes(q);
    const matchStatus=!st || t.tenant_status===st;
    return matchText&&matchStatus;
  });
}

function trialText(t){
  if(t.tenant_status!=="trial")return `Desde ${fmtDate(t.created_at)}`;
  const days=daysUntil(t.trial_ends_at);
  if(days===null)return "Teste grátis";
  if(days<0)return `Teste expirou há ${Math.abs(days)} dia(s)`;
  if(days===0)return "Teste termina hoje";
  return `${days} dia(s) restantes`;
}

function renderTenantTable(){
  const root=$("#tenantRows");
  if(!root)return;
  const list=filteredTenants();
  if(!list.length){
    root.innerHTML='<tr><td colspan="7"><div class="empty">Nenhuma barbearia encontrada.</div></td></tr>';
    return;
  }

  root.innerHTML=list.map(t=>`<tr>
    <td>
      <strong>${Util.esc(t.name)}</strong><br>
      <small>${Util.esc(t.slug)}</small>
    </td>
    <td><span class="${statusClass(t.tenant_status)}">${statusLabel(t.tenant_status)}</span></td>
    <td>
      <select class="table-select" onchange="changePlan('${t.tenant_id}',this.value,this)">
        ${plans.map(p=>`<option value="${p.id}" ${p.id===t.plan_id?"selected":""}>${Util.esc(p.name)} — ${Util.money(p.price_monthly)}</option>`).join("")}
      </select>
    </td>
    <td><strong>${t.active_barbers||0}</strong> / ${t.max_barbers||"—"}</td>
    <td>${t.bookings_30d||0}</td>
    <td><strong>${Util.esc(trialText(t))}</strong><br><small>Cadastro: ${fmtDate(t.created_at)}</small></td>
    <td>
      <div class="actions super-actions">
        <a href="barbearia.html?slug=${encodeURIComponent(t.slug)}" target="_blank">Abrir</a>
        ${t.tenant_status!=="active"?`<button onclick="changeStatus('${t.tenant_id}','active')">Ativar</button>`:""}
        ${t.tenant_status!=="trial"?`<button onclick="changeStatus('${t.tenant_id}','trial')">Teste</button>`:""}
        ${t.tenant_status!=="suspended"?`<button class="warning" onclick="changeStatus('${t.tenant_id}','suspended')">Suspender</button>`:""}
        ${t.tenant_status!=="cancelled"?`<button class="danger" onclick="changeStatus('${t.tenant_id}','cancelled')">Cancelar</button>`:""}
      </div>
    </td>
  </tr>`).join("");
}

async function changePlan(tenantId,planId,selectEl){
  const tenant=tenants.find(t=>t.tenant_id===tenantId);
  const plan=plans.find(p=>p.id===planId);
  if(!tenant||!plan)return;

  const previous=tenant.plan_id;
  if(!confirm(`Alterar ${tenant.name} para o plano ${plan.name} (${Util.money(plan.price_monthly)}/mês)?`)){
    if(selectEl)selectEl.value=previous;
    return;
  }

  if(selectEl)selectEl.disabled=true;
  const {error}=await db.rpc("superadmin_set_plan",{p_tenant:tenantId,p_plan:planId});
  if(selectEl)selectEl.disabled=false;
  if(error){
    if(selectEl)selectEl.value=previous;
    return Util.toast(error.message,"error");
  }
  Util.toast("Plano atualizado com sucesso.","ok");
  await loadAll();
}

async function changeStatus(tenantId,status){
  const tenant=tenants.find(t=>t.tenant_id===tenantId);
  const name=tenant?.name||"esta barbearia";
  const messages={
    active:`Ativar a barbearia ${name}?`,
    trial:`Colocar ${name} novamente em período de teste?`,
    suspended:`Suspender ${name}? O site público e as alterações operacionais ficarão bloqueados.`,
    cancelled:`Cancelar ${name}? Esta ação também marcará a assinatura como cancelada.`
  };
  if(!confirm(messages[status]||"Confirmar alteração?"))return;

  const {error}=await db.rpc("superadmin_set_tenant_status",{p_tenant:tenantId,p_status:status});
  if(error)return Util.toast(error.message,"error");
  Util.toast(`Status alterado para ${statusLabel(status)}.`,"ok");
  await loadAll();
}

function exportCsv(){
  const list=filteredTenants();
  const rows=[
    ["Barbearia","Slug","Status","Plano","Mensalidade","Barbeiros ativos","Limite barbeiros","Agendamentos 30d","Fim do teste","Cadastro"],
    ...list.map(t=>[
      t.name,t.slug,statusLabel(t.tenant_status),t.plan_name||t.plan_id||"",t.price_monthly||0,
      t.active_barbers||0,t.max_barbers||0,t.bookings_30d||0,t.trial_ends_at||"",t.created_at||""
    ])
  ];
  const csv="\ufeff"+rows.map(r=>r.map(escapeCsv).join(";")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`clientes-saas-${Util.todayISO()}.csv`;a.click();
  URL.revokeObjectURL(url);
}
