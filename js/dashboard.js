let session=null,memberships=[],tenant=null,role=null,services=[],barbers=[];

document.addEventListener("DOMContentLoaded",async()=>{
  document.querySelectorAll("[data-product-name]").forEach(el=>el.textContent=Util.productName());
  const {data}=await db.auth.getSession();
  session=data.session;
  if(!session)return location.href="entrar.html";

  document.querySelector("#logout").addEventListener("click",async()=>{await db.auth.signOut();location.href="entrar.html";});
  document.querySelectorAll("[data-panel]").forEach(btn=>btn.addEventListener("click",()=>openPanel(btn.dataset.panel,btn)));
  document.querySelector("#tenantSelect").addEventListener("change",e=>selectTenant(e.target.value));

  document.querySelector("#serviceForm").addEventListener("submit",saveService);
  document.querySelector("#barberForm").addEventListener("submit",saveBarber);
  document.querySelector("#brandingForm").addEventListener("submit",saveBranding);
  document.querySelector("#settingsForm").addEventListener("submit",saveSettings);

  await loadMemberships();
});

async function loadMemberships(){
  const {data,error}=await db.from("tenant_members")
    .select("tenant_id,role,tenants(*)")
    .eq("user_id",session.user.id);

  if(error)return Util.toast(error.message,"error");
  memberships=data||[];
  if(!memberships.length){
    document.querySelector("#dashboardShell").innerHTML='<div class="center-state"><h1>Nenhuma barbearia vinculada.</h1><p>Crie uma conta de empresa ou peça acesso a um administrador.</p></div>';
    return;
  }

  const select=document.querySelector("#tenantSelect");
  select.innerHTML=memberships.map(m=>`<option value="${m.tenant_id}">${Util.esc(m.tenants?.name||"Barbearia")}</option>`).join("");
  await selectTenant(memberships[0].tenant_id);
}

async function selectTenant(id){
  const m=memberships.find(x=>String(x.tenant_id)===String(id));
  if(!m)return;
  tenant=m.tenants;role=m.role;
  document.querySelector("#tenantSelect").value=id;
  applyTenantUI();
  await refreshAll();
}

function applyTenantUI(){
  document.documentElement.style.setProperty("--brand",tenant.brand_primary||"#d0a255");
  document.documentElement.style.setProperty("--brand2",tenant.brand_secondary||"#f2cf86");
  document.querySelectorAll("[data-tenant-name]").forEach(el=>el.textContent=tenant.name);
  document.querySelector("#publicLink").href=`barbearia.html?slug=${encodeURIComponent(tenant.slug)}`;
  document.querySelector("#publicLink").textContent="Ver site";
}

function openPanel(id,btn){
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  document.querySelector("#"+id).classList.add("active");
  document.querySelectorAll("[data-panel]").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
}

async function refreshAll(){
  await Promise.allSettled([
    loadKPIs(),loadBookings(),loadServices(),loadBarbers(),loadBranding(),loadSettings(),loadSubscription()
  ]);
}

async function loadKPIs(){
  const today=Util.todayISO(),month=today.slice(0,7);
  const [bk,sv,br]=await Promise.all([
    db.from("bookings").select("booking_date,price,status").eq("tenant_id",tenant.id),
    db.from("services").select("*",{count:"exact",head:true}).eq("tenant_id",tenant.id).eq("active",true),
    db.from("barbers").select("*",{count:"exact",head:true}).eq("tenant_id",tenant.id).eq("active",true)
  ]);
  const valid=(bk.data||[]).filter(x=>x.status!=="cancelado");
  document.querySelector("#kToday").textContent=valid.filter(x=>x.booking_date===today).length;
  const monthList=valid.filter(x=>x.booking_date.startsWith(month));
  document.querySelector("#kMonth").textContent=monthList.length;
  document.querySelector("#kRevenue").textContent=Util.money(monthList.reduce((a,x)=>a+Number(x.price||0),0));
  document.querySelector("#kServices").textContent=sv.count||0;
  document.querySelector("#kBarbers").textContent=br.count||0;
}

async function loadBookings(){
  const root=document.querySelector("#bookingRows");
  const {data,error}=await db.from("bookings").select("*").eq("tenant_id",tenant.id)
    .order("booking_date",{ascending:false}).order("booking_time",{ascending:false});
  if(error)return root.innerHTML='<tr><td colspan="8">Erro ao carregar.</td></tr>';
  if(!data?.length)return root.innerHTML='<tr><td colspan="8"><div class="empty">Nenhum agendamento.</div></td></tr>';

  root.innerHTML=data.map(b=>`<tr>
    <td><strong>${Util.esc(b.client_name)}</strong><br><small>${Util.esc(b.phone)}</small></td>
    <td>${Util.esc(b.barber_name)}</td>
    <td>${Util.esc(b.service_name)}</td>
    <td>${new Date(b.booking_date+"T12:00:00").toLocaleDateString("pt-BR")}<br>${String(b.booking_time).slice(0,5)}</td>
    <td>${Util.money(b.price)}</td>
    <td><span class="status ${b.status}">${b.status}</span></td>
    <td>${Util.esc(b.notes||"—")}</td>
    <td><div class="actions">
      <button onclick="setBookingStatus('${b.id}','concluido')">Concluir</button>
      <button onclick="setBookingStatus('${b.id}','cancelado')">Cancelar</button>
    </div></td>
  </tr>`).join("");
}

