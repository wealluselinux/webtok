/* Scratch-style Blockly workspace with Events, Motion, Jump/Gravity, Wait, Sensing & Draw blocks */
let blocklyWs = null, blocklyLoaded = false;

function loadScript(src) {
  return new Promise((ok, no) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no;
    document.head.appendChild(s);
  });
}

function getJsGen() {
  return (window.javascript && window.javascript.javascriptGenerator) || (window.Blockly && window.Blockly.JavaScript);
}

async function ensureBlockly(container) {
  if (blocklyWs) return blocklyWs;
  if (!blocklyLoaded) {
    await loadScript("https://cdn.jsdelivr.net/npm/blockly@10.4.3/blockly.min.js");
    await loadScript("https://cdn.jsdelivr.net/npm/blockly@10.4.3/javascript_compressed.js");
    registerScratchBlocks();
    blocklyLoaded = true;
  }
  const toolbox = {
    kind: "categoryToolbox",
    contents: [
      { kind: "category", name: "Events", colour: "#ffab19", contents: [
        { kind: "block", type: "wt_when_start" },
        { kind: "block", type: "wt_every_frame" },
        { kind: "block", type: "wt_on_key" },
        { kind: "block", type: "wt_on_tap" }
      ]},
      { kind: "category", name: "Motion", colour: "#4c97ff", contents: [
        { kind: "block", type: "wt_move_xy", inputs: { DX: { shadow: { type: "math_number", fields: { NUM: 5 } } }, DY: { shadow: { type: "math_number", fields: { NUM: 0 } } } } },
        { kind: "block", type: "wt_set_xy", inputs: { X: { shadow: { type: "math_number", fields: { NUM: 200 } } }, Y: { shadow: { type: "math_number", fields: { NUM: 200 } } } } },
        { kind: "block", type: "wt_jump", inputs: { PWR: { shadow: { type: "math_number", fields: { NUM: 10 } } } } },
        { kind: "block", type: "wt_apply_gravity", inputs: { G: { shadow: { type: "math_number", fields: { NUM: 0.5 } } }, FLR: { shadow: { type: "math_number", fields: { NUM: 340 } } } } },
        { kind: "block", type: "wt_keep_in_bounds" },
        { kind: "block", type: "wt_player_x" },
        { kind: "block", type: "wt_player_y" }
      ]},
      { kind: "category", name: "Looks & Draw", colour: "#9966ff", contents: [
        { kind: "block", type: "wt_clear_canvas" },
        { kind: "block", type: "wt_set_color" },
        { kind: "block", type: "wt_draw_player", inputs: { SZ: { shadow: { type: "math_number", fields: { NUM: 28 } } } } },
        { kind: "block", type: "wt_draw_rect", inputs: { X: { shadow: { type: "math_number", fields: { NUM: 180 } } }, Y: { shadow: { type: "math_number", fields: { NUM: 180 } } }, W: { shadow: { type: "math_number", fields: { NUM: 40 } } }, H: { shadow: { type: "math_number", fields: { NUM: 40 } } } } },
        { kind: "block", type: "wt_draw_circle", inputs: { X: { shadow: { type: "math_number", fields: { NUM: 200 } } }, Y: { shadow: { type: "math_number", fields: { NUM: 200 } } }, R: { shadow: { type: "math_number", fields: { NUM: 16 } } } } },
        { kind: "block", type: "wt_draw_text", inputs: { X: { shadow: { type: "math_number", fields: { NUM: 120 } } }, Y: { shadow: { type: "math_number", fields: { NUM: 50 } } } } },
        { kind: "block", type: "wt_draw_score" }
      ]},
      { kind: "category", name: "Control", colour: "#ffab19", contents: [
        { kind: "block", type: "wt_wait", inputs: { SEC: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 5 } } } } }
      ]},
      { kind: "category", name: "Sensing & Score", colour: "#5cb1d6", contents: [
        { kind: "block", type: "wt_key_down" },
        { kind: "block", type: "wt_touching_box", inputs: { X: { shadow: { type: "math_number", fields: { NUM: 200 } } }, Y: { shadow: { type: "math_number", fields: { NUM: 200 } } }, W: { shadow: { type: "math_number", fields: { NUM: 30 } } }, H: { shadow: { type: "math_number", fields: { NUM: 30 } } } } },
        { kind: "block", type: "wt_change_score", inputs: { VAL: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
        { kind: "block", type: "wt_set_score", inputs: { VAL: { shadow: { type: "math_number", fields: { NUM: 0 } } } } },
        { kind: "block", type: "wt_score_val" },
        { kind: "block", type: "wt_random", inputs: { A: { shadow: { type: "math_number", fields: { NUM: 20 } } }, B: { shadow: { type: "math_number", fields: { NUM: 380 } } } } }
      ]},
      { kind: "category", name: "Math & Logic", colour: "#59c059", contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_boolean" }
      ]},
      { kind: "category", name: "Variables", colour: "#ff8c1a", custom: "VARIABLE" }
    ]
  };
  blocklyWs = Blockly.inject(container, { toolbox, trashcan: true, scrollbars: true });
  loadDefaultScratchBlocks();
  setTimeout(() => Blockly.svgResize(blocklyWs), 50);
  return blocklyWs;
}

