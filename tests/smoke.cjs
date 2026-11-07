const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class FakeElement {
  constructor(tag = 'div', width = 0, height = 0) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.style = {};
    this.width = 0;
    this.height = 0;
    this.rect = { width, height };
    this._html = '';
    this.context = makeContext();
    this.classList = { contains: name => this.className.split(/\s+/).includes(name) };
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this[name] = value; }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) {
    const result = [];
    const walk = node => {
      for (const child of node.children) {
        if (selector === 'input' && child.tagName === 'INPUT') result.push(child);
        walk(child);
      }
    };
    walk(this);
    return result;
  }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  getBoundingClientRect() { return this.rect; }
  getContext() { return this.context; }
  set innerHTML(value) { this._html = value; }
  get innerHTML() { return this._html; }
  click() { this.listeners.click?.({ target: this }); }
  change() { this.listeners.change?.({ target: this }); }
}

function makeContext() {
  return {
    createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
    clearRect() {}, fillRect() {}, putImageData() {}, drawImage() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, save() {}, restore() {}, stroke() {}, fill() {}, arc() {}, fillText() {},
    set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {}, set shadowColor(_) {}, set shadowBlur(_) {}, set font(_) {},
    set imageSmoothingEnabled(_) {}
  };
}

const elements = {
  sizeSelect: new FakeElement('select'),
  matrixTable: new FakeElement('table'),
  inputError: new FakeElement('div'),
  solveButton: new FakeElement('button'),
  exampleButton: new FakeElement('button'),
  solveStatus: new FakeElement('span'),
  solutionContent: new FakeElement('div'),
  residualLine: new FakeElement('div'),
  peakList: new FakeElement('div'),
  chamberCanvas: new FakeElement('canvas', 560, 260),
  waveCanvas: new FakeElement('canvas', 520, 82)
};

const document = {
  visibilityState: 'visible',
  getElementById(id) { return elements[id]; },
  createElement(tag) { return new FakeElement(tag); }
};
const window = { devicePixelRatio: 1, addEventListener() {} };
const context = vm.createContext({
  document, window,
  requestAnimationFrame() {},
  performance: { now: () => 100 },
  console,
  Float64Array, Uint8ClampedArray, Math, Number, Array, Error,
  setTimeout, clearTimeout
});

const app = fs.readFileSync(path.join(__dirname, '..', 'shared', 'app.js'), 'utf8');
vm.runInContext(app, context, { filename: 'app.js', timeout: 5000 });
if (elements.solveStatus.textContent !== 'SOLUSI DITEMUKAN') console.error('Initial UI error:', elements.inputError.textContent);
assert.equal(elements.solveStatus.textContent, 'SOLUSI DITEMUKAN', 'example system should solve');
assert.match(elements.solutionContent.innerHTML, /x<sub>1<\/sub> = 1/);
assert.match(elements.solutionContent.innerHTML, /x<sub>2<\/sub> = 2/);
assert.match(elements.solutionContent.innerHTML, /x<sub>3<\/sub> = -1/);
assert.match(elements.residualLine.textContent, /0/);
assert.match(elements.peakList.innerHTML, /Hz/, 'FFT peaks should be present');
assert.ok(elements.chamberCanvas.width > 0 && elements.waveCanvas.height > 0, 'both local visualizations should render');

// A singular 2x2 system must be reported rather than returning an arbitrary vector.
elements.sizeSelect.value = '2';
elements.sizeSelect.change();
const inputs = elements.matrixTable.querySelectorAll('input');
const values = ['1', '2', '3', '2', '4', '6'];
inputs.forEach((input, i) => { input.value = values[i]; });
elements.solveButton.click();
assert.equal(elements.solveStatus.textContent, 'TIDAK ADA SOLUSI TUNGGAL');
assert.match(elements.solutionContent.innerHTML, /singular/i);

inputs[0].value = '';
elements.solveButton.click();
assert.equal(elements.solveStatus.textContent, 'PERIKSA INPUT');
assert.equal(elements.inputError.hidden, false);
assert.match(elements.inputError.textContent, /angka yang valid/);

console.log('PASS: sample solution, FFT peaks, visualization canvases, singular detection, and invalid-input handling');
