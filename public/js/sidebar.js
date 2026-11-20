(function(){
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
#sb .srch-res.hidden{display:none}
#sb .srch-it{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:14px;border:0;background:none;color:var(--text);font:inherit;cursor:pointer;text-align:left;text-decoration:none}
#sb .srch-it:hover{background:var(--surface)}
#sb .srch-av{width:30px;height:30px;border-radius:38% 62% 55% 45%;background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-size:13px;font-weight:700;background-size:cover;background-position:center;flex-shrink:0}
#sb .srch-meta{min-width:0;flex:1}
#sb .srch-meta b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sb .srch-meta small{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sb .it{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:999px;color:var(--text);text-decoration:none;font-weight:600;background:none;border:0;font:inherit;cursor:pointer;width:100%;text-align:left}
#sb .it:hover{background:var(--surface)}#sb .it.act{color:var(--primary);background:var(--surface)}
#sb .it.act .ms{font-variation-settings:'FILL' 1}
#sb .menu{position:absolute;bottom:70px;left:16px;right:16px;background:var(--card);border-radius:24px;padding:8px;box-shadow:0 8px 30px #0004;display:none}
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
<div class="menu" id="sbmenu"><a class="it" href="/profile"><span class="ms">palette</span>Theme &amp; settings</a><button class="it" id="sbout"><span class="ms">logout</span>Sign out</button></div>`;
document.body.appendChild(nav);document.body.classList.add("has-sb");

function mark(){const h=location.hash;let id=(page==="home"||page==="scroll")?(h==="#fyp"?"fyp":h==="#following"?"following":h==="#friends"?"friends":"explore"):page;
 nav.querySelectorAll(".it[data-id]").forEach(e=>e.classList.toggle("act",e.dataset.id===id))}
mark();addEventListener("hashchange",mark);

/* Live user search + video search */
const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let _sbClient=null, _sTimer=null, _sSeq=0;
function getSb(){
  if(window.sb) return window.sb;
  if(!_sbClient&&window.supabase&&window.WT_CONFIG) _sbClient=supabase.createClient(WT_CONFIG.SUPABASE_URL,WT_CONFIG.SUPABASE_ANON_KEY);
  return _sbClient;
}
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
document.addEventListener("click",e=>{if(!nav.querySelector(".srch-wrap").contains(e.target)) sRes.classList.add("hidden");});
nav.querySelector("#sbq").onsubmit=e=>{e.preventDefault();const q=sInput.value.trim();sRes.classList.add("hidden");if(q)location.href="/scroll#search="+encodeURIComponent(q)};

nav.querySelector('[data-id="upload"]').onclick=()=>{const b=document.getElementById("openUpload");if(b&&!b.classList.contains("hidden"))b.click();else location.href="/scroll"};
nav.querySelector("#sbmore").onclick=()=>nav.querySelector("#sbmenu").classList.toggle("open");
nav.querySelector("#sbout").onclick=async()=>{try{await getSb().auth.signOut()}catch(e){}location.href="/"};
})();

