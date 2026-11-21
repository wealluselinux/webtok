(function(){
const M3_COOKIE_7="polygon(94.8% 50.0%,97.1% 53.5%,98.4% 57.3%,98.4% 61.0%,96.8% 64.4%,93.9% 67.2%,90.4% 69.4%,86.7% 71.2%,83.6% 72.9%,81.3% 74.9%,79.8% 77.6%,78.8% 81.1%,77.9% 85.0%,76.6% 89.0%,74.5% 92.4%,71.5% 94.7%,67.9% 95.6%,63.9% 95.1%,60.0% 93.7%,56.3% 91.9%,53.0% 90.5%,50.0% 90.0%,47.0% 90.5%,43.7% 91.9%,40.0% 93.7%,36.1% 95.1%,32.1% 95.6%,28.5% 94.7%,25.5% 92.4%,23.4% 89.0%,22.1% 85.0%,21.2% 81.1%,20.2% 77.6%,18.7% 74.9%,16.4% 72.9%,13.3% 71.2%,9.6% 69.4%,6.1% 67.2%,3.2% 64.4%,1.6% 61.0%,1.6% 57.3%,2.9% 53.5%,5.2% 50.0%,7.7% 46.8%,9.8% 43.9%,11.0% 41.1%,11.2% 38.0%,10.5% 34.5%,9.6% 30.6%,9.1% 26.4%,9.5% 22.4%,11.2% 19.1%,14.1% 16.7%,17.9% 15.4%,22.1% 15.0%,26.1% 15.0%,29.7% 14.8%,32.6% 14.0%,35.2% 12.2%,37.5% 9.5%,40.0% 6.3%,43.0% 3.3%,46.3% 1.2%,50.0% 0.4%,53.7% 1.2%,57.0% 3.3%,60.0% 6.3%,62.5% 9.5%,64.8% 12.2%,67.4% 14.0%,70.3% 14.8%,73.9% 15.0%,77.9% 15.0%,82.1% 15.4%,85.9% 16.7%,88.8% 19.1%,90.5% 22.4%,90.9% 26.4%,90.4% 30.6%,89.5% 34.5%,88.8% 38.0%,89.0% 41.1%,90.2% 43.9%,92.3% 46.8%)";
const css=`
@font-face{font-family:"Material Symbols Rounded";font-style:normal;font-weight:400;font-display:block;src:url(/fonts/material-symbols-rounded.woff2) format("woff2")}
.ms{width:1em;height:1em;overflow:hidden;font-family:'Material Symbols Rounded';font-weight:400;font-style:normal;font-size:24px;line-height:1;display:inline-block;vertical-align:middle;letter-spacing:normal;text-transform:none;white-space:nowrap;font-feature-settings:'liga';-webkit-font-smoothing:antialiased;font-variation-settings:'FILL' 0}
.on>.ms,.ms.fill{font-variation-settings:'FILL' 1}
:root{--sbw:248px;--sbh:0px}
#sb{position:fixed;left:0;top:0;bottom:0;width:var(--sbw);z-index:30;display:flex;flex-direction:column;gap:4px;padding:16px 12px;background:var(--bg);border-right:1px solid var(--surface);overflow-y:auto}
#sb .brand{display:flex;align-items:center;gap:10px;font-size:24px;font-weight:700;color:var(--text);text-decoration:none;padding:4px 10px 12px}
#sb .brand img{width:28px;height:28px;image-rendering:auto}
#sb .srch-wrap{position:relative;margin-bottom:8px}
#sb .srch{display:flex;align-items:center;gap:8px;background:var(--surface);border-radius:999px;padding:0 14px}
#sb .srch input{flex:1;min-width:0;background:none;border:0;color:var(--text);font:inherit;padding:12px 0;outline:0}
#sb .srch-res{position:absolute;left:0;right:0;top:calc(100% + 6px);background:var(--card);border-radius:20px;padding:6px;box-shadow:0 8px 28px #0004;z-index:40;max-height:300px;overflow-y:auto}
#sb .srch-res.hidden,#sb .hidden{display:none}
#sb .srch-it{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:14px;border:0;background:none;color:var(--text);font:inherit;cursor:pointer;text-align:left;text-decoration:none}
#sb .srch-it:hover{background:var(--surface)}
#sb .srch-av{width:32px;height:32px;clip-path:${M3_COOKIE_7};background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-size:13px;font-weight:700;background-size:cover;background-position:center;flex-shrink:0}
#sb .srch-meta{min-width:0;flex:1}
#sb .srch-meta b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sb .srch-meta small{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sb .it{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:999px;color:var(--text);text-decoration:none;font-weight:600;background:none;border:0;font:inherit;cursor:pointer;width:100%;text-align:left}
#sb .it:hover{background:var(--surface)}#sb .it.act{color:var(--primary);background:var(--surface)}
#sb .it.act .ms{font-variation-settings:'FILL' 1}
#sb .menu{position:absolute;bottom:70px;left:16px;right:16px;background:var(--card);border-radius:24px;padding:8px;box-shadow:0 8px 30px #0004;display:none;z-index:45}
#sb .menu.open{display:block}
body.has-sb #feed,body.has-sb #landing{left:var(--sbw);bottom:var(--sbh)}
body.has-sb #bar{display:none!important}
@media(max-width:800px){:root{--sbw:0px;--sbh:62px}
 #sb{top:auto;width:100%;height:var(--sbh);flex-direction:row;justify-content:space-around;align-items:center;padding:0 6px;border-right:0;border-top:1px solid var(--surface);overflow:visible}
 #sb .brand,#sb .srch-wrap,#sb .lbl{display:none}#sb .it{width:auto;padding:12px}#sb .menu{bottom:70px;left:auto;right:8px;width:220px}}`;
document.head.insertAdjacentHTML("beforeend","<style>"+css+"</style>");
const items=[
  ["fyp","auto_awesome","For You","/scroll#fyp"],
  ["explore","explore","Explore","/scroll"],
  ["following","person_check","Following","/scroll#following"],
  ["friends","group","Friends","/scroll#friends"],
  ["upload","add_box","Upload",null],
  ["games","sports_esports","Games","/games"],
  ["activity","notifications","Activity","/activity"],
  ["messages","chat_bubble","Messages","/messages"],
  ["profile","account_circle","Profile","/profile"]
];
const page=document.body.dataset.page||"home";
const nav=document.createElement("nav");nav.id="sb";
nav.innerHTML=`<a class="brand" href="/"><img src="/images/logo.png" alt=""><span>Web Tok</span></a>
<div class="srch-wrap">
  <form class="srch" id="sbq"><span class="ms">search</span><input placeholder="Search users or videos" aria-label="Search"></form>
  <div class="srch-res hidden" id="sbq-res"></div>
</div>`+
items.map(([id,ic,l,h])=>h?`<a class="it" data-id="${id}" href="${h}"><span class="ms">${ic}</span><span class="lbl">${l}</span></a>`:`<button class="it" data-id="${id}"><span class="ms">${ic}</span><span class="lbl">${l}</span></button>`).join("")+
`<button class="it" id="sbmore"><span class="ms">more_horiz</span><span class="lbl">More</span></button>
<div class="menu" id="sbmenu">
  <a class="it" href="/profile"><span class="ms">palette</span>Theme &amp; settings</a>
  <a class="it" href="/developer"><span class="ms">code</span>Developer Studio</a>
  <a class="it hidden" id="sbadmin" href="/admin"><span class="ms">admin_panel_settings</span>Admin panel</a>
  <a class="it" href="/privacy"><span class="ms">privacy_tip</span>Privacy Policy</a>
  <a class="it" href="/terms"><span class="ms">description</span>Terms of Service</a>
  <button class="it" id="sbout"><span class="ms">logout</span>Sign out</button>
</div>`;
document.body.appendChild(nav);document.body.classList.add("has-sb");

function mark(){const h=location.hash;let id=(page==="home"||page==="scroll")?(h==="#fyp"?"fyp":h==="#following"?"following":h==="#friends"?"friends":"explore"):page;
 nav.querySelectorAll(".it[data-id]").forEach(e=>e.classList.toggle("act",e.dataset.id===id))}
mark();addEventListener("hashchange",mark);

/* Live user search + video search */
const esc=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let _sbClient=null, _sTimer=null, _sSeq=0;
function getSb(){
  if(window.sb) return window.sb;
  if(!_sbClient&&window.supabase&&window.WT_CONFIG) _sbClient=supabase.createClient(WT_CONFIG.SUPABASE_URL,WT_CONFIG.SUPABASE_ANON_KEY);
  return _sbClient;
}
(async()=>{
  try{
    const c=getSb(); if(!c?.auth?.getSession) return;
    const {data}=await c.auth.getSession();
    const uid=data?.session?.user?.id; if(!uid) return;
    const r=await fetch("/api/profiles/"+encodeURIComponent(uid)+"/badge");
    const j=await r.json().catch(()=>({}));
    const role=j?.data?.role||j?.role;
    if(role==="admin"||role==="owner") nav.querySelector("#sbadmin")?.classList.remove("hidden");
  }catch{}
})();
const sInput=nav.querySelector("#sbq input"), sRes=nav.querySelector("#sbq-res");
sInput.addEventListener("input",()=>{
  clearTimeout(_sTimer);
  const q=sInput.value.trim();
  if(!q){sRes.classList.add("hidden");sRes.innerHTML="";return;}
  const my=++_sSeq;
  _sTimer=setTimeout(async()=>{
    const client=getSb();
    let users=[];
    if(client){
      try{
        const clean=q.replace(/[%_]/g,"");
        const {data}=await client.from("profiles").select("id,username,display_name,avatar_url").or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`).limit(6);
        users=data||[];
      }catch{}
    }
    if(my!==_sSeq) return;
    sRes.innerHTML="";
    users.forEach(u=>{
      const a=document.createElement("a");
      a.className="srch-it";
      a.href="/profile?u="+encodeURIComponent(u.username);
      const init=esc((u.display_name||u.username||"U")[0].toUpperCase());
      const av=u.avatar_url?`style="background-image:url(${esc(u.avatar_url)})"`:"";
      a.innerHTML=`<span class="srch-av" ${av}>${u.avatar_url?"":init}</span><span class="srch-meta"><b>${esc(u.display_name||u.username)}</b><small>@${esc(u.username)}</small></span>`;
      a.onclick=()=>sRes.classList.add("hidden");
      sRes.appendChild(a);
    });
    const vidBtn=document.createElement("button");
    vidBtn.type="button";
    vidBtn.className="srch-it";
    vidBtn.innerHTML=`<span class="ms" style="font-size:20px;color:var(--primary)">search</span><span class="srch-meta"><b>Search videos for “${esc(q)}”</b></span>`;
    vidBtn.onclick=()=>{sRes.classList.add("hidden");location.href="/scroll#search="+encodeURIComponent(q);};
    sRes.appendChild(vidBtn);
    sRes.classList.remove("hidden");
  },250);
});
document.addEventListener("click",e=>{
  if(!nav.querySelector(".srch-wrap").contains(e.target)) sRes.classList.add("hidden");
  if(!nav.querySelector("#sbmenu").contains(e.target)&&e.target!==nav.querySelector("#sbmore")&&!nav.querySelector("#sbmore").contains(e.target)) nav.querySelector("#sbmenu").classList.remove("open");
});
nav.querySelector("#sbq").onsubmit=e=>{e.preventDefault();const q=sInput.value.trim();sRes.classList.add("hidden");if(q)location.href="/scroll#search="+encodeURIComponent(q)};

nav.querySelector('[data-id="upload"]').onclick=()=>{const b=document.getElementById("openUpload");if(b&&!b.classList.contains("hidden"))b.click();else location.href="/scroll"};
nav.querySelector("#sbmore").onclick=e=>{e.stopPropagation();nav.querySelector("#sbmenu").classList.toggle("open");};
nav.querySelector("#sbout").onclick=async()=>{try{await getSb().auth.signOut()}catch(e){}location.href="/"};
})();