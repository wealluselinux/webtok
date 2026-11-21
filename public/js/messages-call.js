/* Messages: WebRTC Group Voice Calls, Group Watch, and Shared Whiteboard */
let ws=null, callGroupId=null, localStream=null, isMuted=false, peers={}, callState={participants:[],activity:"none",watch:{video:null,playing:false,time:0}};
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
    renderCallUI(true);
  } else if(m.type==="watch-react"){
    spawnReaction(m);
  } else if(m.type==="wb-stroke"){
    if(callState.activity!=="whiteboard"){callState.activity="whiteboard";renderCallUI();}
    drawStroke(m);
  } else if(m.type==="wb-clear"){
    const c=$("wbCanvas"); if(c) c.getContext("2d").clearRect(0,0,c.width,c.height);
  }
}

async function joinCall(gid){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch{
    await wtAlert({title:"Microphone needed",message:"Microphone access is needed for voice calls. Check your browser permissions."});
    return;
  }
  await ensureWs();
  callGroupId=gid; isMuted=false;
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
  el.style.left=(12+Math.random()*68)+"%";
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
function replayStrokes(list){
  setTimeout(()=>{(list||[]).forEach(drawStroke);},40);
}

function renderCallUI(){
  const callBtn=$("btnCall"), bar=$("callBar"), stage=$("stage");
  if(!bar || !stage || curType!=="group" || !cur) return;
  const inThisCall = callGroupId===cur.id;
  if(callBtn){
    callBtn.innerHTML=inThisCall?'<span class="ms" style="font-size:16px">call_end</span>Leave call':`<span class="ms" style="font-size:16px">call</span>${callState.participants.length?`Join (${callState.participants.length})`:"Call"}`;
    callBtn.className="head-chip "+(inThisCall?"bad":"p");
  }
  if(!inThisCall){ bar.classList.add("hidden"); stage.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  bar.innerHTML=`<div class="call-peers">${callState.participants.map(p=>`<div class="peer-pill"><div class="av" ${avStyle(p)}>${p.avatar_url?"":esc((p.display_name||p.username||"?")[0].toUpperCase())}</div><span>${esc(p.display_name||p.username)}</span>${p.muted?'<span class="ms" style="font-size:14px;color:var(--bad)">mic_off</span>':""}</div>`).join("")}</div>
  <div class="call-ctrls">
    <button class="head-chip" id="btnMute"><span class="ms" style="font-size:16px">${isMuted?"mic_off":"mic"}</span>${isMuted?"Unmute":"Mute"}</button>
    <button class="head-chip ${callState.activity==="watch"?"p":""}" id="btnWatch"><span class="ms" style="font-size:16px">smart_display</span>Group Watch</button>
    <button class="head-chip ${callState.activity==="whiteboard"?"p":""}" id="btnBoard"><span class="ms" style="font-size:16px">draw</span>Whiteboard</button>
  </div>`;
  $("btnMute").onclick=toggleMute;
  $("btnWatch").onclick=()=>wsSend({type:"set-activity",activity:callState.activity==="watch"?"none":"watch"});
  $("btnBoard").onclick=()=>wsSend({type:"set-activity",activity:callState.activity==="whiteboard"?"none":"whiteboard"});

  if(callState.activity==="watch"){
    stage.classList.remove("hidden");
    if(!stage.dataset.mode || stage.dataset.mode!=="watch"){
      stage.dataset.mode="watch";
      stage.innerHTML=`<div class="stage-head"><span>Group Watch</span><div style="display:flex;gap:6px"><button class="head-chip p" id="btnPickVid"><span class="ms" style="font-size:16px">video_library</span>Pick video</button><button class="head-chip" id="btnCloseStage">Hide</button></div></div>
      <div class="watch-box"><video id="gwVid" controls playsinline></video><div class="react-float-layer" id="reactLayer"></div></div>
      <div class="watch-bar">
        <button class="head-chip" id="rHeart"><span class="ms fill" style="font-size:16px;color:var(--primary)">favorite</span>Like</button>
        <button class="head-chip" id="rLaugh"><span class="ms" style="font-size:16px;color:var(--primary)">sentiment_very_satisfied</span>Haha</button>
        <button class="head-chip" id="rFire"><span class="ms fill" style="font-size:16px;color:var(--primary)">local_fire_department</span>Fire</button>
        <button class="head-chip" id="rWow"><span class="ms" style="font-size:16px;color:var(--primary)">bolt</span>Whoa</button>
      </div>`;
      $("btnCloseStage").onclick=()=>wsSend({type:"set-activity",activity:"none"});
      $("btnPickVid").onclick=openPickVideo;
      [["rHeart","favorite"],["rLaugh","sentiment_very_satisfied"],["rFire","local_fire_department"],["rWow","bolt"]].forEach(([id,ic])=>{
        $(id).onclick=()=>wsSend({type:"watch-react",icon:ic});
      });
      const v=$("gwVid");
      v.onplay=()=>{if(!ignoreSync)wsSend({type:"watch-sync",video:callState.watch.video,playing:true,time:v.currentTime})};
      v.onpause=()=>{if(!ignoreSync)wsSend({type:"watch-sync",video:callState.watch.video,playing:false,time:v.currentTime})};
      v.onseeked=()=>{if(!ignoreSync)wsSend({type:"watch-sync",video:callState.watch.video,playing:!v.paused,time:v.currentTime})};
    }
    const v=$("gwVid"), w=callState.watch;
    if(v && w?.video){
      ignoreSync=true;
      if(v.dataset.vid!==w.video.id){v.dataset.vid=w.video.id;v.src=w.video.video_url;}
      if(Math.abs(v.currentTime-(w.time||0))>1.2) v.currentTime=w.time||0;
      if(w.playing && v.paused) v.play().catch(()=>{});
      if(!w.playing && !v.paused) v.pause();
      setTimeout(()=>{ignoreSync=false;},250);
    }
  } else if(callState.activity==="whiteboard"){
    stage.classList.remove("hidden");
    if(!stage.dataset.mode || stage.dataset.mode!=="whiteboard"){
      stage.dataset.mode="whiteboard";
      stage.innerHTML=`<div class="stage-head"><span>Shared Whiteboard</span><div style="display:flex;gap:6px"><button class="head-chip" id="wbClear">Clear</button><button class="head-chip" id="btnCloseStage">Hide</button></div></div>
      <div class="wb-wrap">
        <canvas id="wbCanvas" width="800" height="400"></canvas>
        <div class="wb-tools" id="wbTools">
          ${["#6750a4","#e53935","#1e88e5","#43a047","#fb8c00","#1d192b","#ffffff"].map(c=>`<button type="button" class="wb-swatch ${c===wbColor?"on":""}" data-c="${c}" style="background:${c};${c==="#ffffff"?"border:1px solid var(--muted)":""}" title="${c==="#ffffff"?"Eraser":c}"></button>`).join("")}
          <button class="head-chip" id="wbThin">Thin</button><button class="head-chip" id="wbThick">Thick</button>
        </div>
      </div>`;
      $("btnCloseStage").onclick=()=>wsSend({type:"set-activity",activity:"none"});
      $("wbClear").onclick=()=>wsSend({type:"wb-clear"});
      $("wbTools").querySelectorAll(".wb-swatch").forEach(b=>b.onclick=()=>{
        wbColor=b.dataset.c;
        $("wbTools").querySelectorAll(".wb-swatch").forEach(x=>x.classList.toggle("on",x===b));
      });
      $("wbThin").onclick=()=>{wbSize=3;};
      $("wbThick").onclick=()=>{wbSize=10;};
      const c=$("wbCanvas");
      const pt=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
      c.onpointerdown=e=>{wbDrawing=true;wbLast=pt(e);c.setPointerCapture(e.pointerId);};
      c.onpointermove=e=>{
        if(!wbDrawing||!wbLast)return;
        const p=pt(e), st={x0:wbLast.x,y0:wbLast.y,x1:p.x,y1:p.y,color:wbColor,size:wbColor==="#ffffff"?18:wbSize};
        drawStroke(st); wsSend({type:"wb-stroke",...st}); wbLast=p;
      };
      c.onpointerup=()=>{wbDrawing=false;wbLast=null;};
    }
  } else {
    stage.classList.add("hidden"); stage.dataset.mode=""; stage.innerHTML="";
  }
}

async function openPickVideo(){
  const list=$("pvList"); list.innerHTML='<div style="padding:12px;color:var(--muted)">Loading videos…</div>';
  $("pickVidDlg").showModal();
  if(!videoFeedCache){
    const {data}=await sb.from("videos").select("id,title,video_url").order("created_at",{ascending:false}).limit(30);
    videoFeedCache=data||[];
  }
  list.innerHTML="";
  videoFeedCache.forEach(v=>{
    const row=document.createElement("div"); row.className="pick-row";
    row.innerHTML=`<span class="ms" style="color:var(--primary)">play_circle</span><div style="min-width:0;flex:1"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.title||"Web Tok")}</b></div>`;
    row.onclick=()=>{
      $("pickVidDlg").close();
      callState.watch={video:v,playing:true,time:0};
      wsSend({type:"watch-sync",video:v,playing:true,time:0});
      renderCallUI();
    };
    list.appendChild(row);
  });
}
