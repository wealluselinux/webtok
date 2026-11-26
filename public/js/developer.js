/* Web Tok /developer Studio: Python, Scratch Blocks, HTML/JS + Update Section + AI Game Builder + API Keys */
let curLang = "python", curGameId = null, myTok = null;

const STARTERS = {
  python: `import turtle, random

s = turtle.Screen()
s.bgcolor("#16121e")
p = turtle.Turtle()
p.shape("circle")
p.color("#d0bcff")
p.penup()

def go_up(): p.sety(p.ycor() + 20)
def go_down(): p.sety(p.ycor() - 20)
def go_left(): p.setx(p.xcor() - 20)
def go_right(): p.setx(p.xcor() + 20)

s.listen()
s.onkey(go_up, "Up")
s.onkey(go_down, "Down")
s.onkey(go_left, "Left")
s.onkey(go_right, "Right")
print("Use arrow keys to move the dot!")`,
  html: `<!DOCTYPE html>
<html><body style="margin:0;background:#16121e;color:#fff;display:grid;place-items:center;height:100vh;font-family:sans-serif">
<canvas id="c" width="400" height="400" style="background:#1d192b;border-radius:16px;max-width:100%"></canvas>
<script>
const c=document.getElementById("c"),ctx=c.getContext("2d");
let x=200,y=200,vx=3,vy=2.5;
(function loop(){
  x+=vx;y+=vy;
  if(x<16||x>384)vx=-vx;
  if(y<16||y>344)vy=-vy;
  ctx.fillStyle="#1d192b";ctx.fillRect(0,0,400,400);
  ctx.fillStyle="#d0bcff";ctx.beginPath();ctx.arc(x,y,16,0,7);ctx.fill();
  requestAnimationFrame(loop);
})();
<\/script><\/body><\/html>`
};

function buildPyDoc(py) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#16121e;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh">
    <div id="mycanvas" style="width:400px;height:360px;background:#1d192b;border-radius:16px"></div>
    <pre id="out" style="margin:6px 0 0;font-size:12px;color:#d0bcff;max-height:48px;overflow:auto"></pre>
    <script src="https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulkt-stdlib.js"><\/script>
    <script>
      Sk.configure({output:t=>document.getElementById("out").textContent+=t,read:x=>{if(!Sk.builtinFiles?.files[x])throw "File not found: "+x;return Sk.builtinFiles.files[x]}});
      (Sk.TurtleGraphics||(Sk.TurtleGraphics={})).target="mycanvas";
      Sk.misceval.asyncToPromise(()=>Sk.importMainWithBody("<stdin>",false,${JSON.stringify(py)},true)).catch(e=>{document.getElementById("out").textContent=String(e)});
    <\/script><\/body><\/html>`;
}

function buildScratchDoc(jsCode) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#16121e;display:grid;place-items:center;height:100vh;overflow:hidden">
    <canvas id="c" width="400" height="400" style="background:#1d192b;border-radius:16px;max-width:100%"></canvas>
    <script>const canvas=document.getElementById("c"),ctx=canvas.getContext("2d"),keys={};
    let score=0;const player={x:200,y:340,vx:0,vy:0,onGround:true};
    addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();keys[e.key]=true;});
    addEventListener("keyup",e=>{keys[e.key]=false;});
    try{${jsCode}}catch(e){ctx.fillStyle="#ff8a80";ctx.font="14px monospace";ctx.fillText(e.message,12,24)}<\/script><\/body><\/html>`;
}

function syncEditingUi(title) {
  const isEdit = !!curGameId;
  $("editingBadge").textContent = isEdit ? `Editing: ${title || $("gTitle").value.trim() || "Saved Game"}` : "New Project";
  $("btnUpdateGame").classList.toggle("hidden", !isEdit);
  $("btnPub").innerHTML = isEdit
    ? '<span class="ms" style="font-size:18px">publish</span>Publish Update'
    : '<span class="ms" style="font-size:18px">publish</span>Save &amp; Publish';
}

