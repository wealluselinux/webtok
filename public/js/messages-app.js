/* Messages: DMs, Web Tok AI (@webtok_ai), Notifications (@notifications), Group Chats (3-avatar collage, owner kick/delete), Stickers, Invites, Sidebar */
const $=id=>document.getElementById(id), sb=supabase.createClient(WT_CONFIG.SUPABASE_URL,WT_CONFIG.SUPABASE_ANON_KEY);
const esc=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const NOTIF_BOT={id:"00000000-0000-0000-0000-000000000001",username:"notifications",display_name:"Notifications",isNotif:true};
const AI_BOT={id:"00000000-0000-0000-0000-000000000002",username:"webtok_ai",display_name:"Web Tok AI",isAi:true};
let me=null, token=null, cur=null, curType=null, friends=[], groups=[], invites=[], unreadBySender={}, hasNotifs=false, activeTab="all", groupPoll=null, dmPoll=null, lastGroupMsgId=0, dmLastReadId=0, onlineByUid={};
const avStyle=p=>p&&p.avatar_url?`style="background-image:url(${esc(p.avatar_url)})"`:"";
const dmRoomId=(a,b)=>"dm:"+[String(a),String(b)].sort().join(":");

function groupAvatarHtml(g){
  const ms=(g&&Array.isArray(g.members)?g.members:[]).slice(0,3);
  if(!ms.length) return `<div class="av grp"><span class="ms">groups</span></div>`;
  const cls=ms.length===1?"c1":ms.length===2?"c2":"c3";
  const tiles=ms.map((m,i)=>{
    const init=esc((m.display_name||m.username||"?")[0].toUpperCase());
    const bg=m.avatar_url?`style="background-image:url(${esc(m.avatar_url)})"`:"";
    return `<div class="av-tile t${i}" ${bg}>${m.avatar_url?"":init}</div>`;
  }).join("");
  return `<div class="av-collage ${cls}">${tiles}</div>`;
}

let lottieP=null;
function ensureLottie(){if(window.lottie)return Promise.resolve(window.lottie);return lottieP||(lottieP=new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js";s.onload=()=>ok(window.lottie);s.onerror=no;document.head.appendChild(s)}))}
async function lottieIn(el,path){try{(await ensureLottie()).loadAnimation({container:el,renderer:"svg",loop:true,autoplay:true,path})}catch(e){console.warn(e)}}
const STK=/^\[sticker:([^\]\/\\]+\.(?:png|gif|webp|jpe?g|svg|json))\]$/i;
const STKU=/^\[sticker_url:(https?:\/\/[^\]]+)\]$/i;
const VSHARE=/^\[video_share:([^|\]]+)\|([^\]]*)\](?:\n([\s\S]*))?$/;
function stickerEl(file){const url="/stickers/"+encodeURIComponent(file);if(/\.json$/i.test(file)){const b=document.createElement("div");b.className="stk-box";lottieIn(b,url);return b}const i=document.createElement("img");i.src=url;i.alt="sticker";i.loading="lazy";return i}
function api(url, opts={}){return fetch(url,{...opts,headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,...(opts.headers||{})}}).then(async r=>{const raw=await r.text();let j={};try{j=JSON.parse(raw)}catch{}if(!r.ok||j.error)throw new Error(j.error?.message||j.message||(raw?`HTTP ${r.status}: ${raw.slice(0,140)}`:`HTTP ${r.status} ${r.statusText||"Request failed"}`));return j.data})}

function bubble(m, showSender=false){
  if(m.id!=null && $("msgs")?.querySelector(`[data-mid="${CSS.escape(String(m.id))}"]`)) return null;
  const wrap=document.createElement("div");
  wrap.className="m-wrap"+(m.sender_id===me?" me":"");
  if(m.id!=null) wrap.dataset.mid=String(m.id);
  if(showSender && m.sender_id!==me){
    const sn=document.createElement("div");
    sn.className="m-sender";
    sn.textContent=m.display_name||("@"+(m.username||"user"));
    wrap.appendChild(sn);
  }
  const d=document.createElement("div");d.className="m";
  const raw=(m.body||"").trim();
  const su=STKU.exec(raw), s=STK.exec(raw), vs=VSHARE.exec(raw);
  if(vs){
    const card=document.createElement("a");
    card.className="vid-share-card";
    card.href="/scroll#v="+encodeURIComponent(vs[1]);
    card.innerHTML=`<div class="vid-share-ic"><span class="ms">play_arrow</span></div><div><b style="display:block;font-size:13px">${esc(vs[2]||"Shared Web Tok")}</b><small style="opacity:.8;font-size:11px">Tap to watch video</small></div>`;
    d.appendChild(card);
    if(vs[3]){const note=document.createElement("div");note.textContent=vs[3];d.appendChild(note);}
  } else if(su){d.classList.add("stk");const i=document.createElement("img");i.src=su[1];i.alt="sticker";i.loading="lazy";d.appendChild(i)}
  else if(s){d.classList.add("stk");d.appendChild(stickerEl(s[1]))}
  else d.textContent=m.body;
  wrap.appendChild(d);
  if(m.sender_id===me && cur && !cur.isAi && !cur.isNotif){
    const rc=document.createElement("div");
    rc.className="m-receipt";
    if(curType==="dm"){
      rc.textContent=(m.id!=null && Number(m.id)<=dmLastReadId)?"Seen":"Sent";
    } else if(curType==="group"){
      const cnt=Number(m.read_count||0);
      rc.textContent=cnt>0?`Read by ${cnt}`:"Sent";
    }
    wrap.appendChild(rc);
  }
  $("msgs").appendChild(wrap);
  $("msgs").scrollTop=1e9;
  return wrap;
}

