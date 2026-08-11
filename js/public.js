let tenant=null, services=[], barbers=[];

document.addEventListener("DOMContentLoaded",async()=>{
  const slug=Util.slug();
  if(!slug)return showNotFound("Link da barbearia não informado.");

  const {data,error}=await db.rpc("get_public_tenant",{p_slug:slug});
  if(error||!data)return showNotFound("Barbearia não encontrada ou indisponível.");

  tenant=data;
  applyTenantBrand(tenant);
  await Promise.all([loadServices(),loadBarbers()]);
});

function showNotFound(msg){
  document.querySelector("#publicApp").innerHTML=`<div class="center-state"><h1>${Util.esc(msg)}</h1><p>Confira o endereço ou fale com a barbearia.</p></div>`;
}

function applyTenantBrand(t){
  const primary=t.brand_primary||"#d0a255";
  const secondary=t.brand_secondary||"#f2cf86";
  document.documentElement.style.setProperty("--brand",primary);
  document.documentElement.style.setProperty("--brand2",secondary);

  document.querySelectorAll("[data-tenant-name]").forEach(el=>el.textContent=t.name||"Barbearia");
  document.querySelectorAll("[data-tenant-tagline]").forEach(el=>el.textContent=t.hero_text||"Agende seu horário online.");
  document.querySelectorAll("[data-about]").forEach(el=>el.textContent=t.about_text||"Atendimento profissional e agenda organizada.");
  document.querySelectorAll("[data-address]").forEach(el=>el.textContent=t.address||"");
  document.querySelectorAll("[data-instagram]").forEach(el=>el.textContent=t.instagram||"");
  document.querySelectorAll("[data-phone]").forEach(el=>el.textContent=t.phone||"");

  const logo=String(t.logo_url||"").trim();
  document.querySelectorAll("[data-logo]").forEach(img=>{
    if(logo){img.src=logo;img.hidden=false;} else img.hidden=true;
  });

  const hero=String(t.hero_image_url||"").trim();
  const heroEl=document.querySelector("#heroImage");
  if(hero&&heroEl){heroEl.src=hero;heroEl.hidden=false;}

  const hours=`${String(t.open_time||"08:00").slice(0,5)} às ${String(t.close_time||"19:00").slice(0,5)}`;
  document.querySelectorAll("[data-hours]").forEach(el=>el.textContent=hours);

  const bookingLinks=document.querySelectorAll("[data-booking-link]");
  bookingLinks.forEach(a=>a.href=`agendar.html?slug=${encodeURIComponent(t.slug)}`);

  if(t.phone){
    const d=String(t.phone).replace(/\D/g,"");
    const phone=d.length<=11?`55${d}`:d;
    document.querySelectorAll("[data-whatsapp-link]").forEach(a=>a.href=`https://wa.me/${phone}`);
  }
  if(t.instagram){
    const url=/^https?:\/\//i.test(t.instagram)?t.instagram:`https://instagram.com/${t.instagram.replace(/^@/,"")}`;
    document.querySelectorAll("[data-instagram-link]").forEach(a=>a.href=url);
  }

  document.title=t.name||"Barbearia";
}

async function loadServices(){
  const root=document.querySelector("#servicesGrid");
  const {data,error}=await db.from("services").select("*").eq("tenant_id",tenant.id).eq("active",true).order("sort_order").order("created_at");
  if(error)return root.innerHTML='<div class="empty">Erro ao carregar serviços.</div>';
  services=data||[];
  if(!services.length)return root.innerHTML='<div class="empty">Nenhum serviço disponível.</div>';

  root.innerHTML=services.map(s=>`<article class="service-card">
    ${s.image_url?`<img class="service-image" src="${Util.esc(s.image_url)}" alt="${Util.esc(s.name)}">`:`<div class="service-placeholder">✂</div>`}
    <div class="service-body">
      <h3>${Util.esc(s.name)}</h3>
      <p>${Util.esc(s.description||"")}</p>
      <div class="price-row">
        <span class="price">${Util.money(s.price)}</span>
        <a class="btn btn-outline" href="agendar.html?slug=${encodeURIComponent(tenant.slug)}&service=${s.id}">Agendar</a>
      </div>
    </div>
  </article>`).join("");
}

async function loadBarbers(){
  const root=document.querySelector("#barbersGrid");
  const {data,error}=await db.from("barbers").select("*").eq("tenant_id",tenant.id).eq("active",true).order("sort_order").order("created_at");
  if(error)return root.innerHTML='<div class="empty">Erro ao carregar profissionais.</div>';
  barbers=data||[];
  if(!barbers.length)return root.innerHTML='<div class="empty">Nenhum profissional disponível.</div>';

  root.innerHTML=barbers.map(b=>`<article class="barber-card">
    ${b.photo_url?`<img src="${Util.esc(b.photo_url)}" alt="${Util.esc(b.name)}">`:`<div class="avatar">✂</div>`}
    <strong>${Util.esc(b.name)}</strong>
    <span>Profissional</span>
  </article>`).join("");
}