async function switchLang(lang) {
  curLang = lang;
  document.querySelectorAll(".ltab").forEach(b => b.classList.toggle("on", b.dataset.lang === lang));
  const ed = $("codeEd"), bd = $("blocklyDiv");
  if (lang === "scratch") {
    $("edLabel").textContent = "Scratch Block Coding";
    ed.classList.add("hidden"); bd.classList.remove("hidden");
    await ensureBlockly(bd);
    Blockly.svgResize(blocklyWs);
  } else {
    $("edLabel").textContent = lang === "python" ? "Python Editor (Turtle Graphics)" : "HTML / JavaScript Canvas Editor";
    bd.classList.add("hidden"); ed.classList.remove("hidden");
    if (!ed.value.trim() || ed.value === STARTERS.python || ed.value === STARTERS.html) {
      ed.value = STARTERS[lang];
    }
  }
}

function runPreview() {
  const f = $("prevFrame");
  if (curLang === "python") f.srcdoc = buildPyDoc($("codeEd").value);
  else if (curLang === "scratch") f.srcdoc = buildScratchDoc(getScratchJs());
  else f.srcdoc = $("codeEd").value;
}

async function loadMyGames() {
  if (!myTok) return;
  try {
    const r = await fetch("/api/games/mine", { headers: { Authorization: "Bearer " + myTok } });
    const j = await r.json();
    const rows = j.data || [];
    const bar = $("myGamesBar"); bar.innerHTML = "";
    if (!rows.length) {
      bar.innerHTML = '<span style="font-size:12px;color:var(--muted)">No saved games yet — publish a game below and it will appear here so you can update it anytime.</span>';
      return;
    }
    rows.forEach(g => {
      const chip = document.createElement("div");
      chip.className = "my-chip" + (curGameId === g.id ? " on" : "");
      chip.title = "Click to load and update this game";
      chip.innerHTML = `<span class="ms" style="font-size:15px;color:var(--primary)">edit</span><span>${escapeHtml(g.title)}</span><small>${escapeHtml(g.lang)}</small><span class="ms" style="font-size:15px;opacity:.7" data-del="1" title="Delete">close</span>`;
      chip.onclick = async e => {
        if (e.target.dataset.del) {
          if (!(await wtConfirm({ title: "Delete game?", message: `Delete "${g.title}"?`, danger: true }))) return;
          await fetch(`/api/games/${encodeURIComponent(g.id)}`, { method: "DELETE", headers: { Authorization: "Bearer " + myTok } });
          if (curGameId === g.id) { curGameId = null; syncEditingUi(); }
          return loadMyGames();
        }
        curGameId = g.id;
        $("gTitle").value = g.title; $("gDesc").value = g.description || "";
        await switchLang(g.lang);
        if (g.lang === "scratch") setScratchXml(g.workspace_xml);
        else $("codeEd").value = g.code;
        syncEditingUi(g.title);
        loadMyGames();
        runPreview();
      };
      bar.appendChild(chip);
    });
  } catch {}
}

async function askAi(mode) {
  const prompt = $("aiPrompt").value.trim();
  if (!prompt) return wtAlert({ title: "Developer AI", message: "Describe what you want to build or edit." });
  const out = $("aiOut");
  out.classList.remove("hidden"); out.textContent = mode === "build" ? "AI is building your game…" : "AI is updating your code…";
  $("btnAiHelp").disabled = $("btnAiBuild").disabled = true;
  try {
    const currentCode = curLang === "scratch" ? getScratchJs() : $("codeEd").value;
    const r = await fetch("/api/games/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + myTok },
      body: JSON.stringify({ mode, lang: curLang, prompt, currentCode })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || "AI request failed");
    if (j.data.code) {
      if (curLang === "scratch") await switchLang("html");
      $("codeEd").value = j.data.code;
      runPreview();
      out.textContent = "Applied AI code to your game and updated Live Preview!\n\n" + j.data.reply;
    } else {
      out.textContent = j.data.reply;
    }
  } catch (e) {
    out.textContent = "Error: " + e.message;
  } finally { $("btnAiHelp").disabled = $("btnAiBuild").disabled = false; }
}