function updateDmReceipts(lastReadId){
  dmLastReadId=Math.max(dmLastReadId,Number(lastReadId||0));
  $("msgs")?.querySelectorAll(".m-wrap.me[data-mid]").forEach(w=>{
    if(Number(w.dataset.mid)<=dmLastReadId){
      const rc=w.querySelector(".m-receipt");
      if(rc) rc.textContent="Seen";
    }
  });
}
window.wtOnDmRead=msg=>{if(curType==="dm"&&cur&&msg?.by===cur.id)updateDmReceipts(msg.lastReadId);};

function updateGroupReceipts(memberReads){
  $("msgs")?.querySelectorAll(".m-wrap.me[data-mid]").forEach(w=>{
    const mid=Number(w.dataset.mid);
    const cnt=(memberReads||[]).filter(r=>r.user_id!==me && Number(r.last_read_id||0)>=mid).length;
    const rc=w.querySelector(".m-receipt");
    if(rc) rc.textContent=cnt>0?`Read by ${cnt}`:"Sent";
  });
}

async function refreshPresence(){
  const ids=friends.map(f=>f.id);
  if(!ids.length || !token) return;
  try{
    const res=await api(`/api/presence?ids=${encodeURIComponent(ids.join(","))}`);
    onlineByUid=res?.online||{};
    document.querySelectorAll('#fl .fr[data-id]').forEach(row=>{
      const fid=row.dataset.id, isOn=!!onlineByUid[fid];
      const dot=row.querySelector(".on-dot");
      if(dot){dot.classList.toggle("on",isOn);dot.title=isOn?"Online":"Offline";}
      const sub=row.querySelector(".fr-sub");
      const f=friends.find(x=>x.id===fid);
      if(sub && f) sub.textContent=`@${f.username} · ${isOn?"Online":"Offline"}`;
    });
    if(curType==="dm" && cur && !cur.isAi && !cur.isNotif){
      const hs=$("headStatus");
      if(hs){
        const isOn=!!onlineByUid[cur.id];
        hs.className="st-pill"+(isOn?" on":"");
        hs.innerHTML=`<i class="st-dot"></i>${isOn?"Online":"Offline"}`;
      }
    }
  }catch{}
}

function stopGroupPoll(){if(groupPoll){clearInterval(groupPoll);groupPoll=null;}if(dmPoll){clearInterval(dmPoll);dmPoll=null;}}
function makeStickerBlob(file){
  return new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(u);const max=256,sc=Math.min(max/img.width,max/img.height,1);const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*sc));c.height=Math.max(1,Math.round(img.height*sc));c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?resolve(b):reject(new Error("Could not process sticker")),"image/png")};
    img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("Could not read image"))};
    img.src=u;
  });
}
function wireStickerPicker(sendFn){
  if(!$("stkBtn")) return;
  $("stkBtn").onclick=async()=>{
    const pn=$("stkPanel");pn.classList.toggle("hidden");
    if(pn.classList.contains("hidden")||pn.dataset.ready)return;
    await loadStickerGrid(pn,sendFn);
  };
}
async function loadStickerGrid(pn,sendFn){
  pn.dataset.ready="1";
  let list=[]; try{list=await (await fetch("/api/stickers")).json()}catch{}
  pn.innerHTML="";
  const addBtn=document.createElement("button"); addBtn.type="button"; addBtn.className="stk-add";
  addBtn.innerHTML='<span class="ms">add_photo_alternate</span><span>Make</span>';
  const fin=document.createElement("input"); fin.type="file"; fin.accept="image/png,image/webp,image/jpeg,image/gif"; fin.hidden=true;
  addBtn.onclick=()=>fin.click();
  fin.onchange=async e=>{
    const f=e.target.files?.[0]; if(!f)return;
    addBtn.disabled=true;
    try{
      const blob=await makeStickerBlob(f), path=`${me}/sticker-${crypto.randomUUID()}.png`;
      const up=await sb.storage.from("avatars").upload(path,blob,{upsert:true,contentType:"image/png"});
      if(up?.error)throw up.error;
      const url=sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      await api("/api/stickers",{method:"POST",body:JSON.stringify({name:f.name.replace(/\.[^.]+$/,"").slice(0,30)||"Sticker",url})});
      await loadStickerGrid(pn,sendFn);
    }catch(err){await wtAlert({title:"Couldn't create sticker",message:err?.message||"Could not create sticker."})}
    finally{addBtn.disabled=false;e.target.value="";}
  };
  pn.appendChild(addBtn); pn.appendChild(fin);
  if(!list.length){const msg=document.createElement("div");msg.style.cssText="grid-column:span 3;color:var(--muted);padding:8px;font-size:12px;align-self:center";msg.textContent="Tap Make to create a sticker!";pn.appendChild(msg);return}
  list.forEach(item=>{
    const b=document.createElement("button"); b.type="button";
    if(item&&typeof item==="object"&&item.url){
      b.innerHTML=`<img src="${esc(item.url)}" alt="${esc(item.name||"sticker")}" loading="lazy">`;
      b.onclick=()=>{pn.classList.add("hidden");sendFn("[sticker_url:"+item.url+"]")};
    }else{
      const file=String(item);
      b.appendChild(stickerEl(file));
      b.onclick=()=>{pn.classList.add("hidden");sendFn("[sticker:"+file+"]")};
    }
    pn.appendChild(b);
  });
}