async function setBookingStatus(id,status){
  const {error}=await db.from("bookings").update({status}).eq("id",id).eq("tenant_id",tenant.id);
  if(error)return Util.toast(error.message,"error");
  Util.toast("Agendamento atualizado.","ok");await refreshAll();
}

async function loadServices(){
  const root=document.querySelector("#serviceAdminGrid");
  const {data,error}=await db.from("services").select("*").eq("tenant_id",tenant.id).order("sort_order").order("created_at");
  if(error)return root.innerHTML='<div class="empty">Erro ao carregar.</div>';
  services=data||[];
  root.innerHTML=services.length?services.map(s=>`<div class="admin-item">
    <strong>${Util.esc(s.name)}</strong><span>${Util.money(s.price)} • ${s.duration_minutes} min</span>
    <div class="actions">
      <button onclick="editService('${s.id}')">Editar</button>
      <button onclick="toggleService('${s.id}',${!s.active})">${s.active?"Desativar":"Ativar"}</button>
      <button onclick="deleteService('${s.id}')">Excluir</button>
    </div>
  </div>`).join(""):'<div class="empty">Nenhum serviço cadastrado.</div>';
}

async function saveService(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget),id=String(f.get("id")||"");
  const payload={
    tenant_id:tenant.id,
    name:String(f.get("name")||"").trim(),
    description:String(f.get("description")||"").trim(),
    price:Number(f.get("price")),
    duration_minutes:Number(f.get("duration")),
    image_url:String(f.get("image_url")||"").trim()||null,
    sort_order:Number(f.get("sort_order")||0)
  };
  const q=id?db.from("services").update(payload).eq("id",id).eq("tenant_id",tenant.id):db.from("services").insert({...payload,active:true});
  const {error}=await q;
  if(error)return Util.toast(error.message,"error");
  e.currentTarget.reset();document.querySelector("#serviceId").value="";
  Util.toast(id?"Serviço atualizado.":"Serviço cadastrado.","ok");await refreshAll();
}
function editService(id){
  const s=services.find(x=>x.id===id);if(!s)return;
  document.querySelector("#serviceId").value=s.id;
  document.querySelector("#serviceName").value=s.name;
  document.querySelector("#servicePrice").value=s.price;
  document.querySelector("#serviceDuration").value=s.duration_minutes;
  document.querySelector("#serviceDescription").value=s.description||"";
  document.querySelector("#serviceImage").value=s.image_url||"";
  document.querySelector("#serviceSort").value=s.sort_order||0;
  document.querySelector("#serviceForm").scrollIntoView({behavior:"smooth"});
}
async function toggleService(id,active){
  const {error}=await db.from("services").update({active}).eq("id",id).eq("tenant_id",tenant.id);
  if(error)return Util.toast(error.message,"error");await refreshAll();
}
async function deleteService(id){
  if(!confirm("Excluir este serviço?"))return;
  const {error}=await db.from("services").delete().eq("id",id).eq("tenant_id",tenant.id);
  if(error)return Util.toast("Se houver agendamentos vinculados, desative o serviço.","error");await refreshAll();
}