async function saveOrUpdateGame() {
  const title = $("gTitle").value.trim();
  if (!title) return wtAlert({ title: "Title needed", message: "Give your game a title before saving." });
  const code = curLang === "scratch" ? getScratchJs() : $("codeEd").value;
  const workspace_xml = curLang === "scratch" ? getScratchXml() : "";
  const wasUpdate = !!curGameId;
  $("btnPub").disabled = $("btnUpdateGame").disabled = true;
  try {
    const r = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + myTok },
      body: JSON.stringify({ id: curGameId, title, description: $("gDesc").value.trim(), lang: curLang, code, workspace_xml, published: true })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || "Could not save game");
    curGameId = j.data.id;
    syncEditingUi(title);
    await loadMyGames();
    await wtAlert({ title: wasUpdate ? "Game Updated!" : "Published!", message: `"${title}" is live in Mini Games.` });
  } catch (e) { await wtAlert({ title: "Error", message: e.message }); }
  finally { $("btnPub").disabled = $("btnUpdateGame").disabled = false; }
}

// Resizable coding area (drag divider + Expand toggle + Blockly auto-resize)
const savedPrevW = Number(localStorage.getItem("wt_dev_prev_w") || 0);
if (savedPrevW >= 280 && savedPrevW <= 760) $("prevPane").style.width = savedPrevW + "px";

$("btnEdWide").onclick = () => {
  const wide = $("devGrid").classList.toggle("ed-wide");
  $("btnEdWide").innerHTML = wide
    ? '<span class="ms" style="font-size:16px">close_fullscreen</span>Split View'
    : '<span class="ms" style="font-size:16px">open_in_full</span>Expand';
  if (typeof blocklyWs !== "undefined" && blocklyWs) Blockly.svgResize(blocklyWs);
};

let dragging = false;
$("devResizer").onpointerdown = e => { dragging = true; $("devResizer").classList.add("on"); $("devResizer").setPointerCapture(e.pointerId); };
$("devResizer").onpointermove = e => {
  if (!dragging) return;
  const r = $("devGrid").getBoundingClientRect();
  const prevW = Math.max(280, Math.min(r.width - 300, r.right - e.clientX));
  $("prevPane").style.width = Math.round(prevW) + "px";
  localStorage.setItem("wt_dev_prev_w", String(Math.round(prevW)));
  if (typeof blocklyWs !== "undefined" && blocklyWs) Blockly.svgResize(blocklyWs);
};
$("devResizer").onpointerup = () => { dragging = false; $("devResizer").classList.remove("on"); };
new ResizeObserver(() => { if (typeof blocklyWs !== "undefined" && blocklyWs) Blockly.svgResize(blocklyWs); }).observe($("blocklyDiv"));

$("langTabs").onclick = e => { const b = e.target.closest(".ltab"); if (b) switchLang(b.dataset.lang); };
$("btnRun").onclick = runPreview;
$("btnResetTpl").onclick = () => { if (curLang === "scratch") loadDefaultScratchBlocks(); else $("codeEd").value = STARTERS[curLang]; runPreview(); };
$("btnNewGame").onclick = () => {
  curGameId = null; $("gTitle").value = ""; $("gDesc").value = "";
  if (curLang === "scratch") loadDefaultScratchBlocks(); else $("codeEd").value = STARTERS[curLang];
  syncEditingUi(); loadMyGames(); runPreview();
};
$("btnAiHelp").onclick = () => askAi("help");
$("btnAiBuild").onclick = () => askAi("build");
$("btnPub").onclick = saveOrUpdateGame;
$("btnUpdateGame").onclick = saveOrUpdateGame;

