/* Messages: Full-screen Group & DM Voice Calls, Revised WebRTC, Green Speaking Ring, Mic Test, Group Watch & Whiteboard */
let ws=null, callGroupId=null, callTitle="", callFull=true, localStream=null, camStream=null, screenStream=null, isMuted=false, camOn=false, screenOn=false, peers={}, pendingIce={}, remoteVideos={};
let callState={participants:[],activity:"none",watch:{video:null,playing:false,time:0}};
let wbColor="#6750a4", wbSize=4, wbDrawing=false, wbLast=null, ignoreSync=false, videoFeedCache=null;

/* Speaking Ring Audio Analysers */
let audioCtx=null, speakTimer=null, analysers={}, speakingUntil={};
function getAudioCtx(){
  if(!audioCtx){
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(Ctx) audioCtx=new Ctx();
  }
  if(audioCtx && audioCtx.state==="suspended") audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function attachAnalyser(uid, stream){
  detachAnalyser(uid);
  try{
    const ctx=getAudioCtx();
    if(!ctx || !stream || !stream.getAudioTracks().length) return;
    const src=ctx.createMediaStreamSource(stream);
    const an=ctx.createAnalyser();
    an.fftSize=256;
    src.connect(an);
    analysers[uid]={src,an,data:new Uint8Array(an.frequencyBinCount)};
    ensureSpeakLoop();
  }catch{}
}
function detachAnalyser(uid){
  if(analysers[uid]){
    try{analysers[uid].src.disconnect();}catch{}
    delete analysers[uid];
  }
  delete speakingUntil[uid];
}
function ensureSpeakLoop(){
  if(speakTimer) return;
  speakTimer=setInterval(()=>{
    const now=Date.now();
    for(const [uid,obj] of Object.entries(analysers)){
      const p=callState.participants.find(x=>x.uid===uid);
      const muted=uid===me ? isMuted : !!p?.muted;
      let active=false;
      if(!muted){
        obj.an.getByteFrequencyData(obj.data);
        let sum=0;
        for(let i=0;i<obj.data.length;i++) sum+=obj.data[i];
        const avg=sum/obj.data.length;
        if(avg>10) speakingUntil[uid]=now+280;
        active=(speakingUntil[uid]||0)>now;
      }
      document.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`).forEach(el=>el.classList.toggle("speaking",active));
    }
  },90);
}
function stopSpeakLoop(){
  if(speakTimer){clearInterval(speakTimer);speakTimer=null;}
  Object.keys(analysers).forEach(detachAnalyser);
}

function ensureWs(){
  if(ws && ws.readyState===1) return Promise.resolve(ws);
  if(ws && ws.readyState===0) return new Promise((res,rej)=>{
    ws.addEventListener("open",()=>res(ws),{once:true});
    ws.addEventListener("error",()=>rej(new Error("WebSocket failed")),{once:true});
  });
  return new Promise((resolve,reject)=>{
    const proto=location.protocol==="https:"?"wss:":"ws:";
    ws=new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen=()=>resolve(ws);
    ws.onerror=()=>reject(new Error("WebSocket failed"));
    ws.onmessage=e=>{try{handleWs(JSON.parse(e.data))}catch{}};
    ws.onclose=()=>{ws=null;if(callGroupId) leaveCall(true);};
  });
}
function wsSend(obj){if(ws&&ws.readyState===1)ws.send(JSON.stringify(obj));}

async function createPeer(remoteUid, initiator){
  if(peers[remoteUid]) return peers[remoteUid];
  const pc=new RTCPeerConnection({
    iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:stun1.l.google.com:19302"}
    ]
  });
  peers[remoteUid]=pc;
  pendingIce[remoteUid]=[];
  if(localStream) localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  if(camStream) camStream.getVideoTracks().forEach(t=>pc.addTrack(t,camStream));
  if(screenStream) screenStream.getTracks().forEach(t=>pc.addTrack(t,screenStream));
  pc.onicecandidate=e=>{if(e.candidate)wsSend({type:"rtc-ice",to:remoteUid,candidate:e.candidate});};
  pc.ontrack=e=>{
    const stream=(e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);
    if(e.track.kind==="video"){
      remoteVideos[remoteUid]=stream;
      e.track.onended=()=>{ if(remoteVideos[remoteUid]===stream){ delete remoteVideos[remoteUid]; renderCallUI(); } };
      renderCallUI();
      return;
    }
    let a=document.getElementById("aud-"+remoteUid);
    if(!a){
      a=document.createElement("audio");
      a.id="aud-"+remoteUid;
      a.autoplay=true;
      a.playsInline=true;
      $("audioBin").appendChild(a);
    }
    a.srcObject=stream;
    a.play().catch(()=>{});
    attachAnalyser(remoteUid, stream);
  };
  if(initiator){
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsSend({type:"rtc-offer",to:remoteUid,sdp:pc.localDescription});
  }
  return pc;
}

async function flushIce(remoteUid){
  const pc=peers[remoteUid], q=pendingIce[remoteUid];
  if(!pc || !pc.remoteDescription || !q || !q.length) return;
  while(q.length){
    const cand=q.shift();
    try{await pc.addIceCandidate(new RTCIceCandidate(cand));}catch{}
  }
}

function closePeer(remoteUid){
  if(peers[remoteUid]){try{peers[remoteUid].close();}catch{} delete peers[remoteUid];}
  delete pendingIce[remoteUid];
  detachAnalyser(remoteUid);
  delete remoteVideos[remoteUid];
  const a=document.getElementById("aud-"+remoteUid);
  if(a) a.remove();
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
    const activeIds=new Set(callState.participants.map(p=>p.uid));
    Object.keys(peers).forEach(uid=>{if(!activeIds.has(uid)) closePeer(uid);});
    renderCallUI();
  } else if(m.type==="rtc-offer"){
    const pc=await createPeer(m.from,false);
    await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
    await flushIce(m.from);
    const ans=await pc.createAnswer();
    await pc.setLocalDescription(ans);
    wsSend({type:"rtc-answer",to:m.from,sdp:pc.localDescription});
  } else if(m.type==="rtc-answer"){
    const pc=peers[m.from];
    if(pc){
      await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      await flushIce(m.from);
    }
  } else if(m.type==="rtc-ice"){
    const pc=peers[m.from];
    if(m.candidate){
      if(pc && pc.remoteDescription){
        try{await pc.addIceCandidate(new RTCIceCandidate(m.candidate));}catch{}
      } else {
        (pendingIce[m.from] ||= []).push(m.candidate);
      }
    }
  } else if(m.type==="dm-call-ring" || m.type==="group-call-ring"){
    if(callGroupId===m.groupId) return;
    const f=m.from||{};
    const onAns=async()=>{
      if(m.type==="dm-call-ring"){
        const friendObj=friends.find(x=>x.id===f.id);
        if(friendObj && (!cur || curType!=="dm" || cur.id!==f.id)) await openChat(friendObj);
      } else {
        const gObj=groups.find(x=>x.id===m.groupId);
        if(gObj && (!cur || curType!=="group" || cur.id!==m.groupId)) await openGroupChat(gObj);
      }
      joinCall(m.groupId);
    };
    if(typeof window.wtShowIncomingCall==="function"){
      window.wtShowIncomingCall(m, onAns);
    } else {
      const ok=await wtConfirm({
        title:m.type==="group-call-ring"?`Incoming group call: ${m.groupName||"Group"}`:`Incoming call from ${f.display_name||"@"+(f.username||"friend")}`,
        message:"Join the voice call?",
        icon:"call",
        confirmText:"Answer",
        cancelText:"Decline"
      });
      if(ok) await onAns();
    }
  } else if(m.type==="call-ended"){
    if(typeof window.wtHideIncomingCall==="function") window.wtHideIncomingCall(m.groupId);
  } else if(m.type==="kicked" || m.type==="group-deleted"){
    const gid=m.groupId;
    if(callGroupId===gid) leaveCall(true);
    await wtAlert({
      title:m.type==="kicked"?"Removed from group":"Group deleted",
      message:m.type==="kicked"?"You were removed from this group chat by the owner.":"This group chat was deleted by the owner."
    });
    if(curType==="group" && cur?.id===gid){
      stopGroupPoll(); cur=null; curType=null;
      document.body.classList.remove("chatting");
      $("chat").innerHTML='<div class="empty">Select a chat to continue.</div>';
    }
    loadGroupsAndInvites();
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
  } else if(m.type==="dm-read"){
    if(typeof window.wtOnDmRead==="function") window.wtOnDmRead(m);
  } else if(m.type==="wb-clear"){
    const c=$("wbCanvas"); if(c) c.getContext("2d").clearRect(0,0,c.width,c.height);
  } else if(m.type==="error" && m.message){
    await wtAlert({title:"Call error",message:m.message});
  }
}

async function joinCall(gid){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  }catch(err){
    await wtAlert({title:"Microphone needed",message:"Microphone access is needed for voice calls ("+(err?.message||"permission denied")+")."});
    return;
  }
  await ensureWs();
  callGroupId=gid;
  callTitle=cur?(curType==="group"?cur.name:(cur.display_name||"@"+cur.username)):"Voice call";
  isMuted=false; camOn=false; screenOn=false; callFull=true;
  attachAnalyser(me, localStream);
  wsSend({type:"join-call",groupId:gid});
}
function leaveCall(silent=false){
  if(!silent) wsSend({type:"leave-call"});
  Object.keys(peers).forEach(closePeer);
  peers={}; pendingIce={}; remoteVideos={};
  stopSpeakLoop();
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}
  if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}
  $("audioBin").innerHTML="";
  callGroupId=null; callTitle=""; camOn=false; screenOn=false;
  try{localStorage.removeItem("wt_active_call");}catch{}
  callState={participants:[],activity:"none",watch:{video:null,playing:false,time:0}};
  dockChatTo(false);
  $("callScreen").classList.add("hidden");
  renderCallUI();
}
async function renegotiateAll(){
  for(const [ruid,pc] of Object.entries(peers)){
    try{
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsSend({type:"rtc-offer",to:ruid,sdp:pc.localDescription});
    }catch{}
  }
}
function removeStreamFromPeers(stream){
  if(!stream) return;
  const tids=new Set(stream.getTracks().map(t=>t.id));
  for(const pc of Object.values(peers)){
    pc.getSenders().forEach(s=>{ if(s.track && tids.has(s.track.id)){ try{pc.removeTrack(s);}catch{} } });
  }
}
async function toggleCam(){
  if(camOn){
    camOn=false;
    removeStreamFromPeers(camStream);
    if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}
    wsSend({type:"video-state",camOn:false});
    await renegotiateAll();
    renderCallUI();
    return;
  }
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:true});
    camOn=true;
    for(const pc of Object.values(peers)){
      camStream.getVideoTracks().forEach(t=>pc.addTrack(t,camStream));
    }
    wsSend({type:"video-state",camOn:true});
    await renegotiateAll();
    renderCallUI();
  }catch(err){
    await wtAlert({title:"Camera unavailable",message:"Could not access camera: "+(err?.message||"permission denied")});
  }
}
async function toggleScreen(){
  if(screenOn){
    screenOn=false;
    removeStreamFromPeers(screenStream);
    if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}
    wsSend({type:"video-state",screenOn:false});
    await renegotiateAll();
    renderCallUI();
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
    await wtAlert({title:"Screen share unsupported",message:"Your browser does not support screen sharing."});
    return;
  }
  try{
    screenStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
    screenOn=true;
    const vTrack=screenStream.getVideoTracks()[0];
    if(vTrack) vTrack.onended=()=>{ if(screenOn) toggleScreen(); };
    for(const pc of Object.values(peers)){
      screenStream.getTracks().forEach(t=>pc.addTrack(t,screenStream));
    }
    wsSend({type:"video-state",screenOn:true});
    await renegotiateAll();
    renderCallUI();
  }catch(err){
    if(err?.name!=="AbortError" && err?.name!=="NotAllowedError"){
      await wtAlert({title:"Screen share failed",message:err?.message||"Could not start screen share."});
    }
  }
}
function toggleMute(){
  isMuted=!isMuted;
  if(localStream) localStream.getAudioTracks().forEach(t=>t.enabled=!isMuted);
  wsSend({type:"mute",muted:isMuted});
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

function activeRoomId(){
  if(!cur) return null;
  if(curType==="group") return cur.id;
  if(curType==="dm" && !cur.isAi && !cur.isNotif) return dmRoomId(me, cur.id);
  return null;
}

function renderCallUI(){
  const callBtn=$("btnCall"), bar=$("callBar"), scr=$("callScreen");
  const roomId=activeRoomId();
  const inThisCall = !!callGroupId && callGroupId===roomId;
  if(callBtn && roomId){
    callBtn.innerHTML=inThisCall?'<span class="ms" style="font-size:16px">call_end</span>Leave call':`<span class="ms" style="font-size:16px">call</span>${callState.participants.length?`Join (${callState.participants.length})`:"Call"}`;
    callBtn.className="head-chip "+(inThisCall?"bad":"p");
  }
  if(!bar || !scr) return;
  if(!callGroupId){ bar.classList.add("hidden"); scr.classList.add("hidden"); return; }

  const title=callTitle || (cur?(curType==="group"?cur.name:(cur.display_name||"@"+cur.username)):"Voice call");
  const peersHtml=callState.participants.map(p=>`<div class="peer-pill" data-uid="${esc(p.uid)}"><div class="av" ${avStyle(p)}>${p.avatar_url?"":esc((p.display_name||p.username||"?")[0].toUpperCase())}</div><span>${esc(p.display_name||p.username)}</span>${p.muted?'<span class="ms" style="font-size:14px;color:var(--bad)">mic_off</span>':""}</div>`).join("");
  const ctrlsHtml=`<button class="head-chip" id="btnMute"><span class="ms" style="font-size:16px">${isMuted?"mic_off":"mic"}</span>${isMuted?"Unmute":"Mute"}</button>
    <button class="head-chip ${camOn?"p":""}" id="btnCam"><span class="ms" style="font-size:16px">${camOn?"videocam":"videocam_off"}</span>${camOn?"Cam On":"Camera"}</button>
    <button class="head-chip ${screenOn?"p":""}" id="btnScreen"><span class="ms" style="font-size:16px">${screenOn?"stop_screen_share":"screen_share"}</span>${screenOn?"Stop Share":"Share Screen"}</button>
    <button class="head-chip" id="btnCallMicTest"><span class="ms" style="font-size:16px">graphic_eq</span>Test Mic</button>
    <button class="head-chip ${callState.activity==="watch"?"p":""}" id="btnWatch"><span class="ms" style="font-size:16px">smart_display</span>Group Watch</button>
    <button class="head-chip ${callState.activity==="whiteboard"?"p":""}" id="btnBoard"><span class="ms" style="font-size:16px">draw</span>Whiteboard</button>`;

  if(!callFull){
    scr.classList.add("hidden");
    dockChatTo(false);
    bar.classList.remove("hidden");
    bar.innerHTML=`<div class="call-peers"><b style="font-size:13px;margin-right:4px">${esc(title)}</b>${peersHtml}</div><div class="call-ctrls">${ctrlsHtml}<button class="head-chip p" id="btnFullCall"><span class="ms" style="font-size:16px">open_in_full</span>Full screen</button><button class="head-chip bad" id="btnEndBar"><span class="ms" style="font-size:16px">call_end</span>Leave</button></div>`;
    $("btnFullCall").onclick=()=>{callFull=true;renderCallUI();};
    $("btnEndBar").onclick=()=>leaveCall();
  } else {
    bar.classList.add("hidden");
    scr.classList.remove("hidden");
    $("csTop").innerHTML=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:17px">${esc(title)}</b><div class="call-peers">${peersHtml}</div></div>
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
      stage.innerHTML=`<div class="cs-grid">${callState.participants.map(p=>{
        const isMe=p.uid===me;
        const hasVid=isMe ? (camOn||screenOn) : (p.camOn||p.screenOn||!!remoteVideos[p.uid]);
        return `<div class="cs-tile ${p.screenOn||(isMe&&screenOn)?"wide":""}" data-uid="${esc(p.uid)}" style="position:relative;overflow:hidden">
          ${hasVid ? `<video id="vid-${esc(p.uid)}" autoplay playsinline ${isMe?"muted":""} style="width:100%;height:100%;max-height:360px;object-fit:contain;border-radius:16px;background:#000"></video>` : `<div class="av" ${avStyle(p)}>${p.avatar_url?"":esc((p.display_name||p.username||"?")[0].toUpperCase())}</div>`}
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px"><b>${esc(p.display_name||p.username)}</b>${p.muted?'<span class="ms" style="font-size:18px;color:var(--bad)">mic_off</span>':'<span class="ms" style="font-size:18px;color:var(--primary)">graphic_eq</span>'}</div>
        </div>`;
      }).join("")}</div>`;
      callState.participants.forEach(p=>{
        const vEl=document.getElementById("vid-"+p.uid);
        if(!vEl) return;
        const st=p.uid===me ? (screenStream || camStream) : remoteVideos[p.uid];
        if(st && vEl.srcObject!==st){ vEl.srcObject=st; vEl.play().catch(()=>{}); }
      });
    }
  }
  $("btnMute").onclick=toggleMute;
  $("btnCam").onclick=toggleCam;
  $("btnScreen").onclick=toggleScreen;
  $("btnCallMicTest").onclick=()=>openMicTest();
  $("btnWatch").onclick=()=>wsSend({type:"set-activity",activity:callState.activity==="watch"?"none":"watch"});
  $("btnBoard").onclick=()=>wsSend({type:"set-activity",activity:callState.activity==="whiteboard"?"none":"whiteboard"});
  if(typeof window.wtSyncGlobalCallMini==="function") window.wtSyncGlobalCallMini();
}

/* ---------- Mic Test Dialog ---------- */
let mtStream=null, mtTimer=null, mtSrc=null;
function stopMicTest(){
  if(mtTimer){clearInterval(mtTimer);mtTimer=null;}
  if(mtSrc){try{mtSrc.disconnect();}catch{} mtSrc=null;}
  if(mtStream){mtStream.getTracks().forEach(t=>t.stop());mtStream=null;}
  const aud=$("mtAudio"); if(aud){aud.pause();aud.srcObject=null;}
  if($("mtFill")) $("mtFill").style.width="0%";
  if($("mtStartBtn")) $("mtStartBtn").textContent="Start test";
}
function openMicTest(){
  const dlg=$("micTestDlg");
  $("mtStatus").textContent="Click Start test to check your microphone.";
  $("mtStatus").className="mic-status";
  $("mtFill").style.width="0%";
  $("mtLoop").checked=false;
  const close=()=>{stopMicTest();dlg.close();};
  $("mtCloseBtn").onclick=close;
  $("mtDoneBtn").onclick=close;
  dlg.oncancel=e=>{e.preventDefault();close();};
  $("mtLoop").onchange=()=>{
    const aud=$("mtAudio");
    if($("mtLoop").checked && mtStream){aud.srcObject=mtStream;aud.play().catch(()=>{});}
    else{aud.pause();aud.srcObject=null;}
  };
  $("mtStartBtn").onclick=async()=>{
    if(mtStream){stopMicTest();$("mtStatus").textContent="Mic test stopped.";$("mtStatus").className="mic-status";return;}
    $("mtStatus").textContent="Requesting microphone…";
    $("mtStatus").className="mic-status";
    try{
      mtStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const ctx=getAudioCtx();
      mtSrc=ctx.createMediaStreamSource(mtStream);
      const an=ctx.createAnalyser();
      an.fftSize=256;
      mtSrc.connect(an);
      const data=new Uint8Array(an.frequencyBinCount);
      let heardSpeech=false;
      $("mtStatus").textContent="Listening… speak into your mic!";
      $("mtStartBtn").textContent="Stop test";
      if($("mtLoop").checked){$("mtAudio").srcObject=mtStream;$("mtAudio").play().catch(()=>{});}
      mtTimer=setInterval(()=>{
        an.getByteFrequencyData(data);
        let sum=0; for(let i=0;i<data.length;i++) sum+=data[i];
        const avg=sum/data.length;
        const pct=Math.min(100,Math.round((avg/45)*100));
        $("mtFill").style.width=pct+"%";
        if(avg>8 && !heardSpeech){
          heardSpeech=true;
          $("mtStatus").textContent="Microphone is working!";
          $("mtStatus").className="mic-status ok";
        }
      },60);
    }catch(err){
      stopMicTest();
      $("mtStatus").textContent="Microphone not working: "+(err?.message||"Access denied or no mic found");
      $("mtStatus").className="mic-status bad";
    }
  };
  dlg.showModal();
}


/* ---------- Persist Active Call State Across Pages (No Iframe) ---------- */
window.wtInActiveCall=()=>!!callGroupId;

window.wtSyncGlobalCallMini=function(){
  try{
    if(!callGroupId){
      localStorage.removeItem("wt_active_call");
      return;
    }
    const title=cur?(curType==="group"?cur.name:(cur.display_name||"@"+cur.username)):"Voice call";
    const count=callState.participants.length||1;
    localStorage.setItem("wt_active_call",JSON.stringify({
      groupId:callGroupId,
      title,
      count,
      muted:!!isMuted,
      ts:Date.now()
    }));
  }catch{}
};