async function openChat(f){
  stopGroupPoll();
  cur=f; curType="dm"; document.body.classList.add("chatting");
  delete unreadBySender[f.id];
  renderSidebarList();
  const isFriend=!f.isAi && !f.isNotif;
  const avHtml=f.isAi
    ?'<div class="av ai"><span class="ms">smart_toy</span></div>'
    :f.isNotif
    ?'<div class="av ai"><span class="ms">notifications</span></div>'
    :`<div class="av" ${avStyle(f)}>${f.avatar_url?"":esc((f.display_name||f.username||"?")[0].toUpperCase())}</div>`;
  const isOn=isFriend && !!onlineByUid[f.id];
  const subHtml=isFriend
    ?`@${esc(f.username)} · <span id="headStatus" class="st-pill${isOn?" on":""}"><i class="st-dot"></i>${isOn?"Online":"Offline"}</span>`
    :`@${esc(f.username)}${f.isAi?" · Powered by NVIDIA NIM":f.isNotif?" · Official Announcements":""}`;
  const callActions=isFriend
    ?`<button type="button" class="head-chip p" id="btnCall"><span class="ms" style="font-size:16px">call</span>Call</button><button type="button" class="head-chip" id="btnMicTest" title="Test microphone"><span class="ms" style="font-size:16px">mic</span>Test Mic</button>`
    :"";
  const bottomHtml=f.isNotif
    ?'<div style="padding:12px 16px;text-align:center;font-size:12px;color:var(--muted);border-top:1px solid var(--surface)">Official Web Tok announcements (read-only)</div>'
    :`<div id="stkPanel" class="hidden"></div><form id="form"><input id="txt" maxlength="1000" placeholder="${f.isAi?"Ask Web Tok AI anything or share a video…":"Message…"}" autocomplete="off"><button type="button" id="stkBtn" aria-label="Stickers"><span class="ms">emoji_emotions</span></button><button aria-label="Send"><span class="ms">send</span></button></form>`;
  $("chat").innerHTML=`<div id="head"><button id="back" aria-label="Back"><span class="ms">arrow_back</span></button>${avHtml}<div><div>${esc(f.display_name||f.username)}</div><div class="head-sub">${subHtml}</div></div><div class="head-actions">${callActions}<button type="button" class="head-chip" id="btnClearChat" title="Clear chat"><span class="ms" style="font-size:16px">delete_sweep</span>Clear</button></div></div>
  <div id="callBar" class="hidden"></div>
  <div id="msgs"><div class="m3-loader"><div class="m3-wave"><svg viewBox="0 0 160 14" fill="none"><path d="M0 7 Q10 1 20 7 T40 7 T60 7 T80 7 T100 7 T120 7 T140 7 T160 7" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round"/></svg></div></div></div>
  ${bottomHtml}`;
  $("back").onclick=()=>{stopGroupPoll();document.body.classList.remove("chatting");cur=null;curType=null};
  if(isFriend){
    const rid=dmRoomId(me,f.id);
    $("btnCall").onclick=()=>{if(callGroupId===rid)leaveCall();else joinCall(rid);};
    $("btnMicTest").onclick=()=>openMicTest();
    if(callGroupId!==rid){
      try{callState=await api(`/api/groups/${encodeURIComponent(rid)}/call`);}catch{callState={participants:[],activity:"none",watch:{video:null,playing:false,time:0}};}
    }
    renderCallUI();
  }
  $("btnClearChat").onclick=async()=>{
    const ok=await wtConfirm({title:"Clear chat?",message:`Delete all messages with ${f.display_name||"@"+f.username}? This can't be undone.`,icon:"delete_sweep",confirmText:"Clear",danger:true});
    if(!ok)return;
    try{
      await api(`/api/messages/with/${encodeURIComponent(f.id)}`,{method:"DELETE"});
      if(f.isNotif) hasNotifs=false;
      $("msgs").innerHTML=f.isAi
        ?'<div class="empty">Hi! Ask me anything or share a Web Tok video to ask what it\'s about.</div>'
        :f.isNotif
        ?'<div class="empty">No announcements right now.</div>'
        :'<div class="empty">Chat cleared. Say hi!</div>';
      renderSidebarList();
    }catch(err){await wtAlert({title:"Couldn't clear chat",message:err.message});}
  };
  dmLastReadId=0;
  const [{data}, rsData]=await Promise.all([
    sb.from("messages").select("*").or(`and(sender_id.eq.${me},recipient_id.eq.${f.id}),and(sender_id.eq.${f.id},recipient_id.eq.${me})`).order("created_at").limit(300),
    isFriend?api(`/api/messages/read-status?with=${encodeURIComponent(f.id)}`).catch(()=>null):Promise.resolve(null)
  ]);
  if(rsData?.lastReadId) dmLastReadId=Number(rsData.lastReadId);
  $("msgs").innerHTML="";
  if(f.isAi && !(data||[]).length){
    $("msgs").innerHTML='<div class="empty">Hi! Ask me anything or share a Web Tok video to ask what it\'s about.</div>';
  } else if(f.isNotif && !(data||[]).length){
    $("msgs").innerHTML='<div class="empty">No announcements right now.</div>';
  }
  (data||[]).forEach(m=>bubble(m,false));
  if(window.wtMarkRead) wtMarkRead(f.id);
  else if(isFriend) api("/api/messages/read",{method:"POST",body:JSON.stringify({from:f.id})}).catch(()=>{});
  if(isFriend){
    dmPoll=setInterval(async()=>{
      if(curType!=="dm"||!cur||cur.id!==f.id||document.hidden)return;
      try{
        const rs=await api(`/api/messages/read-status?with=${encodeURIComponent(f.id)}`);
        if(rs?.lastReadId) updateDmReceipts(rs.lastReadId);
      }catch{}
    },3000);
  }

  async function send(body){
    if(f.isAi){
      const em=$("msgs").querySelector(".empty"); if(em) em.remove();
      const myWrap=bubble({sender_id:me,body},false);
      const typing=bubble({sender_id:f.id,body:"Thinking…"},false);
      try{
        const res=await api("/api/ai/chat",{method:"POST",body:JSON.stringify({body})});
        typing.remove();
        if(res?.userMsg?.id) myWrap.dataset.mid=String(res.userMsg.id);
        if(res?.aiMsg) bubble(res.aiMsg,false);
        return true;
      }catch(err){
        typing.remove(); myWrap.remove();
        await wtAlert({title:"Web Tok AI Error",message:err.message});
        return false;
      }
    }
    const {data:m,error}=await sb.from("messages").insert({sender_id:me,recipient_id:f.id,body}).select().single();
    if(error){await wtAlert({title:"Couldn't send",message:error.message});return false}
    bubble(m,false);return true;
  }
  if($("form")){
    $("form").onsubmit=async e=>{e.preventDefault();const body=$("txt").value.trim();if(!body)return;$("txt").value="";if(!(await send(body)))$("txt").value=body};
    wireStickerPicker(send);
    $("txt").focus();
  }
}

