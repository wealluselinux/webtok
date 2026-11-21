/* Messages: Full-screen Group Voice Calls, Web Tok-style Group Watch scroll feed, and Shared Whiteboard */
let ws=null, callGroupId=null, callFull=true, localStream=null, isMuted=false, peers={};
let callState={participants:[],activity:"none",watch:{video:null,playing:false,time:0}};
let wbColor="#6750a4", wbSize=4, wbDrawing=false, wbLast=null, ignoreSync=false, videoFeedCache=null;

function ensureWs(){
  if(ws && (ws.readyState===0 || ws.readyState===1)) return Promise.resolve(ws);
  return new Promise((resolve,reject)=>{
    const proto=location.protocol==="https:"?"wss:":"ws:";
    ws=new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen=()=>resolve(ws);
    ws.onerror=()=>reject(new Error("WebSocket failed"));
    ws.onmessage=e=>{try{handleWs(JSON.parse(e.data))}catch{}};
    ws.onclose=()=>{if(callGroupId) leaveCall(true);};
  });
}
function wsSend(obj){if(ws&&ws.readyState===1)ws.send(JSON.stringify(obj));}

async function createPeer(remoteUid, initiator){
  if(peers[remoteUid]) return peers[remoteUid];
  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  peers[remoteUid]=pc;
  if(localStream) localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.onicecandidate=e=>{if(e.candidate)wsSend({type:"rtc-ice",to:remoteUid,candidate:e.candidate});};
  pc.ontrack=e=>{
    let a=document.getElementById("aud-"+remoteUid);
    if(!a){a=document.createElement("audio");a.id="aud-"+remoteUid;a.autoplay=true;$("audioBin").appendChild(a);}
    a.srcObject=e.streams[0];
  };
  if(initiator){
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsSend({type:"rtc-offer",to:remoteUid,sdp:offer});
  }
  return pc;
}

async function handleWs(m){
  if(m.type==="joined"){
    callState={participants:m.participants||[],activity:m.activity||"none",watch:m.watch||{video:null,playing:false,time:0}};
    renderCallUI();
    if(m.strokes && m.activity==="whiteboard") replayStrokes(m.strokes);
    for(const puid of (m.existingPeers||[])) await createPeer(puid,true);
  } else if(m.type==="call-state"){
    callState.participants=m.participants||[];
    if(m.activity) callState.activity=m.activity;
    if(m.watch) callState.watch=m.watch;
    renderCallUI();
  } else if(m.type==="rtc-offer"){
    const pc=await createPeer(m.from,false);
    await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
    const ans=await pc.createAnswer();
    await pc.setLocalDescription(ans);
    wsSend({type:"rtc-answer",to:m.from,sdp:ans});
  } else if(m.type==="rtc-answer"){
    const pc=peers[m.from]; if(pc) await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
  } else if(m.type==="rtc-ice"){
    const pc=peers[m.from]; if(pc&&m.candidate) try{await pc.addIceCandidate(new RTCIceCandidate(m.candidate))}catch{}
  } else if(m.type==="activity"){
    callState.activity=m.activity;
    renderCallUI();
  } else if(m.type==="watch-sync"){
    callState.activity="watch";
    callState.watch={video:m.video,playing:m.playing,time:m.time};
    syncWatchFeed();
  } else if(m.type==="watch-react"){
    spawnReaction(m);
  } else if(m.type==="wb-stroke"){
    if(callState.activity!=="whiteboard"){callState.activity="whiteboard";renderCallUI();}
    drawStroke(m);
  } else if(m.type==="wb-clear"){
    const c=$("wbCanvas"); if(c) c.getContext("2d").clearRect(0,0,c.width,c.height);
  }
}

function dockChatTo(inFullScreen){
  const msgs=$("msgs"), stk=$("stkPanel"), form=$("form");
  const target=inFullScreen ? $("csChat") : $("chat");
  if(!target || !msgs || !form) return;
  target.appendChild(msgs);
  if(stk) target.appendChild(stk);
  target.appendChild(form);
  msgs.scrollTop=1e9;
}