/* ---- API Key management ---- */
async function loadApiKey() {
  const sec = $("apikeySection");
  if (!myTok) return;
  try {
    const r = await fetch("/api/developer/apikey", { headers: { Authorization: "Bearer " + myTok } });
    const j = await r.json();
    if (r.status === 403) {
      // Not admin/owner — keep section hidden
      sec.classList.add("hidden");
      return;
    }
    // Admin or owner: show the section
    sec.classList.remove("hidden");
    const keyRow = $("akKeyRow"), genRow = $("akGenRow"), status = $("akStatus"), mcpBlock = $("akMcpBlock");
    if (j.data?.key) {
      $("akKeyField").value = j.data.key;
      status.textContent = `Active key — created ${new Date(j.data.created_at).toLocaleDateString()}`;
      keyRow.style.display = "flex";
      genRow.style.display = "none";
      showMcpSnippet(j.data.key);
    } else {
      status.textContent = "No API key yet. Generate one below.";
      keyRow.style.display = "none";
      genRow.style.display = "flex";
      mcpBlock.classList.add("hidden");
    }
  } catch (e) {
    $("akStatus").textContent = "Could not load API key: " + e.message;
  }
}

function showMcpSnippet(key) {
  const mcpBlock = $("akMcpBlock");
  const snippet = {
    mcpServers: {
      webtok: {
        command: "npx",
        args: ["-y", "@webtok/mcp-server"],
        env: {
          WEBTOK_API_KEY: key,
          WEBTOK_API_URL: window.location.origin
        }
      }
    }
  };
  $("akMcpSnippet").textContent = JSON.stringify(snippet, null, 2);
  mcpBlock.classList.remove("hidden");
}

if ($("btnAkGenerate")) $("btnAkGenerate").onclick = async () => {
  if (!(await wtConfirm({ title: "Generate API Key", message: "This will create a new API key for your account. Continue?" }))) return;
  $("btnAkGenerate").disabled = true;
  try {
    const r = await fetch("/api/developer/apikey", {
      method: "POST",
      headers: { Authorization: "Bearer " + myTok }
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || "Failed to generate key");
    await loadApiKey();
  } catch (e) {
    await wtAlert({ title: "Error", message: e.message });
  } finally { $("btnAkGenerate").disabled = false; }
};

if ($("btnAkRevoke")) $("btnAkRevoke").onclick = async () => {
  if (!(await wtConfirm({ title: "Revoke API Key", message: "Are you sure? This will permanently delete your current API key.", danger: true }))) return;
  try {
    const r = await fetch("/api/developer/apikey", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + myTok }
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || "Failed to revoke key");
    await loadApiKey();
  } catch (e) {
    await wtAlert({ title: "Error", message: e.message });
  }
};

if ($("btnAkCopy")) $("btnAkCopy").onclick = () => {
  const v = $("akKeyField").value;
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => {
    $("btnAkCopy").textContent = "Copied!";
    setTimeout(() => { $("btnAkCopy").innerHTML = '<span class="ms" style="font-size:16px">content_copy</span>Copy'; }, 1800);
  });
};

if ($("btnAkCopyMcp")) $("btnAkCopyMcp").onclick = () => {
  const v = $("akMcpSnippet").textContent;
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => {
    $("btnAkCopyMcp").textContent = "Copied!";
    setTimeout(() => { $("btnAkCopyMcp").innerHTML = '<span class="ms" style="font-size:16px">content_copy</span>Copy MCP Config'; }, 1800);
  });
};

(async () => {
  const { data } = await sb.auth.getSession();
  if (!data?.session) { location.href = "/login"; return; }
  myTok = data.session.access_token;
  $("codeEd").value = STARTERS.python;
  syncEditingUi();
  runPreview();
  loadMyGames();
  loadApiKey();
})();
