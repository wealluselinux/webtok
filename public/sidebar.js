(function(){
const css=`
@font-face{font-family:"Material Symbols Rounded";font-style:normal;font-weight:400;font-display:block;src:url(/fonts/material-symbols-rounded.woff2) format("woff2")}
.ms{width:1em;height:1em;overflow:hidden;font-family:'Material Symbols Rounded';font-weight:400;font-style:normal;font-size:24px;line-height:1;display:inline-block;vertical-align:middle;letter-spacing:normal;text-transform:none;white-space:nowrap;font-feature-settings:'liga';-webkit-font-smoothing:antialiased;font-variation-settings:'FILL' 0}
.on>.ms,.ms.fill{font-variation-settings:'FILL' 1}
:root{--sbw:248px;--sbh:0px}
#sb{position:fixed;left:0;top:0;bottom:0;width:var(--sbw);z-index:30;display:flex;flex-direction:column;gap:4px;padding:16px 12px;background:var(--bg);border-right:1px solid var(--surface);overflow-y:auto}
#sb .brand{display:flex;align-items:center;gap:10px;font-size:24px;font-weight:700;color:var(--text);text-decoration:none;padding:4px 10px 12px}
#sb .brand img{width:28px;height:28px;image-rendering:auto}
#sb .srch{display:flex;align-items:center;gap:8px;background:var(--surface);border-radius:999px;padding:0 14px;margin-bottom:8px}
#sb .srch input{flex:1;min-width:0;background:none;border:0;color:var(--text);font:inherit;padding:12px 0;outline:0}
#sb .it{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:999px;color:var(--text);text-decoration:none;font-weight:600;background:none;border:0;font:inherit;font-weight:600;cursor:pointer;width:100%;text-align:left}
#sb .it:hover{background:var(--surface)}#sb .it.act{color:var(--primary);background:var(--surface)}
#sb .it.act .ms{font-variation-settings:'FILL' 1}
#sb .menu{position:absolute;bottom:70px;left:16px;right:16px;background:var(--card);border-radius:24px;padding:8px;box-shadow:0 8px 30px #0004;display:none}
#sb .menu.open{display:block}
body.has-sb #feed,body.has-sb #landing{left:var(--sbw);bottom:var(--sbh)}
body.has-sb #bar{display:none!important}
@media(max-width:800px){:root{--sbw:0px;--sbh:62px}
 #sb{top:auto;width:100%;height:var(--sbh);flex-direction:row;justify-content:space-around;align-items:center;padding:0 6px;border-right:0;border-top:1px solid var(--surface);overflow:visible}
 #sb .brand,#sb .srch,#sb .lbl{display:none}#sb .it{width:auto;padding:12px}#sb .menu{bottom:70px;left:auto;right:8px;width:220px}}`;
document.head.insertAdjacentHTML("beforeend","<style>"+css+"</style>");
const items=[["explore","explore","Explore","/scroll"],["following","person_check","Following","/scroll#following"],["friends","group","Friends","/scroll#friends"],["upload","add_box","Upload",null],["messages","chat_bubble","Messages","/messages"],["profile","account_circle","Profile","/profile"]];
const page=document.body.dataset.page||"home";
const nav=document.createElement("nav");nav.id="sb";
nav.innerHTML=`<a class="brand" href="/"><img src="/logo.png" alt=""><span>Web Tok</span></a>
<form class="srch" id="sbq"><span class="ms">search</span><input placeholder="Search" aria-label="Search"></form>`+
items.map(([id,ic,l,h])=>h?`<a class="it" data-id="${id}" href="${h}"><span class="ms">${ic}</span><span class="lbl">${l}</span></a>`:`<button class="it" data-id="${id}"><span class="ms">${ic}</span><span class="lbl">${l}</span></button>`).join("")+
`<button class="it" id="sbmore"><span class="ms">more_horiz</span><span class="lbl">More</span></button>
<div class="menu" id="sbmenu"><a class="it" href="/profile"><span class="ms">palette</span>Theme &amp; settings</a><button class="it" id="sbout"><span class="ms">logout</span>Sign out</button></div>`;
document.body.appendChild(nav);document.body.classList.add("has-sb");
function mark(){const h=location.hash;let id=(page==="home"||page==="scroll")?(h==="#following"?"following":h==="#friends"?"friends":"explore"):page;
 nav.querySelectorAll(".it[data-id]").forEach(e=>e.classList.toggle("act",e.dataset.id===id))}
mark();addEventListener("hashchange",mark);
nav.querySelector("#sbq").onsubmit=e=>{e.preventDefault();const q=e.target.querySelector("input").value.trim();if(q)location.href="/scroll#search="+encodeURIComponent(q)};
nav.querySelector('[data-id="upload"]').onclick=()=>{const b=document.getElementById("openUpload");if(b&&!b.classList.contains("hidden"))b.click();else location.href="/scroll"};
nav.querySelector("#sbmore").onclick=()=>nav.querySelector("#sbmenu").classList.toggle("open");
nav.querySelector("#sbout").onclick=async()=>{try{await supabase.createClient(WT_CONFIG.SUPABASE_URL,WT_CONFIG.SUPABASE_ANON_KEY).auth.signOut()}catch(e){}location.href="/"};
})();