async function joinCall(gid){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch{
    await wtAlert({title:"Microphone needed",message:"Microphone access is needed for voice calls. Check your browser permissions."});
    return;
  }
  await ensureWs();
  callGroupId=gid; isMuted=false; callFull=true;
  wsSend({type:"join-call",groupId:gid});
}
function leaveCall(silent=false){
  if(!silent) wsSend({type:"leave-call"});
  Object.values(peers).forEach(pc=>pc.close());
  peers={};
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  $("audioBin").innerHTML="";
  callGroupId=null;
  callState={participants:[],activity:"none",watch:{video:null,playing:false,time:0}};
  dockChatTo(false);
  $("callScreen").classList.add("hidden");
  renderCallUI();
}
function toggleMute(){
  isMuted=!isMuted;
  if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled=!isMuted);
  wsSend({type:"mute",muted:isMuted});
}

function spawnReaction(m){
  const layer=document.getElementById("reactLayer"); if(!layer) return;
  const el=document.createElement("div"); el.className="react-pop";
  el.style.left=(14+Math.random()*66)+"%";
  el.innerHTML=`<span class="ms fill" style="font-size:18px;color:var(--primary)">${esc(m.icon||"favorite")}</span><span>${esc(m.by||"")}</span>`;
  layer.appendChild(el);
  setTimeout(()=>el.remove(),2300);
}

function drawStroke(s){
  const c=$("wbCanvas"); if(!c) return;
  const ctx=c.getContext("2d");
  ctx.strokeStyle=s.color||"#6750a4";
  ctx.lineWidth=s.size||4;
  ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(s.x0*c.width, s.y0*c.height);
  ctx.lineTo(s.x1*c.width, s.y1*c.height);
  ctx.stroke();
}
function replayStrokes(list){ setTimeout(()=>{(list||[]).forEach(drawStroke);},40); }

async function buildGroupWatchFeed(stage){
  stage.innerHTML=`<div class="react-float-layer" id="reactLayer"></div>
    <div class="gw-feed" id="gwFeed"><div class="m3-loader"><div class="m3-wave"><svg viewBox="0 0 160 14" fill="none"><path d="M0 7 Q10 1 20 7 T40 7 T60 7 T80 7 T100 7 T120 7 T140 7 T160 7" stroke="var(--primary)" stroke-width="3.2" stroke-linecap="round"/></svg></div><span>Loading Web Tok feed…</span></div></div>
    <div class="gw-react-bar" style="padding:8px 12px;border-top:1px solid var(--surface)">
      <button class="head-chip" id="rHeart"><span class="ms fill" style="font-size:16px;color:var(--primary)">favorite</span>Like</button>
      <button class="head-chip" id="rLaugh"><span class="ms" style="font-size:16px;color:var(--primary)">sentiment_very_satisfied</span>Haha</button>
      <button class="head-chip" id="rFire"><span class="ms fill" style="font-size:16px;color:var(--primary)">local_fire_department</span>Fire</button>
      <button class="head-chip" id="rWow"><span class="ms" style="font-size:16px;color:var(--primary)">bolt</span>Whoa</button>
    </div>`;
  [["rHeart","favorite"],["rLaugh","sentiment_very_satisfied"],["rFire","local_fire_department"],["rWow","bolt"]].forEach(([id,ic])=>{
    $(id).onclick=()=>wsSend({type:"watch-react",icon:ic});
  });

  if(!videoFeedCache){
    const {data}=await sb.from("videos").select("id,user_id,title,video_url").order("created_at",{ascending:false}).limit(30);
    videoFeedCache=data||[];
  }
  const feed=$("gwFeed"); if(!feed) return;
  feed.innerHTML="";
  if(!videoFeedCache.length){ feed.innerHTML='<div class="empty">No videos yet.</div>'; return; }

  videoFeedCache.forEach(v=>{
    const sl=document.createElement("div"); sl.className="gw-slide"; sl.dataset.vid=v.id;
    sl.innerHTML=`<div class="gw-player"><video src="${esc(v.video_url)}" controls playsinline loop preload="metadata"></video><div class="gw-cap"><b>${esc(v.title||"Web Tok")}</b></div></div>`;
    const vid=sl.querySelector("video");
    vid.onplay=()=>{if(!ignoreSync)wsSend({type:"watch-sync",video:v,playing:true,time:vid.currentTime})};
    vid.onpause=()=>{if(!ignoreSync)wsSend({type:"watch-sync",video:v,playing:false,time:vid.currentTime})};
    vid.onseeked=()=>{if(!ignoreSync)wsSend({type:"watch-sync",video:v,playing:!vid.paused,time:vid.currentTime})};
    feed.appendChild(sl);
  });

  let scrollTmr=null;
  feed.onscroll=()=>{
    if(ignoreSync) return;
    clearTimeout(scrollTmr);
    scrollTmr=setTimeout(()=>{
      const idx=Math.round(feed.scrollTop/feed.clientHeight);
      const sl=feed.children[idx];
      if(!sl) return;
      const v=videoFeedCache.find(x=>x.id===sl.dataset.vid);
      if(v && callState.watch?.video?.id!==v.id){
        feed.querySelectorAll("video").forEach(x=>{if(x!==sl.querySelector("video"))x.pause();});
        const vid=sl.querySelector("video");
        vid.play().catch(()=>{});
        callState.watch={video:v,playing:true,time:0};
        wsSend({type:"watch-sync",video:v,playing:true,time:0});
      }
    },180);
  };
  syncWatchFeed();
}

