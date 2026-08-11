const { createClient } = supabase;

function getSaaSConfig(){
  const cfg = window.SAAS_CONFIG || {};
  if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY ||
     String(cfg.SUPABASE_URL).includes("COLE_") ||
     String(cfg.SUPABASE_ANON_KEY).includes("COLE_")){
    throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY em js/config.js.");
  }
  return cfg;
}

const SaaSCfg = getSaaSConfig();
window.db = createClient(SaaSCfg.SUPABASE_URL, SaaSCfg.SUPABASE_ANON_KEY);

window.Util = {
  money(v){ return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); },
  todayISO(){
    const d=new Date();
    d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().split("T")[0];
  },
  esc(v){
    return String(v??"").replace(/[&<>"']/g,m=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  },
  slug(){
    return new URLSearchParams(location.search).get("slug")?.trim().toLowerCase() || "";
  },
  toast(message,type="ok"){
    let el=document.querySelector("#globalToast");
    if(!el){
      el=document.createElement("div");
      el.id="globalToast";
      el.className="toast";
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.className=`toast show ${type}`;
    clearTimeout(Util.toastTimer);
    Util.toastTimer=setTimeout(()=>el.classList.remove("show"),3600);
  },
  productName(){
    return window.SAAS_CONFIG?.PRODUCT_NAME?.trim() || "Plataforma para Barbearias";
  },
  publicUrl(slug,page="barbearia.html"){
    const base=(window.SAAS_CONFIG?.PUBLIC_BASE_URL||"").replace(/\/$/,"");
    return `${base||location.origin+location.pathname.replace(/[^/]*$/,"")}${page}?slug=${encodeURIComponent(slug)}`;
  }
};
