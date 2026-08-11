document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll("[data-product-name]").forEach(el=>el.textContent=Util.productName());
  document.querySelector("#loginForm")?.addEventListener("submit",login);
  document.querySelector("#signupForm")?.addEventListener("submit",signup);
});

async function login(e){
  e.preventDefault();
  const form=e.currentTarget;
  const f=new FormData(form);
  const btn=form.querySelector("button[type=submit]");
  const old=btn.textContent; btn.disabled=true; btn.textContent="Entrando...";

  const {data,error}=await db.auth.signInWithPassword({
    email:String(f.get("email")||"").trim(),
    password:String(f.get("password")||"")
  });

  btn.disabled=false; btn.textContent=old;
  if(error)return Util.toast("E-mail ou senha inválidos.","error");

  const pending=localStorage.getItem("pendingTenant");
  if(pending){
    try{
      const p=JSON.parse(pending);
      const result=await db.rpc("create_tenant_account",{
        p_name:p.business_name,
        p_slug:p.slug,
        p_owner_name:p.owner_name
      });
      if(!result.error)localStorage.removeItem("pendingTenant");
    }catch(_){}
  }

  location.href="painel.html";
}

async function signup(e){
  e.preventDefault();
  const form=e.currentTarget;
  const f=new FormData(form);
  const business_name=String(f.get("business_name")||"").trim();
  const owner_name=String(f.get("owner_name")||"").trim();
  const slug=String(f.get("slug")||"").trim().toLowerCase();
  const email=String(f.get("email")||"").trim();
  const password=String(f.get("password")||"");

  if(business_name.length<2)return Util.toast("Informe o nome da barbearia.","error");
  if(owner_name.length<2)return Util.toast("Informe seu nome.","error");
  if(!/^[a-z0-9-]{3,50}$/.test(slug))return Util.toast("O link deve ter 3–50 caracteres: letras minúsculas, números e hífen.","error");
  if(password.length<8)return Util.toast("Use uma senha com pelo menos 8 caracteres.","error");

  const btn=form.querySelector("button[type=submit]");
  const old=btn.textContent; btn.disabled=true; btn.textContent="Criando conta...";

  const {data,error}=await db.auth.signUp({
    email,password,
    options:{data:{full_name:owner_name}}
  });

  if(error){
    btn.disabled=false;btn.textContent=old;
    return Util.toast(error.message,"error");
  }

  if(data.session){
    const {error:tenantError}=await db.rpc("create_tenant_account",{
      p_name:business_name,p_slug:slug,p_owner_name:owner_name
    });
    btn.disabled=false;btn.textContent=old;
    if(tenantError)return Util.toast(tenantError.message,"error");
    location.href="painel.html";
    return;
  }

  localStorage.setItem("pendingTenant",JSON.stringify({business_name,slug,owner_name}));
  btn.disabled=false;btn.textContent=old;
  document.querySelector("#signupSuccess").hidden=false;
  form.hidden=true;
}
