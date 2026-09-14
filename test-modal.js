// 最小 DOM 桩：加载 index.html 中的真实脚本，模拟键盘/点击交互
const fs = require("fs");
const vm = require("vm");

function makeEl(id = "") {
  const handlers = {};
  const el = {
    id,
    dataset: {},
    textContent: "",
    innerHTML: "",
    disabled: false,
    inert: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    appendChild() {},
    prepend() {},
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    focus() { doc.activeElement = el; },
    _dispatch(type, ev) { (handlers[type] || []).forEach((fn) => fn(ev)); },
  };
  return el;
}

const ids = [
  "day","phase","pips","apLeft","apMax","confirmOverlay","remainAp","remainDay",
  "log","endDayBtn","cancelEnd","confirmEnd",
];
const byId = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
const gameEl = makeEl("game");
const actionBtns = ["explore","rest","guard"].map((act, i) => {
  const b = makeEl(act);
  b.dataset = { act, cost: String(i < 2 ? 1 : 2) };
  return b;
});

const docHandlers = {};
const doc = {
  activeElement: null,
  getElementById: (id) => byId[id],
  querySelector: (sel) => (sel === ".game" ? gameEl : null),
  querySelectorAll: (sel) => (sel === "[data-cost]" ? actionBtns : []),
  createElement: () => makeEl(),
  addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
};

const html = fs.readFileSync("/workspace/index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInNewContext(script, { document: doc, console });

// ---- 测试工具 ----
const overlay = byId.confirmOverlay;
const click = (el) => el._dispatch("click", { target: el, preventDefault() {} });
const key = (k, opts = {}) =>
  (docHandlers.keydown || []).forEach((fn) =>
    fn({ key: k, shiftKey: !!opts.shift, preventDefault() {}, target: doc.activeElement })
  );
const apShown = () => Number(byId.apLeft.textContent);
const remainShown = () => Number(byId.remainAp.textContent);
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name); }
}

// === 场景：剩 2 点打开确认框 ===
console.log("初始：第1天 2 点");
byId.endDayBtn.focus();
click(byId.endDayBtn);
check("弹窗已打开", overlay.classList.contains("show"));
check("弹窗显示剩余 2 点", remainShown() === 2);
check("背景已 inert（Tab/辅助技术不可达）", gameEl.inert === true);
check("焦点进入弹窗（取消按钮）", doc.activeElement === byId.cancelEnd);

// 1) 键盘 Enter 触发背景行动按钮（焦点本应到不了，这里直接派发 click 验证逻辑保险）
click(actionBtns[0]);
check("弹窗期间背景行动不扣点（仍为 2）", apShown() === 2);
check("弹窗剩余数字仍为 2（不陈旧）", remainShown() === 2);

// 2) Tab 焦点陷阱：在两个弹窗按钮间循环
key("Tab"); // cancel -> confirm
check("Tab: 焦点到「确认结束」", doc.activeElement === byId.confirmEnd);
key("Tab"); // 末尾循环回首
check("Tab: 末尾循环回「再行动一会儿」", doc.activeElement === byId.cancelEnd);
key("Tab", { shift: true }); // 反向到末尾
check("Shift+Tab: 循环到「确认结束」", doc.activeElement === byId.confirmEnd);

// 3) Esc 取消
key("Escape");
check("Esc 后弹窗关闭", !overlay.classList.contains("show"));
check("Esc 后背景解除 inert", gameEl.inert === false);
check("Esc 后点数未损失（仍 2）", apShown() === 2);
check("焦点还给触发弹窗的按钮", doc.activeElement === byId.endDayBtn);

// 4) 取消后背景行动恢复正常
click(actionBtns[0]);
check("关闭后行动可正常扣点（变为 1）", apShown() === 1);

// === 剩 1 点再次打开，确认放弃 ===
click(byId.endDayBtn);
check("再次打开弹窗显示剩余 1 点", remainShown() === 1);
click(actionBtns[1]); // 弹窗期间尝试再扣
check("弹窗期间点数保持 1", apShown() === 1 && remainShown() === 1);
click(byId.confirmEnd);
check("确认后弹窗关闭", !overlay.classList.contains("show"));
check("确认后进入第 2 天", Number(byId.day.textContent) === 2);
check("第 2 天点数恢复为 2", apShown() === 2);
check("确认后背景解除 inert", gameEl.inert === false);

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