async function loadBarbers(){
  const root=document.querySelector("#barberAdminGrid");
  const {data,error}=await db.from("barbers").select("*").eq("tenant_id",tenant.id).order("sort_order").order("created_at");
  if(error)return root.innerHTML='<div class="empty">Erro ao carregar.</div>';
  barbers=data||[];
  root.innerHTML=barbers.length?barbers.map(b=>`<div class="admin-item">
    <strong>${Util.esc(b.name)}</strong><span>${b.active?"Ativo":"Inativo"}</span>
    <div class="actions">
      <button onclick="editBarber('${b.id}')">Editar</button>
      <button onclick="toggleBarber('${b.id}',${!b.active})">${b.active?"Desativar":"Ativar"}</button>
      <button onclick="deleteBarber('${b.id}')">Excluir</button>
    </div>
  </div>`).join(""):'<div class="empty">Nenhum barbeiro cadastrado.</div>';
}
async function saveBarber(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget),id=String(f.get("id")||"");
  const payload={tenant_id:tenant.id,name:String(f.get("name")||"").trim(),photo_url:String(f.get("photo_url")||"").trim()||null,sort_order:Number(f.get("sort_order")||0)};
  const q=id?db.from("barbers").update(payload).eq("id",id).eq("tenant_id",tenant.id):db.from("barbers").insert({...payload,active:true});
  const {error}=await q;
  if(error)return Util.toast(error.message,"error");
  e.currentTarget.reset();document.querySelector("#barberId").value="";
  Util.toast(id?"Barbeiro atualizado.":"Barbeiro cadastrado.","ok");await refreshAll();
}
function editBarber(id){
  const b=barbers.find(x=>x.id===id);if(!b)return;
  document.querySelector("#barberId").value=b.id;
  document.querySelector("#barberName").value=b.name;
  document.querySelector("#barberPhoto").value=b.photo_url||"";
  document.querySelector("#barberSort").value=b.sort_order||0;
}
async function toggleBarber(id,active){
  const {error}=await db.from("barbers").update({active}).eq("id",id).eq("tenant_id",tenant.id);
  if(error)return Util.toast(error.message,"error");await refreshAll();
}
async function deleteBarber(id){
  if(!confirm("Excluir este barbeiro?"))return;
  const {error}=await db.from("barbers").delete().eq("id",id).eq("tenant_id",tenant.id);
  if(error)return Util.toast("Se houver agendamentos vinculados, desative o barbeiro.","error");await refreshAll();
}

async function loadBranding(){
  const t=tenant;
  document.querySelector("#brandName").value=t.name||"";
  document.querySelector("#brandLogo").value=t.logo_url||"";
  document.querySelector("#brandHero").value=t.hero_image_url||"";
  document.querySelector("#brandPrimary").value=t.brand_primary||"#d0a255";
  document.querySelector("#brandSecondary").value=t.brand_secondary||"#f2cf86";
  document.querySelector("#brandHeroText").value=t.hero_text||"";
  document.querySelector("#brandAbout").value=t.about_text||"";
}
async function saveBranding(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const payload={
    name:String(f.get("name")||"").trim(),
    logo_url:String(f.get("logo_url")||"").trim()||null,
    hero_image_url:String(f.get("hero_image_url")||"").trim()||null,
    brand_primary:f.get("brand_primary"),
    brand_secondary:f.get("brand_secondary"),
    hero_text:String(f.get("hero_text")||"").trim(),
    about_text:String(f.get("about_text")||"").trim()
  };
  const {data,error}=await db.from("tenants").update(payload).eq("id",tenant.id).select().single();
  if(error)return Util.toast(error.message,"error");
  tenant=data;
  const m=memberships.find(x=>x.tenant_id===tenant.id);if(m)m.tenants=data;
  applyTenantUI();Util.toast("Identidade atualizada.","ok");
}

async function loadSettings(){
  document.querySelector("#phone").value=tenant.phone||"";
  document.querySelector("#instagram").value=tenant.instagram||"";
  document.querySelector("#address").value=tenant.address||"";
  document.querySelector("#openTime").value=String(tenant.open_time||"08:00").slice(0,5);
  document.querySelector("#closeTime").value=String(tenant.close_time||"19:00").slice(0,5);
  document.querySelector("#interval").value=tenant.slot_interval_minutes||30;
  document.querySelector("#workDays").value=(tenant.work_days||[1,2,3,4,5,6]).join(",");
  document.querySelector("#blockedDates").value=(tenant.blocked_dates||[]).join(",");
}
async function saveSettings(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const payload={
    phone:String(f.get("phone")||"").trim(),
    instagram:String(f.get("instagram")||"").trim(),
    address:String(f.get("address")||"").trim(),
    open_time:f.get("open_time"),
    close_time:f.get("close_time"),
    slot_interval_minutes:Number(f.get("slot_interval")),
    work_days:String(f.get("work_days")||"").split(",").map(x=>Number(x.trim())).filter(x=>x>=0&&x<=6),
    blocked_dates:String(f.get("blocked_dates")||"").split(",").map(x=>x.trim()).filter(Boolean)
  };
  const {data,error}=await db.from("tenants").update(payload).eq("id",tenant.id).select().single();
  if(error)return Util.toast(error.message,"error");
  tenant=data;const m=memberships.find(x=>x.tenant_id===tenant.id);if(m)m.tenants=data;
  Util.toast("Funcionamento atualizado.","ok");
}

async function loadSubscription(){
  const root=document.querySelector("#subscriptionInfo");
  const {data,error}=await db.from("subscriptions").select("*,plans(*)").eq("tenant_id",tenant.id).maybeSingle();
  if(error)return root.innerHTML="Erro ao carregar plano.";
  if(!data)return root.innerHTML="Nenhum plano vinculado.";
  root.innerHTML=`<strong>${Util.esc(data.plans?.name||data.plan_id)}</strong><span>Status: ${Util.esc(data.status)}</span><small>Gerenciado pelo administrador da plataforma.</small>`;
}