async function openGroupChat(g){
  stopGroupPoll();
  cur=g; curType="group"; lastGroupMsgId=0; g.unread_count=0;
  document.body.classList.add("chatting");
  renderSidebarList();
  const isOwner=g.created_by===me;
  const ownerDelBtn=isOwner?`<button class="head-chip bad" id="btnDeleteGrp"><span class="ms" style="font-size:16px">delete</span>Delete</button>`:"";
  $("chat").innerHTML=`<div id="head"><button id="back" aria-label="Back"><span class="ms">arrow_back</span></button>${groupAvatarHtml(g)}<div style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</div><div id="grpSubCount" style="font-size:12px;color:var(--muted);font-weight:500">${g.member_count||1} member${(g.member_count||1)===1?"":"s"}</div></div><div class="head-actions"><button class="head-chip p" id="btnCall"><span class="ms" style="font-size:16px">call</span>Call</button><button class="head-chip" id="btnMicTest" title="Test microphone"><span class="ms" style="font-size:16px">mic</span>Test Mic</button><button class="head-chip" id="btnMembers"><span class="ms" style="font-size:16px">group</span>Members</button><button class="head-chip" id="btnInvMore"><span class="ms" style="font-size:16px">person_add</span>Invite</button><button class="head-chip" id="btnLeaveGrp">Leave</button>${ownerDelBtn}</div></div>
  <div id="callBar" class="hidden"></div>
  <div id="msgs"><div class="m3-loader"><div class="m3-wave"><svg viewBox="0 0 160 14" fill="none"><path d="M0 7 Q10 1 20 7 T40 7 T60 7 T80 7 T100 7 T120 7 T140 7 T160 7" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round"/></svg></div></div></div>
  <div id="stkPanel" class="hidden"></div>
  <form id="form"><input id="txt" maxlength="1000" placeholder="Message ${esc(g.name)}…" autocomplete="off"><button type="button" id="stkBtn" aria-label="Stickers"><span class="ms">emoji_emotions</span></button><button aria-label="Send"><span class="ms">send</span></button></form>`;
  $("back").onclick=()=>{stopGroupPoll();document.body.classList.remove("chatting");cur=null;curType=null};
  $("btnCall").onclick=()=>{if(callGroupId===g.id)leaveCall();else joinCall(g.id);};
  $("btnMicTest").onclick=()=>openMicTest();
  $("btnMembers").onclick=()=>openGroupMembers(g);
  $("btnLeaveGrp").onclick=async()=>{
    const ok=await wtConfirm({title:"Leave group?",message:`Are you sure you want to leave "${g.name}"?`,icon:"logout",confirmText:"Leave",danger:true});
    if(!ok)return;
    if(callGroupId===g.id) leaveCall();
    await api(`/api/groups/${encodeURIComponent(g.id)}/leave`,{method:"POST",body:"{}"});
    stopGroupPoll(); cur=null; curType=null; document.body.classList.remove("chatting");
    $("chat").innerHTML='<div class="empty">Left group chat.</div>';
    await loadGroupsAndInvites();
  };
  if($("btnDeleteGrp")){
    $("btnDeleteGrp").onclick=async()=>{
      const ok=await wtConfirm({title:"Delete group chat?",message:`Permanently delete "${g.name}" and all its messages for everyone?`,icon:"delete_forever",confirmText:"Delete group",danger:true});
      if(!ok)return;
      try{
        if(callGroupId===g.id) leaveCall();
        await api(`/api/groups/${encodeURIComponent(g.id)}`,{method:"DELETE"});
        stopGroupPoll(); cur=null; curType=null; document.body.classList.remove("chatting");
        $("chat").innerHTML='<div class="empty">Group chat deleted.</div>';
        await loadGroupsAndInvites();
      }catch(err){await wtAlert({title:"Couldn't delete group",message:err.message});}
    };
  }
  $("btnInvMore").onclick=()=>openInviteMore(g);
  if(callGroupId!==g.id){ try{const cs=await api(`/api/groups/${encodeURIComponent(g.id)}/call`);callState=cs;}catch{} }
  renderCallUI();

  const msgs=await api(`/api/groups/${encodeURIComponent(g.id)}/messages`);
  $("msgs").innerHTML="";
  if(!msgs.length) $("msgs").innerHTML='<div class="empty">No messages yet. Say hi!</div>';
  msgs.forEach(m=>{bubble(m,true);lastGroupMsgId=Math.max(lastGroupMsgId,m.id)});

  async function send(body){
    try{
      const m=await api(`/api/groups/${encodeURIComponent(g.id)}/messages`,{method:"POST",body:JSON.stringify({body})});
      const em=$("msgs").querySelector(".empty"); if(em) em.remove();
      if(m.id>lastGroupMsgId){bubble(m,true);lastGroupMsgId=m.id;}
      return true;
    }catch(err){await wtAlert({title:"Couldn't send",message:err.message});return false}
  }
  $("form").onsubmit=async e=>{e.preventDefault();const body=$("txt").value.trim();if(!body)return;$("txt").value="";if(!(await send(body)))$("txt").value=body};
  wireStickerPicker(send);
  $("txt").focus();

  groupPoll=setInterval(async()=>{
    if(curType!=="group"||!cur||cur.id!==g.id||document.hidden)return;
    try{
      const [newer,reads]=await Promise.all([
        api(`/api/groups/${encodeURIComponent(g.id)}/messages?after=${lastGroupMsgId}`),
        api(`/api/groups/${encodeURIComponent(g.id)}/reads`).catch(()=>null)
      ]);
      if(newer.length){
        const em=$("msgs").querySelector(".empty"); if(em) em.remove();
        newer.forEach(m=>{if(m.id>lastGroupMsgId){bubble(m,true);lastGroupMsgId=m.id}});
      }
      if(reads?.memberReads) updateGroupReceipts(reads.memberReads);
    }catch{}
  },3000);
}

