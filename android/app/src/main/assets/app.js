(() => {
  'use strict';
  const SAMPLE_RATE = 8192;
  const FFT_SIZE = 2048;
  const EXAMPLE_A = [[3, 1, -1], [2, 4, 1], [-1, 2, 5]];
  const EXAMPLE_B = [6, 9, -2];
  const sizeSelect = document.getElementById('sizeSelect');
  const matrixTable = document.getElementById('matrixTable');
  const inputError = document.getElementById('inputError');
  const solveButton = document.getElementById('solveButton');
  const exampleButton = document.getElementById('exampleButton');
  const solveStatus = document.getElementById('solveStatus');
  const solutionContent = document.getElementById('solutionContent');
  const residualLine = document.getElementById('residualLine');
  const peakList = document.getElementById('peakList');
  const chamberCanvas = document.getElementById('chamberCanvas');
  const waveCanvas = document.getElementById('waveCanvas');

  let tones = [];
  let waveform = new Float64Array(FFT_SIZE);
  let normalizedWaveform = new Float64Array(FFT_SIZE);
  let lastRunAt = 0;
  let noiseFloor = 0;
  const fieldCanvas = document.createElement('canvas');
  const fieldContext = fieldCanvas.getContext('2d', { alpha: true });
  fieldCanvas.width = 180;
  fieldCanvas.height = 108;
  const fieldPixels = fieldContext.createImageData(fieldCanvas.width, fieldCanvas.height);

  function formatNumber(value, digits = 5) {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) < 1e-9) value = 0;
    return Number(value.toPrecision(digits)).toString();
  }

  function buildEditor(n, matrix = null, rhs = null) {
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let j = 0; j < n; j++) {
      const th = document.createElement('th');
      th.textContent = `x${j + 1}`;
      headerRow.appendChild(th);
    }
    const rhsHead = document.createElement('th');
    rhsHead.textContent = 'b';
    headerRow.appendChild(rhsHead);
    head.appendChild(headerRow);
    const body = document.createElement('tbody');
    for (let i = 0; i < n; i++) {
      const row = document.createElement('tr');
      for (let j = 0; j < n; j++) {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.inputMode = 'decimal';
        input.value = matrix ? String(matrix[i][j]) : (i === j ? '1' : '0');
        input.dataset.row = String(i);
        input.dataset.col = String(j);
        input.setAttribute('aria-label', `Koefisien baris ${i + 1}, kolom ${j + 1}`);
        cell.appendChild(input);
        row.appendChild(cell);
      }
      const rhsCell = document.createElement('td');
      const rhsInput = document.createElement('input');
      rhsInput.type = 'number';
      rhsInput.step = 'any';
      rhsInput.inputMode = 'decimal';
      rhsInput.value = rhs ? String(rhs[i]) : '1';
      rhsInput.dataset.row = String(i);
      rhsInput.className = 'rhs-input';
      rhsInput.setAttribute('aria-label', `Ruas kanan b baris ${i + 1}`);
      rhsCell.appendChild(rhsInput);
      row.appendChild(rhsCell);
      body.appendChild(row);
    }
    matrixTable.replaceChildren(head, body);
  }

  function readSystem() {
    const n = Number(sizeSelect.value);
    const inputs = [...matrixTable.querySelectorAll('input')];
    const a = Array.from({ length: n }, () => Array(n).fill(0));
    const b = Array(n).fill(0);
    for (const input of inputs) {
      const value = input.value.trim() === '' ? NaN : Number(input.value);
      if (!Number.isFinite(value)) {
        const row = Number(input.dataset.row) + 1;
        const col = input.classList.contains('rhs-input') ? 'b' : `kolom ${Number(input.dataset.col) + 1}`;
        throw new Error(`Nilai baris ${row}, ${col} harus berupa angka yang valid.`);
      }
      const i = Number(input.dataset.row);
      if (input.classList.contains('rhs-input')) b[i] = value;
      else a[i][Number(input.dataset.col)] = value;
    }
    return { a, b };
  }

  function solveLinear(a, b) {
    const n = b.length;
    const m = a.map((row, i) => [...row, b[i]]);
    const scale = Math.max(1, ...a.flat().map(Math.abs));
    const tolerance = scale * 1e-12;
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
      }
      if (Math.abs(m[pivot][col]) <= tolerance) {
        throw new Error('Matriks singular atau hampir singular; solusi tunggal tidak dapat dihitung.');
      }
      [m[col], m[pivot]] = [m[pivot], m[col]];
      const pivotValue = m[col][col];
      for (let k = col; k <= n; k++) m[col][k] /= pivotValue;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = m[row][col];
        for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
      }
    }
    return m.map(row => row[n]);
  }

  function makeTones(a) {
    const n = a.length;
    const maxCoefficient = Math.max(...a.flat().map(Math.abs));
    if (maxCoefficient < 1e-15) return [];
    const result = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const coefficient = a[i][j];
        if (Math.abs(coefficient) < maxCoefficient * 1e-5) continue;
        // Bin mapping is deliberately deterministic and synthetic: row/column indices
        // select a tone; coefficient magnitude/sign set its relative amplitude/phase.
        const bin = 56 + j * 30 + i * 6;
        const frequency = bin * SAMPLE_RATE / FFT_SIZE;
        const phase = coefficient < 0 ? Math.PI : 0;
        const amplitude = Math.abs(coefficient) / maxCoefficient;
        const angle = -Math.PI / 2 + (i * 0.91 + j * 1.63) % (Math.PI * 2);
        const resonance = 0.78 + 0.22 * Math.exp(-Math.pow((frequency - 510) / 230, 2));
        result.push({ row: i, col: j, frequency, bin, phase, amplitude: amplitude * resonance, rawAmplitude: amplitude, angle });
      }
    }
    return result;
  }

  function synthesize(components) {
    const out = new Float64Array(FFT_SIZE);
    if (!components.length) return out;
    for (let sample = 0; sample < FFT_SIZE; sample++) {
      const t = sample / SAMPLE_RATE;
      let sum = 0;
      for (const tone of components) {
        const omegaT = 2 * Math.PI * tone.frequency * t + tone.phase;
        // A small software echo/decay colors the synthetic signal. It is not a physical
        // chamber model or measurement; it only makes the example signal more illustrative.
        const echo1 = Math.sin(omegaT - tone.frequency * 2 * Math.PI * 0.0017) * 0.26;
        const echo2 = Math.sin(omegaT - tone.frequency * 2 * Math.PI * 0.0031) * 0.12;
        const envelope = 0.84 + 0.16 * Math.exp(-t * 4.5);
        sum += tone.amplitude * (Math.sin(omegaT) + echo1 + echo2) * envelope;
      }
      out[sample] = sum;
    }
    const peak = Math.max(1e-12, ...Array.from(out, Math.abs));
    const normalized = Float64Array.from(out, value => value / peak);
    return { raw: out, normalized };
  }

  function fftReal(input) {
    const n = input.length;
    const re = Float64Array.from(input);
    const im = new Float64Array(n);
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = -2 * Math.PI / len;
      const wLenRe = Math.cos(angle);
      const wLenIm = Math.sin(angle);
      for (let start = 0; start < n; start += len) {
        let wRe = 1;
        let wIm = 0;
        for (let k = 0; k < len / 2; k++) {
          const even = start + k;
          const odd = even + len / 2;
          const uRe = re[even];
          const uIm = im[even];
          const vRe = re[odd] * wRe - im[odd] * wIm;
          const vIm = re[odd] * wIm + im[odd] * wRe;
          re[even] = uRe + vRe;
          im[even] = uIm + vIm;
          re[odd] = uRe - vRe;
          im[odd] = uIm - vIm;
          const nextRe = wRe * wLenRe - wIm * wLenIm;
          wIm = wRe * wLenIm + wIm * wLenRe;
          wRe = nextRe;
        }
      }
    }
    const magnitudes = new Float64Array(n / 2);
    for (let i = 0; i < magnitudes.length; i++) magnitudes[i] = Math.hypot(re[i], im[i]) / n;
    return magnitudes;
  }

  function findPeaks(spectrum) {
    const candidates = [];
    for (let bin = 2; bin < spectrum.length - 1; bin++) {
      const mag = spectrum[bin];
      if (mag > spectrum[bin - 1] && mag >= spectrum[bin + 1]) candidates.push({ bin, mag, frequency: bin * SAMPLE_RATE / FFT_SIZE });
    }
    candidates.sort((a, b) => b.mag - a.mag);
    const chosen = [];
    for (const candidate of candidates) {
      if (chosen.every(item => Math.abs(item.bin - candidate.bin) > 2)) chosen.push(candidate);
      if (chosen.length === 6) break;
    }
    const max = chosen.length ? chosen[0].mag : 1;
    return chosen.map(p => ({ ...p, relative: p.mag / max }));
  }

  function renderPeaks(peaks) {
    if (!peaks.length) {
      peakList.innerHTML = '<div class="peak-empty">Koefisien nol: tidak ada komponen frekuensi.</div>';
      return;
    }
    peakList.innerHTML = peaks.map(peak => `<div class="peak-row"><span class="peak-frequency">${peak.frequency.toFixed(0)} Hz</span><span class="peak-track"><span class="peak-bar" style="display:block;width:${Math.max(3, peak.relative * 100).toFixed(1)}%"></span></span><span class="peak-level">${(peak.relative * 100).toFixed(0)}%</span></div>`).join('');
  }

  function renderSolution(x, a, b) {
    const residuals = a.map((row, i) => row.reduce((sum, coefficient, j) => sum + coefficient * x[j], 0) - b[i]);
    const maxResidual = Math.max(...residuals.map(Math.abs));
    solutionContent.innerHTML = `<div class="solution-values">${x.map((value, i) => `<span class="solution-value">x<sub>${i + 1}</sub> = ${formatNumber(value)}</span>`).join('')}</div>`;
    residualLine.hidden = false;
    residualLine.textContent = `‖Ax − b‖∞ = ${formatNumber(maxResidual, 3)} · ${x.length} variabel`; 
    solveStatus.textContent = 'SOLUSI DITEMUKAN';
    solveStatus.className = 'result-badge success';
  }

  function showSolverError(message) {
    solutionContent.innerHTML = `<div class="empty-solution"><span class="empty-symbol">×</span><span>${message}</span></div>`;
    residualLine.hidden = true;
    solveStatus.textContent = 'TIDAK ADA SOLUSI TUNGGAL';
    solveStatus.className = 'result-badge failure';
  }

  function runSimulation() {
    inputError.hidden = true;
    try {
      const { a, b } = readSystem();
      const nextTones = makeTones(a);
      tones = nextTones;
      const synthesized = synthesize(nextTones);
      if (synthesized instanceof Float64Array) {
        waveform = synthesized;
        normalizedWaveform = synthesized;
      } else {
        waveform = synthesized.raw;
        normalizedWaveform = synthesized.normalized;
      }
      noiseFloor = 0;
      const spectrum = fftReal(normalizedWaveform);
      renderPeaks(findPeaks(spectrum));
      drawWaveform();
      lastRunAt = performance.now();
      try {
        const x = solveLinear(a, b);
        renderSolution(x, a, b);
      } catch (error) {
        showSolverError(error.message);
      }
      drawChamber(performance.now());
    } catch (error) {
      inputError.textContent = error.message;
      inputError.hidden = false;
      solveStatus.textContent = 'PERIKSA INPUT';
      solveStatus.className = 'result-badge failure';
    }
  }

  function drawWaveform() {
    const rect = waveCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(240, Math.round(rect.width * dpr));
    const height = Math.max(70, Math.round(rect.height * dpr));
    if (waveCanvas.width !== width || waveCanvas.height !== height) {
      waveCanvas.width = width;
      waveCanvas.height = height;
    }
    const ctx = waveCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(4,12,20,.6)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(132,164,190,.1)';
    ctx.lineWidth = 1;
    for (let line = 1; line <= 3; line++) {
      const y = height * line / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    for (let line = 1; line <= 7; line++) {
      const x = width * line / 8;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    ctx.beginPath();
    const center = height / 2;
    const amplitude = height * 0.39;
    for (let i = 0; i < normalizedWaveform.length; i++) {
      const x = i * width / (normalizedWaveform.length - 1);
      const y = center - normalizedWaveform[i] * amplitude;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#58e1df';
    ctx.lineWidth = 1.3 * dpr;
    ctx.shadowColor = 'rgba(85,224,228,.62)';
    ctx.shadowBlur = 7 * dpr;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(111,139,163,.78)';
    ctx.font = `${Math.max(8, 9 * dpr)}px ui-monospace,monospace`;
    ctx.fillText('0', 7, height - 6);
    ctx.fillText('0,25 s', width - 48 * dpr, height - 6);
  }

  function pointInsideOctagon(nx, ny) {
    const ax = Math.abs(nx), ay = Math.abs(ny);
    return ax <= 1 && ay <= 1 && ax + ay <= 1.4;
  }

  function drawChamber(now) {
    const rect = chamberCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(240, Math.round(rect.width * dpr));
    const height = Math.max(160, Math.round(rect.height * dpr));
    if (chamberCanvas.width !== width || chamberCanvas.height !== height) {
      chamberCanvas.width = width;
      chamberCanvas.height = height;
    }
    const ctx = chamberCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(7,17,29,.28)';
    ctx.fillRect(0, 0, width, height);

    const time = now / 1000;
    const cx = width / 2, cy = height / 2;
    const rx = width * 0.45, ry = height * 0.43;
    const active = tones.slice(0, 25);
    const maxAmplitude = Math.max(1, active.reduce((s, t) => s + t.amplitude, 0));
    const W = fieldCanvas.width, H = fieldCanvas.height;
    for (let py = 0; py < H; py++) {
      const y = (py / (H - 1) - 0.5) * 2;
      for (let px = 0; px < W; px++) {
        const x = (px / (W - 1) - 0.5) * 2;
        const idx = (py * W + px) * 4;
        if (!pointInsideOctagon(x, y)) {
          fieldPixels.data[idx + 3] = 0;
          continue;
        }
        let field = 0;
        for (const tone of active) {
          const sx = Math.cos(tone.angle) * 0.77;
          const sy = Math.sin(tone.angle) * 0.75;
          const dx = x - sx, dy = y - sy;
          const distance = Math.hypot(dx, dy);
          const wavelength = 0.42 * 250 / tone.frequency;
          const phase = 2 * Math.PI * (distance / wavelength - time * (1.9 + tone.frequency / 240));
          field += tone.amplitude * Math.sin(phase + tone.phase) * Math.exp(-distance * 1.05);
        }
        field = Math.max(-1, Math.min(1, field / maxAmplitude * 2.25));
        const intensity = Math.abs(field);
        if (field >= 0) {
          fieldPixels.data[idx] = 13 + 21 * intensity;
          fieldPixels.data[idx + 1] = 28 + 160 * intensity;
          fieldPixels.data[idx + 2] = 43 + 195 * intensity;
        } else {
          fieldPixels.data[idx] = 22 + 135 * intensity;
          fieldPixels.data[idx + 1] = 23 + 58 * intensity;
          fieldPixels.data[idx + 2] = 52 + 180 * intensity;
        }
        fieldPixels.data[idx + 3] = tones.length ? 205 : 20;
      }
    }
    fieldContext.putImageData(fieldPixels, 0, 0);

    const vertices = [];
    for (let k = 0; k < 8; k++) {
      const angle = -Math.PI / 2 + Math.PI / 8 + k * Math.PI / 4;
      vertices.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
    }
    ctx.save();
    ctx.beginPath();
    vertices.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(fieldCanvas, 0, 0, width, height);
    ctx.strokeStyle = 'rgba(113,153,190,.13)';
    ctx.lineWidth = 0.8 * dpr;
    for (let g = -3; g <= 3; g++) {
      const x = cx + g * rx / 4;
      ctx.beginPath(); ctx.moveTo(x, cy - ry); ctx.lineTo(x, cy + ry); ctx.stroke();
      const y = cy + g * ry / 4;
      ctx.beginPath(); ctx.moveTo(cx - rx, y); ctx.lineTo(cx + rx, y); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    vertices.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(143,185,218,.58)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.shadowColor = 'rgba(85,224,228,.12)'; ctx.shadowBlur = 9 * dpr; ctx.stroke(); ctx.shadowBlur = 0;

    for (const tone of active) {
      const sx = cx + Math.cos(tone.angle) * rx * 0.77;
      const sy = cy + Math.sin(tone.angle) * ry * 0.75;
      ctx.beginPath(); ctx.arc(sx, sy, 3.2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = tone.phase ? '#bd9aff' : '#77f0e6';
      ctx.shadowColor = tone.phase ? 'rgba(189,154,255,.85)' : 'rgba(119,240,230,.85)';
      ctx.shadowBlur = 8 * dpr; ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  function tick(now) {
    if (document.visibilityState === 'visible') drawChamber(now);
    requestAnimationFrame(tick);
  }

  solveButton.addEventListener('click', runSimulation);
  sizeSelect.addEventListener('change', () => {
    const n = Number(sizeSelect.value);
    buildEditor(n);
  });
  exampleButton.addEventListener('click', () => {
    sizeSelect.value = '3';
    buildEditor(3, EXAMPLE_A, EXAMPLE_B);
    runSimulation();
  });
  window.addEventListener('resize', () => { drawWaveform(); drawChamber(performance.now()); });

  sizeSelect.value = '3';
  buildEditor(3, EXAMPLE_A, EXAMPLE_B);
  runSimulation();
  requestAnimationFrame(tick);
})();
