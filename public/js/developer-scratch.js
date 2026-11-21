/* Scratch-style Blockly workspace + Python/Canvas runner builders for /developer */
let blocklyWs = null, blocklyLoaded = false;

function loadScript(src) {
  return new Promise((ok, no) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no;
    document.head.appendChild(s);
  });
}

async function ensureBlockly(container) {
  if (blocklyWs) return blocklyWs;
  if (!blocklyLoaded) {
    await loadScript("https://cdn.jsdelivr.net/npm/blockly@10.4.3/blockly.min.js");
    registerScratchBlocks();
    blocklyLoaded = true;
  }
  const toolbox = {
    kind: "categoryToolbox",
    contents: [
      { kind: "category", name: "Events", colour: "#ffab19", contents: [
        { kind: "block", type: "wt_every_frame" },
        { kind: "block", type: "wt_on_key" }
      ]},
      { kind: "category", name: "Draw", colour: "#9966ff", contents: [
        { kind: "block", type: "wt_clear_canvas" },
        { kind: "block", type: "wt_set_color" },
        { kind: "block", type: "wt_draw_rect" },
        { kind: "block", type: "wt_draw_circle" },
        { kind: "block", type: "wt_draw_text" }
      ]},
      { kind: "category", name: "Control", colour: "#ffab19", contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "controls_repeat_ext" }
      ]},
      { kind: "category", name: "Math & Logic", colour: "#59c059", contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "logic_compare" }
      ]},
      { kind: "category", name: "Variables", colour: "#ff8c1a", custom: "VARIABLE" }
    ]
  };
  blocklyWs = Blockly.inject(container, { toolbox, trashcan: true, scrollbars: true });
  loadDefaultScratchBlocks();
  return blocklyWs;
}

function registerScratchBlocks() {
  const B = Blockly.Blocks, G = Blockly.JavaScript;
  B["wt_every_frame"] = { init() { this.appendDummyInput().appendField("every frame"); this.appendStatementInput("DO"); this.setColour("#ffab19"); } };
  G.forBlock["wt_every_frame"] = (b, g) => `setInterval(()=>{\n${g.statementToCode(b, "DO")}}, 33);\n`;

  B["wt_on_key"] = { init() { this.appendDummyInput().appendField("when key").appendField(new Blockly.FieldDropdown([["ArrowLeft","ArrowLeft"],["ArrowRight","ArrowRight"],["ArrowUp","ArrowUp"],["ArrowDown","ArrowDown"],["Space"," "]]), "KEY").appendField("pressed"); this.appendStatementInput("DO"); this.setColour("#ffab19"); } };
  G.forBlock["wt_on_key"] = (b, g) => `addEventListener("keydown",e=>{if(e.key===${JSON.stringify(b.getFieldValue("KEY"))}){\n${g.statementToCode(b, "DO")}}});\n`;

  B["wt_clear_canvas"] = { init() { this.appendDummyInput().appendField("clear screen"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_clear_canvas"] = () => `ctx.fillStyle="#16121e";ctx.fillRect(0,0,400,400);\n`;

  B["wt_set_color"] = { init() { this.appendDummyInput().appendField("set color").appendField(new Blockly.FieldColour("#d0bcff"), "COL"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_set_color"] = b => `ctx.fillStyle=${JSON.stringify(b.getFieldValue("COL"))};\n`;

  B["wt_draw_rect"] = { init() { this.appendValueInput("X").setCheck("Number").appendField("draw rect x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.appendValueInput("W").setCheck("Number").appendField("w"); this.appendValueInput("H").setCheck("Number").appendField("h"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_rect"] = (b, g) => `ctx.fillRect(${g.valueToCode(b,"X",0)||0},${g.valueToCode(b,"Y",0)||0},${g.valueToCode(b,"W",0)||30},${g.valueToCode(b,"H",0)||30});\n`;

  B["wt_draw_circle"] = { init() { this.appendValueInput("X").setCheck("Number").appendField("draw circle x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.appendValueInput("R").setCheck("Number").appendField("r"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_circle"] = (b, g) => `ctx.beginPath();ctx.arc(${g.valueToCode(b,"X",0)||200},${g.valueToCode(b,"Y",0)||200},${g.valueToCode(b,"R",0)||15},0,7);ctx.fill();\n`;

  B["wt_draw_text"] = { init() { this.appendDummyInput().appendField("draw text").appendField(new Blockly.FieldTextInput("Web Tok!"), "TXT"); this.appendValueInput("X").setCheck("Number").appendField("x"); this.appendValueInput("Y").setCheck("Number").appendField("y"); this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#9966ff"); } };
  G.forBlock["wt_draw_text"] = (b, g) => `ctx.font="bold 20px sans-serif";ctx.fillText(${JSON.stringify(b.getFieldValue("TXT"))},${g.valueToCode(b,"X",0)||20},${g.valueToCode(b,"Y",0)||40});\n`;
}

function loadDefaultScratchBlocks() {
  if (!blocklyWs) return;
  const xml = `<xml><block type="wt_every_frame" x="20" y="20"><statement name="DO"><block type="wt_clear_canvas"><next><block type="wt_set_color"><field name="COL">#d0bcff</field><next><block type="wt_draw_circle"><value name="X"><shadow type="math_number"><field name="NUM">200</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">200</field></shadow></value><value name="R"><shadow type="math_number"><field name="NUM">24</field></shadow></value><next><block type="wt_draw_text"><field name="TXT">Use Arrow Keys!</field><value name="X"><shadow type="math_number"><field name="NUM">120</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">50</field></shadow></value></block></next></block></next></block></next></block></statement></block></xml>`;
  blocklyWs.clear();
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), blocklyWs);
}

function getScratchJs() {
  return blocklyWs ? Blockly.JavaScript.workspaceToCode(blocklyWs) : "";
}
function getScratchXml() {
  return blocklyWs ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(blocklyWs)) : "";
}
function setScratchXml(xml) {
  if (!blocklyWs || !xml) return;
  blocklyWs.clear();
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), blocklyWs);
}