function openGroupMembers(g){
  const isOwner=g.created_by===me;
  $("gmTitle").textContent=`Members · ${g.name}`;
  $("gmHint").textContent="";
  const list=$("gmList"); list.innerHTML="";
  (g.members||[]).forEach(m=>{
    const row=document.createElement("div"); row.className="pick-row"; row.style.cursor="default";
    const isGrpOwner=m.id===g.created_by;
    const kickBtn=(isOwner && m.id!==me)
      ?`<button type="button" class="head-chip bad" style="margin-left:auto">Kick</button>`
      :"";
    row.innerHTML=`<div class="av" style="width:36px;height:36px" ${avStyle(m)}>${m.avatar_url?"":esc((m.display_name||m.username||"?")[0].toUpperCase())}</div>
      <div style="min-width:0;flex:1"><b>${esc(m.display_name||m.username)}</b>${isGrpOwner?' <span class="seg-badge" style="margin-left:4px">Owner</span>':""}<div style="font-size:12px;color:var(--muted)">@${esc(m.username)}</div></div>${kickBtn}`;
    const btn=row.querySelector("button");
    if(btn){
      btn.onclick=async()=>{
        const ok=await wtConfirm({title:`Kick @${m.username}?`,message:`Remove ${m.display_name||"@"+m.username} from "${g.name}"?`,icon:"person_remove",confirmText:"Kick",danger:true});
        if(!ok)return;
        btn.disabled=true;
        try{
          await api(`/api/groups/${encodeURIComponent(g.id)}/kick`,{method:"POST",body:JSON.stringify({userId:m.id})});
          g.members=(g.members||[]).filter(x=>x.id!==m.id);
          g.member_count=Math.max(1,(g.member_count||1)-1);
          if($("grpSubCount")) $("grpSubCount").textContent=`${g.member_count} member${g.member_count===1?"":"s"}`;
          row.remove();
          await loadGroupsAndInvites();
        }catch(err){$("gmHint").textContent=err.message;btn.disabled=false;}
      };
    }
    list.appendChild(row);
  });
  $("grpMembersDlg").showModal();
}

