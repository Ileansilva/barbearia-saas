let session=null,tenants=[],plans=[];

document.addEventListener("DOMContentLoaded",async()=>{
  document.querySelectorAll("[data-product-name]").forEach(el=>el.textContent=Util.productName());
  const {data}=await db.auth.getSession();
  session=data.session;
  if(!session)return location.href="entrar.html";

  const {data:profile}=await db.from("profiles").select("system_role").eq("id",session.user.id).single();
  if(profile?.system_role!=="superadmin"){
    document.querySelector("#superShell").innerHTML='<div class="center-state"><h1>Acesso restrito.</h1><p>Este usuário não é superadministrador.</p></div>';
    return;
  }

  document.querySelector("#logout").addEventListener("click",async()=>{await db.auth.signOut();location.href="entrar.html";});
  await loadAll();
});

async function loadAll(){
  const [t,p,s]=await Promise.all([
    db.from("tenants").select("*").order("created_at",{ascending:false}),
    db.from("plans").select("*").order("price_monthly"),
    db.from("subscriptions").select("*,plans(*)")
  ]);
  tenants=t.data||[];plans=p.data||[];const subs=s.data||[];
  document.querySelector("#totalTenants").textContent=tenants.length;
  document.querySelector("#activeTenants").textContent=tenants.filter(x=>["active","trial"].includes(x.status)).length;
  document.querySelector("#suspendedTenants").textContent=tenants.filter(x=>x.status==="suspended").length;

  const root=document.querySelector("#tenantRows");
  root.innerHTML=tenants.map(x=>{
    const sub=subs.find(s=>s.tenant_id===x.id);
    return `<tr>
      <td><strong>${Util.esc(x.name)}</strong><br><small>${Util.esc(x.slug)}</small></td>
      <td><span class="status">${Util.esc(x.status)}</span></td>
      <td>${Util.esc(sub?.plans?.name||sub?.plan_id||"—")}</td>
      <td>${new Date(x.created_at).toLocaleDateString("pt-BR")}</td>
      <td>
        <div class="actions">
          <select onchange="changePlan('${x.id}',this.value)">
            ${plans.map(p=>`<option value="${p.id}" ${p.id===sub?.plan_id?"selected":""}>${Util.esc(p.name)}</option>`).join("")}
          </select>
          <a href="barbearia.html?slug=${encodeURIComponent(x.slug)}" target="_blank">Abrir</a>
        </div>
      </td>
    </tr>`;
  }).join("");
}


async function changePlan(tenantId,planId){
  const {error}=await db.from("subscriptions").upsert({
    tenant_id:tenantId,plan_id:planId,status:"active",updated_at:new Date().toISOString()
  },{onConflict:"tenant_id"});
  if(error)return Util.toast(error.message,"error");
  Util.toast("Plano atualizado.","ok");await loadAll();
}