function syncWatchFeed(){
  const feed=$("gwFeed"), w=callState.watch;
  if(!feed || !w?.video) return;
  const sl=feed.querySelector(`[data-vid="${CSS.escape(w.video.id)}"]`);
  if(!sl) return;
  ignoreSync=true;
  sl.scrollIntoView({behavior:"smooth"});
  feed.querySelectorAll("video").forEach(x=>{if(x!==sl.querySelector("video"))x.pause();});
  const vid=sl.querySelector("video");
  if(vid){
    if(Math.abs(vid.currentTime-(w.time||0))>1.2) vid.currentTime=w.time||0;
    if(w.playing && vid.paused) vid.play().catch(()=>{});
    if(!w.playing && !vid.paused) vid.pause();
  }
  setTimeout(()=>{ignoreSync=false;},350);
}

function renderCallUI(){
  const callBtn=$("btnCall"), bar=$("callBar"), scr=$("callScreen");
  if(!bar || !scr || curType!=="group" || !cur) return;
  const inThisCall = callGroupId===cur.id;
  if(callBtn){
    callBtn.innerHTML=inThisCall?'<span class="ms" style="font-size:16px">call_end</span>Leave call':`<span class="ms" style="font-size:16px">call</span>${callState.participants.length?`Join (${callState.participants.length})`:"Call"}`;
    callBtn.className="head-chip "+(inThisCall?"bad":"p");
  }
  if(!inThisCall){ bar.classList.add("hidden"); scr.classList.add("hidden"); return; }

  const peersHtml=callState.participants.map(p=>`<div class="peer-pill"><div class="av" ${avStyle(p)}>${p.avatar_url?"":esc((p.display_name||p.username||"?")[0].toUpperCase())}</div><span>${esc(p.display_name||p.username)}</span>${p.muted?'<span class="ms" style="font-size:14px;color:var(--bad)">mic_off</span>':""}</div>`).join("");
  const ctrlsHtml=`<button class="head-chip" id="btnMute"><span class="ms" style="font-size:16px">${isMuted?"mic_off":"mic"}</span>${isMuted?"Unmute":"Mute"}</button>
    <button class="head-chip ${callState.activity==="watch"?"p":""}" id="btnWatch"><span class="ms" style="font-size:16px">smart_display</span>Group Watch</button>
    <button class="head-chip ${callState.activity==="whiteboard"?"p":""}" id="btnBoard"><span class="ms" style="font-size:16px">draw</span>Whiteboard</button>`;

  if(!callFull){
    scr.classList.add("hidden");
    dockChatTo(false);
    bar.classList.remove("hidden");
    bar.innerHTML=`<div class="call-peers">${peersHtml}</div><div class="call-ctrls">${ctrlsHtml}<button class="head-chip p" id="btnFullCall"><span class="ms" style="font-size:16px">open_in_full</span>Full screen</button></div>`;
    $("btnFullCall").onclick=()=>{callFull=true;renderCallUI();};
  } else {
    bar.classList.add("hidden");
    scr.classList.remove("hidden");
    $("csTop").innerHTML=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:17px">${esc(cur.name)}</b><div class="call-peers">${peersHtml}</div></div>
      <div class="call-ctrls">${ctrlsHtml}<button class="head-chip" id="btnMinCall"><span class="ms" style="font-size:16px">close_fullscreen</span>Minimize</button><button class="head-chip bad" id="btnEndFull"><span class="ms" style="font-size:16px">call_end</span>Leave</button></div>`;
    $("btnMinCall").onclick=()=>{callFull=false;renderCallUI();};
    $("btnEndFull").onclick=()=>leaveCall();
    dockChatTo(true);

    const stage=$("csStage");
    if(callState.activity==="watch"){
      if(stage.dataset.mode!=="watch"){ stage.dataset.mode="watch"; buildGroupWatchFeed(stage); }
    } else if(callState.activity==="whiteboard"){
      if(stage.dataset.mode!=="whiteboard"){
        stage.dataset.mode="whiteboard";
        stage.innerHTML=`<div class="wb-wrap"><div style="display:flex;justify-content:space-between;align-items:center"><b>Shared Whiteboard</b><button class="head-chip" id="wbClear">Clear</button></div>
          <canvas id="wbCanvas" width="900" height="520"></canvas>
          <div class="wb-tools" id="wbTools">${["#6750a4","#e53935","#1e88e5","#43a047","#fb8c00","#1d192b","#ffffff"].map(c=>`<button type="button" class="wb-swatch ${c===wbColor?"on":""}" data-c="${c}" style="background:${c};${c==="#ffffff"?"border:1px solid var(--muted)":""}"></button>`).join("")}
            <button class="head-chip" id="wbThin">Thin</button><button class="head-chip" id="wbThick">Thick</button></div></div>`;
        $("wbClear").onclick=()=>wsSend({type:"wb-clear"});
        $("wbTools").querySelectorAll(".wb-swatch").forEach(b=>b.onclick=()=>{wbColor=b.dataset.c;$("wbTools").querySelectorAll(".wb-swatch").forEach(x=>x.classList.toggle("on",x===b));});
        $("wbThin").onclick=()=>{wbSize=3;}; $("wbThick").onclick=()=>{wbSize=10;};
        const c=$("wbCanvas"), pt=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
        c.onpointerdown=e=>{wbDrawing=true;wbLast=pt(e);c.setPointerCapture(e.pointerId);};
        c.onpointermove=e=>{if(!wbDrawing||!wbLast)return;const p=pt(e),st={x0:wbLast.x,y0:wbLast.y,x1:p.x,y1:p.y,color:wbColor,size:wbColor==="#ffffff"?18:wbSize};drawStroke(st);wsSend({type:"wb-stroke",...st});wbLast=p;};
        c.onpointerup=()=>{wbDrawing=false;wbLast=null;};
      }
    } else {
      stage.dataset.mode="grid";
      stage.innerHTML=`<div class="cs-grid">${callState.participants.map(p=>`<div class="cs-tile"><div class="av" ${avStyle(p)}>${p.avatar_url?"":esc((p.display_name||p.username||"?")[0].toUpperCase())}</div><b>${esc(p.display_name||p.username)}</b>${p.muted?'<span class="ms" style="font-size:18px;color:var(--bad)">mic_off</span>':'<span class="ms" style="font-size:18px;color:var(--primary)">graphic_eq</span>'}</div>`).join("")}</div>`;
    }
  }
  $("btnMute").onclick=toggleMute;
  $("btnWatch").onclick=()=>wsSend({type:"set-activity",activity:callState.activity==="watch"?"none":"watch"});
  $("btnBoard").onclick=()=>wsSend({type:"set-activity",activity:callState.activity==="whiteboard"?"none":"whiteboard"});
}