function renderSidebarList(){
  const fl=$("fl"); fl.innerHTML="";
  const badge=$("invBadge");
  badge.textContent=invites.length;
  badge.classList.toggle("hidden",!invites.length);

  if(activeTab==="all"){
    if(hasNotifs || unreadBySender[NOTIF_BOT.id]){
      const nLbl=document.createElement("div"); nLbl.className="sec-lbl"; nLbl.textContent="Announcements"; fl.appendChild(nLbl);
      const nRow=document.createElement("div");
      nRow.className="fr"+(curType==="dm"&&cur?.id===NOTIF_BOT.id?" on":"")+(unreadBySender[NOTIF_BOT.id]?" unread":"");
      nRow.innerHTML=`<div class="av ai"><span class="ms">notifications</span></div><div class="fr-meta"><div class="fr-name">Notifications</div><div class="fr-sub">@notifications · Official updates</div></div><i class="dot"></i>`;
      nRow.onclick=()=>openChat(NOTIF_BOT);
      fl.appendChild(nRow);
    }
    const lbl=document.createElement("div"); lbl.className="sec-lbl"; lbl.textContent="Assistant"; fl.appendChild(lbl);
    const aiRow=document.createElement("div");
    aiRow.className="fr"+(curType==="dm"&&cur?.id===AI_BOT.id?" on":"");
    aiRow.innerHTML=`<div class="av ai"><span class="ms">smart_toy</span></div><div class="fr-meta"><div class="fr-name">Web Tok AI</div><div class="fr-sub">Ask anything or share videos</div></div>`;
    aiRow.onclick=()=>openChat(AI_BOT);
    fl.appendChild(aiRow);
  }

  const showInvites=activeTab==="invites"||(activeTab==="all"&&invites.length);
  const showGroups=activeTab==="all"||activeTab==="groups";
  const showFriends=activeTab==="all"||activeTab==="friends";

  if(showInvites && invites.length){
    const lbl=document.createElement("div"); lbl.className="sec-lbl"; lbl.textContent="Group Invites"; fl.appendChild(lbl);
    invites.forEach(inv=>{
      const card=document.createElement("div"); card.className="inv-card";
      card.innerHTML=`<div class="inv-top"><div class="av grp"><span class="ms">group_add</span></div><div class="fr-meta"><div class="fr-name">${esc(inv.name)}</div><div class="fr-sub">Invited by @${esc(inv.inviter_username||"friend")} · ${inv.member_count||1} in chat</div></div></div>
      <div class="inv-acts"><button class="pill-btn p">Accept</button><button class="pill-btn t">Decline</button></div>`;
      const [accBtn,decBtn]=card.querySelectorAll("button");
      accBtn.onclick=async()=>{accBtn.disabled=true;await api(`/api/groups/${encodeURIComponent(inv.group_id)}/respond`,{method:"POST",body:JSON.stringify({accept:true})});await loadGroupsAndInvites();const joined=groups.find(g=>g.id===inv.group_id);if(joined) openGroupChat(joined);};
      decBtn.onclick=async()=>{decBtn.disabled=true;await api(`/api/groups/${encodeURIComponent(inv.group_id)}/respond`,{method:"POST",body:JSON.stringify({accept:false})});await loadGroupsAndInvites();};
      fl.appendChild(card);
    });
  } else if(activeTab==="invites" && !invites.length){
    fl.innerHTML='<div class="empty">No pending group invites right now.</div>';
    return;
  }

  if(showGroups){
    if(groups.length){
      const lbl=document.createElement("div"); lbl.className="sec-lbl"; lbl.textContent="Group Chats"; fl.appendChild(lbl);
      groups.forEach(g=>{
        const e=document.createElement("div");
        e.className="fr"+(curType==="group"&&cur?.id===g.id?" on":"");
        const callTag=g.call_count?` · ${g.call_count} in call`:"";
        e.innerHTML=`${groupAvatarHtml(g)}<div class="fr-meta"><div class="fr-name">${esc(g.name)}</div><div class="fr-sub">${g.member_count||1} member${(g.member_count||1)===1?"":"s"}${callTag}</div></div>${g.unread_count?`<span class="u-badge">${g.unread_count}</span>`:""}`;
        e.onclick=()=>openGroupChat(g);
        fl.appendChild(e);
      });
    } else if(activeTab==="groups"){
      fl.innerHTML='<div class="empty">No group chats yet. Tap <b>+ Group</b> above to start one with friends!</div>';
      return;
    }
  }

  if(showFriends){
    if(friends.length){
      const lbl=document.createElement("div"); lbl.className="sec-lbl"; lbl.textContent="Friends"; fl.appendChild(lbl);
      friends.forEach(f=>{
        const e=document.createElement("div");
        e.className="fr"+(curType==="dm"&&cur?.id===f.id?" on":"")+(unreadBySender[f.id]?" unread":"");
        e.dataset.id=f.id;
        const isOn=!!onlineByUid[f.id];
        e.innerHTML=`<div class="av-wrap"><div class="av" ${avStyle(f)}>${f.avatar_url?"":esc((f.display_name||f.username||"?")[0].toUpperCase())}</div><i class="on-dot${isOn?" on":""}" title="${isOn?"Online":"Offline"}"></i></div><div class="fr-meta"><div class="fr-name">${esc(f.display_name||f.username)}</div><div class="fr-sub">@${esc(f.username)} · ${isOn?"Online":"Offline"}</div></div><i class="dot"></i>`;
        e.onclick=()=>openChat(f);
        fl.appendChild(e);
      });
    } else if(activeTab==="friends"){
      fl.innerHTML='<div class="empty">No friends yet. Follow someone and have them follow you back.</div>';
    }
  }
}

