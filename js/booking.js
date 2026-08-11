let tenant=null, services=[], barbers=[], selectedTime="";

document.addEventListener("DOMContentLoaded",async()=>{
  const slug=Util.slug();
  if(!slug)return fail("Barbearia não informada.");

  const {data,error}=await db.rpc("get_public_tenant",{p_slug:slug});
  if(error||!data)return fail("Barbearia não encontrada ou indisponível.");

  tenant=data;
  applyBrand();
  await loadChoices();

  const date=document.querySelector("#date");
  date.min=Util.todayISO();
  document.querySelector("#service").addEventListener("change",refreshTimes);
  document.querySelector("#barber").addEventListener("change",refreshTimes);
  date.addEventListener("change",refreshTimes);
  document.querySelector("#bookingForm").addEventListener("submit",submitBooking);
});

function fail(msg){
  document.querySelector("#bookingApp").innerHTML=`<div class="center-state"><h1>${Util.esc(msg)}</h1></div>`;
}

function applyBrand(){
  document.documentElement.style.setProperty("--brand",tenant.brand_primary||"#d0a255");
  document.documentElement.style.setProperty("--brand2",tenant.brand_secondary||"#f2cf86");
  document.querySelectorAll("[data-tenant-name]").forEach(el=>el.textContent=tenant.name);
  const logo=tenant.logo_url||"";
  document.querySelectorAll("[data-logo]").forEach(img=>{
    if(logo){img.src=logo;img.hidden=false;}else img.hidden=true;
  });
  document.title=`Agendar | ${tenant.name}`;
}

async function loadChoices(){
  const [s,b]=await Promise.all([
    db.from("services").select("*").eq("tenant_id",tenant.id).eq("active",true).order("sort_order"),
    db.from("barbers").select("*").eq("tenant_id",tenant.id).eq("active",true).order("sort_order")
  ]);
  if(s.error||b.error)return Util.toast("Não foi possível carregar a agenda.","error");

  services=s.data||[];barbers=b.data||[];
  document.querySelector("#service").innerHTML='<option value="">Escolha o serviço</option>'+services.map(x=>`<option value="${x.id}">${Util.esc(x.name)} — ${Util.money(x.price)}</option>`).join("");
  document.querySelector("#barber").innerHTML='<option value="">Escolha o barbeiro</option>'+barbers.map(x=>`<option value="${x.id}">${Util.esc(x.name)}</option>`).join("");

  const pre=new URLSearchParams(location.search).get("service");
  if(pre)document.querySelector("#service").value=pre;
  renderSummary();
}

async function refreshTimes(){
  selectedTime="";renderSummary();
  const serviceId=document.querySelector("#service").value;
  const barberId=document.querySelector("#barber").value;
  const date=document.querySelector("#date").value;
  const root=document.querySelector("#times");

  if(!serviceId||!barberId||!date){
    root.innerHTML='<div class="empty">Escolha serviço, barbeiro e data.</div>';
    return;
  }

  root.innerHTML='<div class="empty">Consultando horários...</div>';
  const {data,error}=await db.rpc("get_public_available_times",{
    p_tenant_slug:tenant.slug,
    p_date:date,
    p_barber_id:barberId,
    p_service_id:serviceId
  });

  if(error)return root.innerHTML='<div class="empty">Não foi possível consultar os horários.</div>';
  const times=(data||[]).map(x=>String(x.available_time).slice(0,5));
  if(!times.length)return root.innerHTML='<div class="empty">Nenhum horário disponível para este profissional.</div>';

  root.innerHTML=times.map(t=>`<button type="button" class="time-btn" data-time="${t}">${t}</button>`).join("");
  root.querySelectorAll(".time-btn").forEach(btn=>btn.addEventListener("click",()=>{
    root.querySelectorAll(".time-btn").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    selectedTime=btn.dataset.time;
    renderSummary();
  }));
}

function renderSummary(){
  const s=services.find(x=>String(x.id)===document.querySelector("#service")?.value);
  const b=barbers.find(x=>String(x.id)===document.querySelector("#barber")?.value);
  const d=document.querySelector("#date")?.value;

  document.querySelector("#sumService").textContent=s?.name||"—";
  document.querySelector("#sumPrice").textContent=s?Util.money(s.price):"—";
  document.querySelector("#sumBarber").textContent=b?.name||"—";
  document.querySelector("#sumDate").textContent=d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"—";
  document.querySelector("#sumTime").textContent=selectedTime||"—";
}

async function submitBooking(e){
  e.preventDefault();
  const form=e.currentTarget;
  const f=new FormData(form);
  if(!selectedTime)return Util.toast("Escolha um horário.","error");

  const btn=form.querySelector("button[type=submit]");
  const old=btn.textContent;btn.disabled=true;btn.textContent="Confirmando...";

  const {data,error}=await db.rpc("create_public_booking",{
    p_tenant_slug:tenant.slug,
    p_client_name:String(f.get("name")||"").trim(),
    p_phone:String(f.get("phone")||"").trim(),
    p_service_id:f.get("service"),
    p_barber_id:f.get("barber"),
    p_booking_date:f.get("date"),
    p_booking_time:selectedTime,
    p_notes:String(f.get("notes")||"").trim()
  });

  btn.disabled=false;btn.textContent=old;

  if(error){
    await refreshTimes();
    return Util.toast(error.message||"Não foi possível agendar.","error");
  }

  document.querySelector("#protocol").textContent=data;
  document.querySelector("#success").hidden=false;
  form.reset();selectedTime="";
  document.querySelector("#times").innerHTML='<div class="empty">Escolha serviço, barbeiro e data.</div>';
  renderSummary();
  Util.toast("Agendamento confirmado!","ok");
}