function registerScratchBlocks() {
  const B = Blockly.Blocks, G = getJsGen();
  const KEY_OPTS = [["ArrowLeft","ArrowLeft"],["ArrowRight","ArrowRight"],["ArrowUp","ArrowUp"],["ArrowDown","ArrowDown"],["Space"," "]];

  // Events
  B["wt_when_start"] = { init() { this.appendDummyInput().appendField("when game starts"); this.appendStatementInput("DO"); this.setColour("#ffab19"); } };
  G.forBlock["wt_when_start"] = (b, g) => `(async()=>{\n${g.statementToCode(b, "DO")}})();\n`;

  B["wt_every_frame"] = { init() { this.appendDummyInput().appendField("every frame"); this.appendStatementInput("DO"); this.setColour("#ffab19"); } };
  G.forBlock["wt_every_frame"] = (b, g) => `setInterval(async()=>{\n${g.statementToCode(b, "DO")}}, 33);\n`;

  B["wt_on_key"] = { init() { this.appendDummyInput().appendField("when key").appendField(new Blockly.FieldDropdown(KEY_OPTS), "KEY").appendField("pressed"); this.appendStatementInput("DO"); this.setColour("#ffab19"); } };
  G.forBlock["wt_on_key"] = (b, g) => `addEventListener("keydown",async e=>{if(e.key===${JSON.stringify(b.getFieldValue("KEY"))}){\n${g.statementToCode(b, "DO")}}});\n`;

  B["wt_on_tap"] = { init() { this.appendDummyInput().appendField("when screen clicked / tapped"); this.appendStatementInput("DO"); this.setColour("#ffab19"); } };
  G.forBlock["wt_on_tap"] = (b, g) => `canvas.addEventListener("pointerdown",async()=>{\n${g.statementToCode(b, "DO")}});\n`;

  // Motion
  B["wt_move_xy"] = { init() { this.appendValueInput("DX").setCheck("Number").appendField("move player by x"); this.appendValueInput("DY").setCheck("Number").appendField("y"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#4c97ff"); } };
  G.forBlock["wt_move_xy"] = (b, g) => `player.x+=(${g.valueToCode(b,"DX",0)||0});player.y+=(${g.valueToCode(b,"DY",0)||0});\n`;

  B["wt_set_xy"] = { init() { this.appendValueInput("X").setCheck("Number").appendField("set player to x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#4c97ff"); } };
  G.forBlock["wt_set_xy"] = (b, g) => `player.x=(${g.valueToCode(b,"X",0)||200});player.y=(${g.valueToCode(b,"Y",0)||200});\n`;

  B["wt_jump"] = { init() { this.appendValueInput("PWR").setCheck("Number").appendField("jump power"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#4c97ff"); } };
  G.forBlock["wt_jump"] = (b, g) => `if(player.onGround){player.vy=-(${g.valueToCode(b,"PWR",0)||10});player.onGround=false;}\n`;

  B["wt_apply_gravity"] = { init() { this.appendValueInput("G").setCheck("Number").appendField("gravity"); this.appendValueInput("FLR").setCheck("Number").appendField("floor y"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#4c97ff"); } };
  G.forBlock["wt_apply_gravity"] = (b, g) => `{const _fl=${g.valueToCode(b,"FLR",0)||340};player.vy+=(${g.valueToCode(b,"G",0)||0.5});player.y+=player.vy;if(player.y>=_fl){player.y=_fl;player.vy=0;player.onGround=true;}}\n`;

  B["wt_keep_in_bounds"] = { init() { this.appendDummyInput().appendField("keep player inside screen"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#4c97ff"); } };
  G.forBlock["wt_keep_in_bounds"] = () => `player.x=Math.max(16,Math.min(384,player.x));player.y=Math.max(16,Math.min(384,player.y));\n`;

  B["wt_player_x"] = { init() { this.appendDummyInput().appendField("player x"); this.setOutput(true, "Number"); this.setColour("#4c97ff"); } };
  G.forBlock["wt_player_x"] = () => ["player.x", G.ORDER_ATOMIC];

  B["wt_player_y"] = { init() { this.appendDummyInput().appendField("player y"); this.setOutput(true, "Number"); this.setColour("#4c97ff"); } };
  G.forBlock["wt_player_y"] = () => ["player.y", G.ORDER_ATOMIC];

  // Looks & Draw
  B["wt_clear_canvas"] = { init() { this.appendDummyInput().appendField("clear screen"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_clear_canvas"] = () => `ctx.fillStyle="#16121e";ctx.fillRect(0,0,400,400);\n`;

  B["wt_set_color"] = { init() { this.appendDummyInput().appendField("set color").appendField(new Blockly.FieldColour("#d0bcff"), "COL"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_set_color"] = b => `ctx.fillStyle=${JSON.stringify(b.getFieldValue("COL"))};\n`;

  B["wt_draw_player"] = { init() { this.appendValueInput("SZ").setCheck("Number").appendField("draw player size"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_player"] = (b, g) => `{const _s=${g.valueToCode(b,"SZ",0)||28};ctx.beginPath();ctx.roundRect(player.x-_s/2,player.y-_s/2,_s,_s,8);ctx.fill();}\n`;

  B["wt_draw_rect"] = { init() { this.appendValueInput("X").setCheck("Number").appendField("draw rect x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.appendValueInput("W").setCheck("Number").appendField("w"); this.appendValueInput("H").setCheck("Number").appendField("h"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_rect"] = (b, g) => `ctx.fillRect(${g.valueToCode(b,"X",0)||0},${g.valueToCode(b,"Y",0)||0},${g.valueToCode(b,"W",0)||30},${g.valueToCode(b,"H",0)||30});\n`;

  B["wt_draw_circle"] = { init() { this.appendValueInput("X").setCheck("Number").appendField("draw circle x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.appendValueInput("R").setCheck("Number").appendField("r"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_circle"] = (b, g) => `ctx.beginPath();ctx.arc(${g.valueToCode(b,"X",0)||200},${g.valueToCode(b,"Y",0)||200},${g.valueToCode(b,"R",0)||15},0,7);ctx.fill();\n`;

  B["wt_draw_text"] = { init() { this.appendDummyInput().appendField("draw text").appendField(new Blockly.FieldTextInput("Web Tok!"), "TXT"); this.appendValueInput("X").setCheck("Number").appendField("x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_text"] = (b, g) => `ctx.font="bold 20px sans-serif";ctx.fillText(${JSON.stringify(b.getFieldValue("TXT"))},${g.valueToCode(b,"X",0)||20},${g.valueToCode(b,"Y",0)||40});\n`;

  B["wt_draw_score"] = { init() { this.appendDummyInput().appendField("draw score at top"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_score"] = () => `ctx.fillStyle="#fff";ctx.font="bold 18px sans-serif";ctx.fillText("Score: "+score,16,28);\n`;

  // Control: Wait
  B["wt_wait"] = { init() { this.appendValueInput("SEC").setCheck("Number").appendField("wait"); this.appendDummyInput().appendField("seconds"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#ffab19"); } };
  G.forBlock["wt_wait"] = (b, g) => `await new Promise(r=>setTimeout(r,Math.max(0,(${g.valueToCode(b,"SEC",0)||1})*1000)));\n`;

  // Sensing & Score
  B["wt_key_down"] = { init() { this.appendDummyInput().appendField("key").appendField(new Blockly.FieldDropdown(KEY_OPTS), "KEY").appendField("held?"); this.setOutput(true, "Boolean"); this.setColour("#5cb1d6"); } };
  G.forBlock["wt_key_down"] = b => [`!!keys[${JSON.stringify(b.getFieldValue("KEY"))}]`, G.ORDER_ATOMIC];

  B["wt_touching_box"] = { init() { this.appendValueInput("X").setCheck("Number").appendField("touching x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.appendValueInput("W").setCheck("Number").appendField("w"); this.appendValueInput("H").setCheck("Number").appendField("h"); this.setInputsInline(true); this.setOutput(true, "Boolean"); this.setColour("#5cb1d6"); } };
  G.forBlock["wt_touching_box"] = (b, g) => [`(Math.abs(player.x-(${g.valueToCode(b,"X",0)||0}))<(${g.valueToCode(b,"W",0)||30})/2+14&&Math.abs(player.y-(${g.valueToCode(b,"Y",0)||0}))<(${g.valueToCode(b,"H",0)||30})/2+14)`, G.ORDER_LOGICAL_AND];

  B["wt_change_score"] = { init() { this.appendValueInput("VAL").setCheck("Number").appendField("change score by"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#5cb1d6"); } };
  G.forBlock["wt_change_score"] = (b, g) => `score+=(${g.valueToCode(b,"VAL",0)||1});\n`;

  B["wt_set_score"] = { init() { this.appendValueInput("VAL").setCheck("Number").appendField("set score to"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#5cb1d6"); } };
  G.forBlock["wt_set_score"] = (b, g) => `score=(${g.valueToCode(b,"VAL",0)||0});\n`;

  B["wt_score_val"] = { init() { this.appendDummyInput().appendField("score"); this.setOutput(true, "Number"); this.setColour("#5cb1d6"); } };
  G.forBlock["wt_score_val"] = () => ["score", G.ORDER_ATOMIC];

  B["wt_random"] = { init() { this.appendValueInput("A").setCheck("Number").appendField("random from"); this.appendValueInput("B").setCheck("Number").appendField("to"); this.setInputsInline(true); this.setOutput(true, "Number"); this.setColour("#5cb1d6"); } };
  G.forBlock["wt_random"] = (b, g) => [`(Math.floor(Math.random()*((${g.valueToCode(b,"B",0)||100})-(${g.valueToCode(b,"A",0)||0})+1))+(${g.valueToCode(b,"A",0)||0}))`, G.ORDER_ADDITION];
}

function loadDefaultScratchBlocks() {
  if (!blocklyWs) return;
  const xml = `<xml>
    <block type="wt_every_frame" x="20" y="20"><statement name="DO">
      <block type="controls_if"><value name="IF0"><block type="wt_key_down"><field name="KEY">ArrowLeft</field></block></value><statement name="DO0"><block type="wt_move_xy"><value name="DX"><shadow type="math_number"><field name="NUM">-6</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></statement>
      <next><block type="controls_if"><value name="IF0"><block type="wt_key_down"><field name="KEY">ArrowRight</field></block></value><statement name="DO0"><block type="wt_move_xy"><value name="DX"><shadow type="math_number"><field name="NUM">6</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></statement>
      <next><block type="wt_apply_gravity"><value name="G"><shadow type="math_number"><field name="NUM">0.6</field></shadow></value><value name="FLR"><shadow type="math_number"><field name="NUM">340</field></shadow></value>
      <next><block type="wt_keep_in_bounds"><next><block type="wt_clear_canvas"><next><block type="wt_set_color"><field name="COL">#d0bcff</field><next><block type="wt_draw_player"><value name="SZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value><next><block type="wt_draw_score"></block></next></block></next></block></next></block></next></block></next></block></next></block></next></block>
    </statement></block>
    <block type="wt_on_key" x="20" y="340"><field name="KEY"> </field><statement name="DO"><block type="wt_jump"><value name="PWR"><shadow type="math_number"><field name="NUM">12</field></shadow></value></block></statement></block>
  </xml>`;
  blocklyWs.clear();
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), blocklyWs);
}

function getScratchJs() { const G = getJsGen(); return (blocklyWs && G) ? G.workspaceToCode(blocklyWs) : ""; }
function getScratchXml() { return blocklyWs ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs)) : ""; }
function setScratchXml(xml) { if (!blocklyWs || !xml) return; blocklyWs.clear(); Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), blocklyWs); }