document.querySelectorAll(".seg-tab").forEach(btn=>{
  btn.onclick=()=>{document.querySelectorAll(".seg-tab").forEach(b=>b.classList.toggle("on",b===btn));activeTab=btn.dataset.tab;renderSidebarList();};
});

$("btnNewGroup").onclick=()=>{
  $("ngName").value=""; $("ngHint").textContent="";
  const box=$("ngFriends"); box.innerHTML="";
  if(!friends.length) box.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px">Follow someone and have them follow you back first.</div>';
  friends.forEach(f=>{
    const row=document.createElement("label"); row.className="pick-row";
    row.innerHTML=`<input type="checkbox" value="${esc(f.id)}"><div class="av" style="width:34px;height:34px" ${avStyle(f)}>${f.avatar_url?"":esc((f.display_name||f.username||"?")[0].toUpperCase())}</div><div><b>${esc(f.display_name||f.username)}</b> <span style="color:var(--muted);font-size:12px">@${esc(f.username)}</span></div>`;
    box.appendChild(row);
  });
  $("newGroupDlg").showModal();
};

$("ngSubmit").onclick=async()=>{
  const name=$("ngName").value.trim();
  const memberIds=[...$("ngFriends").querySelectorAll("input:checked")].map(i=>i.value);
  if(!name){$("ngHint").textContent="Enter a group name.";return}
  if(!memberIds.length){$("ngHint").textContent="Pick at least one friend.";return}
  $("ngSubmit").disabled=true; $("ngHint").textContent="";
  try{const created=await api("/api/groups",{method:"POST",body:JSON.stringify({name,memberIds})});$("newGroupDlg").close();await loadGroupsAndInvites();const g=groups.find(x=>x.id===created.id);if(g)openGroupChat(g);}
  catch(err){$("ngHint").textContent=err.message;}
  finally{$("ngSubmit").disabled=false;}
};

function openInviteMore(g){
  $("imHint").textContent="";
  const inGrp=new Set((g.members||[]).map(m=>m.id)), avail=friends.filter(f=>!inGrp.has(f.id));
  const box=$("imFriends"); box.innerHTML="";
  if(!avail.length) box.innerHTML='<div style="color:var(--muted);font-size:13px;padding:8px">All your friends are already in this group.</div>';
  avail.forEach(f=>{
    const row=document.createElement("label"); row.className="pick-row";
    row.innerHTML=`<input type="checkbox" value="${esc(f.id)}"><div class="av" style="width:34px;height:34px" ${avStyle(f)}>${f.avatar_url?"":esc((f.display_name||f.username||"?")[0].toUpperCase())}</div><div><b>${esc(f.display_name||f.username)}</b> <span style="color:var(--muted);font-size:12px">@${esc(f.username)}</span></div>`;
    box.appendChild(row);
  });
  $("imSubmit").onclick=async()=>{
    const memberIds=[...box.querySelectorAll("input:checked")].map(i=>i.value);
    if(!memberIds.length){$("imHint").textContent="Pick at least one friend.";return}
    $("imSubmit").disabled=true;
    try{await api(`/api/groups/${encodeURIComponent(g.id)}/invite`,{method:"POST",body:JSON.stringify({memberIds})});$("invMoreDlg").close();}
    catch(err){$("imHint").textContent=err.message;}
    finally{$("imSubmit").disabled=false;}
  };
  $("invMoreDlg").showModal();
}

async function loadGroupsAndInvites(){
  try{const res=await api("/api/groups");groups=res.groups||[];invites=res.invites||[];}catch{groups=[];invites=[];}
  renderSidebarList();
}

(async()=>{
  const {data}=await sb.auth.getSession(); if(!data.session){location.href="/login";return}
  me=data.session.user.id; token=data.session.access_token;
  if(typeof ensureWs==="function") ensureWs().catch(()=>{});
  const [a,b]=await Promise.all([sb.from("follows").select("following_id").eq("follower_id",me),sb.from("follows").select("follower_id").eq("following_id",me)]);
  const mine=new Set((a.data||[]).map(r=>r.following_id)), ids=(b.data||[]).map(r=>r.follower_id).filter(id=>mine.has(id));
  if(ids.length){const {data:ps}=await sb.from("profiles").select("id,username,display_name,avatar_url").in("id",ids);friends=ps||[];}
  try{const r=await fetch("/api/messages/unread",{headers:{Authorization:"Bearer "+token}});unreadBySender=(await r.json()).data?.bySender||{};}catch{}
  try{
    const {data:nMsgs}=await sb.from("messages").select("id").or(`and(sender_id.eq.${me},recipient_id.eq.${NOTIF_BOT.id}),and(sender_id.eq.${NOTIF_BOT.id},recipient_id.eq.${me})`).limit(1);
    hasNotifs=!!(nMsgs&&nMsgs.length)||!!unreadBySender[NOTIF_BOT.id];
  }catch{}
  await Promise.all([loadGroupsAndInvites(), refreshPresence()]);
  setInterval(loadGroupsAndInvites,12000);
  setInterval(()=>{if(!document.hidden)refreshPresence();},10000);
  addEventListener("hashchange",()=>{
    const w=location.hash.slice(1);
    if(w===AI_BOT.id) openChat(AI_BOT);
    else if(w===NOTIF_BOT.id) openChat(NOTIF_BOT);
    else {const f=friends.find(x=>x.id===w);if(f)openChat(f);}
  });
  const want=location.hash.slice(1);
  if(want===AI_BOT.id) openChat(AI_BOT);
  else if(want===NOTIF_BOT.id) openChat(NOTIF_BOT);
  else {const wf=friends.find(x=>x.id===want);if(wf)openChat(wf);}
  sb.channel("dm-"+me).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`recipient_id=eq.${me}`},p=>{
    const m=p.new;
    if(m.sender_id===NOTIF_BOT.id) hasNotifs=true;
    if(curType==="dm"&&cur&&cur.id===m.sender_id){bubble(m,false);if(window.wtMarkRead)wtMarkRead(m.sender_id);else api("/api/messages/read",{method:"POST",body:JSON.stringify({from:m.sender_id})}).catch(()=>{});}
    else{unreadBySender[m.sender_id]=1;renderSidebarList()}
  }).subscribe();
})();
