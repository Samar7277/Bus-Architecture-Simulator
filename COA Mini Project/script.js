const $ = s => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";

const ld = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch (e) {
    return d;
  }
};

const sv = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};

const SZ = 256;
const N = { cpu: 'CPU', ram: 'RAM', in: 'Input', out: 'Output' };
const NAME = { addr: 'Address Bus', data: 'Data Bus', ctrl: 'Control Bus' };
const X = { cpu: 180, ram: 480, in: 590, out: 690 };
const Y = { addr: 110, data: 170, ctrl: 230 };
const C = { addr: 'var(--pu)', data: 'var(--cy)', ctrl: 'var(--or)' };

const initMem = () => {
  const m = {};
  for (let i = 0; i < SZ; i++) {
    m[i] = (i * 37 + 11) & 255;
  }
  return m;
};

let mem = ld('bas_mem', null) || initMem();
let page = 'dash';
let sim = null;
let recent = ld('bas_recent', []);

function addR(op, a, d, sg) {
  recent.unshift({ op, a, d, sg, t: new Date().toLocaleTimeString() });
  recent = recent.slice(0, 50);
  sv('bas_recent', recent);
}

const hex = (v, d = 2) => '0x' + v.toString(16).toUpperCase().padStart(d, '0');
const bin = (v, w) => v.toString(2).padStart(w, '0').replace(/(.{4})(?=.)/g, '$1 ');
const bits = v => Math.max(1, v.toString(2).length);

function parse(s, f) {
  s = String(s).trim().replace(/[_\s]/g, '');

  if (f === 'hex') {
    s = s.replace(/^0x/i, '');
  } else if (f === 'bin') {
    s = s.replace(/^0b/i, '');
  }

  if (!s) {
    return { err: 'Enter a value first.' };
  }

  const re = {
    bin: /^[01]+$/,
    dec: /^\d+$/,
    hex: /^[0-9a-f]+$/i
  }[f];

  if (!re.test(s)) {
    const label = {
      bin: 'binary (0/1)',
      dec: 'decimal (0-9)',
      hex: 'hexadecimal (0-9, A-F)'
    }[f];
    return { err: `"${s}" is not a valid ${label} number.` };
  }

  return { v: parseInt(s, { bin: 2, dec: 10, hex: 16 }[f]) };
}

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}

const msg = (id, cls, h) => {
  const o = $(id);
  o.className = 'msg ' + cls;
  o.innerHTML = h;
};

const sel = (id, o, v) =>
  `<select id="${id}">${Object.entries(o)
    .map(([k, l]) => `<option value="${k}"${k == v ? ' selected' : ''}>${l}</option>`)
    .join('')}</select>`;

const fld = (l, h) => `<label>${l}${h}</label>`;
const FM = { bin: 'Binary', dec: 'Decimal', hex: 'Hexadecimal' };

function confirm2(b, fn) {
  if (b.dataset.arm) {
    fn();
    delete b.dataset.arm;
    return;
  }

  b.dataset.arm = 1;
  const o = b.textContent;
  b.textContent = 'Click again to confirm';

  setTimeout(() => {
    delete b.dataset.arm;
    b.textContent = o;
  }, 3000);
}

/* ---------- architecture diagram ---------- */
function arch() {
  const box = (id, x, w, l, s) => `
    <g id="N-${id}" class="node">
      <rect x="${x}" y="20" width="${w}" height="260" rx="14"/>
      <text x="${x + w / 2}" y="46" text-anchor="middle" class="t1">${l}</text>
      <text x="${x + w / 2}" y="62" text-anchor="middle" class="t2">${s}</text>
    </g>`;

  const L = {
    addr: 'ADDRESS BUS  CPU → target',
    data: 'DATA BUS  ⇄ bidirectional',
    ctrl: 'CONTROL BUS  signals'
  };

  const lanes = ['addr', 'data', 'ctrl']
    .map(b => {
      const dots = [480, 590, 690]
        .map(x => `<circle cx="${x}" cy="${Y[b]}" r="4" fill="${C[b]}"/>`)
        .join('');

      return `
        <line id="L-${b}" class="lane" style="color:${C[b]}" x1="180" x2="690" y1="${Y[b]}" y2="${Y[b]}" stroke="${C[b]}"/>
        <text x="194" y="${Y[b] - 9}" class="lbl" fill="${C[b]}">${L[b]}</text>
        ${dots}`;
    })
    .join('');

  return `
    <div class="card">
      <svg class="arch" viewBox="0 0 760 300">
        ${box('cpu', 20, 160, 'CPU', 'ALU · CU · registers')}
        ${box('ram', 430, 100, 'RAM', 'Main memory')}
        ${box('in', 550, 80, 'INPUT', 'Keyboard')}
        ${box('out', 650, 80, 'OUTPUT', 'Display')}
        ${lanes}
        <g id="sig"></g>
      </svg>
      <div id="opbar">Idle – run an operation to animate the buses.</div>
    </div>`;
}

function flash(bus, from, to, label, ms = 900) {
  const L = bus && $('#L-' + bus);
  const ids = [from, to]
    .filter(Boolean)
    .map(i => $('#N-' + i))
    .filter(Boolean);

  L && L.classList.add('on');
  ids.forEach(e => e.classList.add('hot'));

  const ob = $('#opbar');
  if (ob) {
    ob.innerHTML = (bus ? `<b class="c-${bus}">${NAME[bus]}</b> · ` : '') + label;
  }

  const g = $('#sig');
  if (g && bus && from && to) {
    const c = document.createElementNS(NS, 'circle');
    const a = document.createElementNS(NS, 'animate');
    c.setAttribute('cy', Y[bus]);
    c.setAttribute('r', 7);
    c.setAttribute('fill', C[bus]);

    [
      ['attributeName', 'cx'],
      ['from', X[from]],
      ['to', X[to]],
      ['dur', ms / 1000 + 's'],
      ['fill', 'freeze']
    ].forEach(([k, v]) => a.setAttribute(k, v));

    c.appendChild(a);
    g.appendChild(c);
    setTimeout(() => c.remove(), ms);
  }

  setTimeout(() => {
    L && L.classList.remove('on');
    ids.forEach(e => e.classList.remove('hot'));
  }, ms);
}

/* ---------- pages ---------- */
const head = (t, s) => `<h1>${t}</h1><p class="sub">${s}</p>`;

function pDash() {
  const pop = Object.values(mem).filter(v => v).length;

  const card = (k, t, dir, p, pg) => `
    <div class="card">
      <span class="tag c-${k}">${dir}</span>
      <h2 style="margin-top:10px">${t}</h2>
      <p class="sub">${p}</p>
      <button class="b pri" onclick="go('${pg}')">Start simulation</button>
    </div>`;

  const team = [
    'SAMAR MASOOD  (60)',
    'ADARSH KUMAR  (03)',
    'KARTIK GUPTA  (34)',
    'NISHANT GANGWAR  (46)'
  ]
    .map(
      (n, i) => `
      <div class="card">
        <span class="tag c-data">${i + 1}</span>
        <h2 style="margin:10px 0 0">${n}</h2>
      </div>`
    )
    .join('');

  return (
    head(
      'Bus Architecture Simulator',
      'How the Data, Address and Control buses connect the CPU, memory and I/O.'
    ) +
    arch() +
    `
    <div class="grid">
      ${card('data', 'Data Bus', 'Bidirectional', 'Carries the actual values between CPU, RAM and I/O. Its width sets how many bits move per transfer.', 'data')}
      ${card('addr', 'Address Bus', 'CPU → target (unidirectional)', 'Selects which memory or I/O location is accessed. n lines give 2ⁿ addressable locations.', 'addr')}
      ${card('ctrl', 'Control Bus', 'Mixed directions', 'Coordinates operations with read/write, clock, interrupt and arbitration signals.', 'ctrl')}
    </div>
    <div class="grid">
      <div class="card"><h2>Memory</h2>${SZ} bytes simulated · ${pop} non-zero cells</div>
      <div class="card"><h2>System status</h2><span class="c-data">● Ready</span></div>
      <div class="card"><h2>Quick start</h2><button class="b pri" onclick="go('comb')">Run a memory read</button></div>
    </div>
    <h2>Made by</h2>
    <div class="grid">${team}</div>`
  );
}

function pData() {
  return (
    head('Data Bus Simulator', 'Bidirectional transfer of a value between two components.') +
    arch() +
    `
    <div class="card">
      <div class="row">
        ${fld('Source', sel('d-src', N, 'cpu'))}
        ${fld('Destination', sel('d-dst', N, 'ram'))}
        ${fld('Data', `<input id="d-val" value="A5" class="mono">`)}
        ${fld('Format', sel('d-fmt', FM, 'hex'))}
        ${fld('Bus width', sel('d-w', { 8: '8 bits', 16: '16 bits', 32: '32 bits' }, 8))}
        <button class="b pri" onclick="doData()">Transfer</button>
      </div>
      <div id="d-out"></div>
    </div>`
  );
}

function doData() {
  const s = $('#d-src').value;
  const t = $('#d-dst').value;
  const f = $('#d-fmt').value;
  const w = +$('#d-w').value;
  const r = parse($('#d-val').value, f);
  const E = m => msg('#d-out', 'er', m);

  if (s === t) return E('Source and destination must be different components.');
  if (s === 'out') return E('The Output unit only receives data; it cannot be a source.');
  if (t === 'in') return E('The Input unit only sends data; it cannot be a destination.');
  if (r.err) return E(r.err);

  const max = 2 ** w - 1;
  if (r.v > max) {
    return E(
      `${r.v} needs ${bits(r.v)} bits, but a ${w}-bit data bus carries at most ${max} (${hex(max, w / 4)}).`
    );
  }

  flash('data', s, t, `${N[s]} → DATA BUS → ${N[t]}: ${hex(r.v, w / 4)}`, 1100);
  addR('DATA XFER', N[s] + ' → ' + N[t], hex(r.v, w / 4), 'DATA');

  msg(
    '#d-out',
    'ok',
    `
    <table>
      <tr><th>Original</th><td class="mono">${$('#d-val').value}(${f})</td></tr>
      <tr><th>Binary</th><td class="mono">${bin(r.v, w)}</td></tr>
      <tr><th>Decimal</th><td class="mono">${r.v}</td></tr>
      <tr><th>Hex</th><td class="mono">${hex(r.v, w / 4)}</td></tr>
      <tr><th>Bus width</th><td>${w} bits</td></tr>
      <tr><th>Status</th><td class="c-data">SUCCESS: ${N[s]} → ${N[t]}</td></tr>
    </table>`
  );
}

function pAddr() {
  return (
    head('Address Bus Simulator', 'How the CPU names the location it wants to access.') +
    arch() +
    `
    <div class="card">
      <div class="row">
        ${fld('Address width', sel('a-w', { 8: '8 bits', 12: '12 bits', 16: '16 bits', 20: '20 bits', 32: '32 bits' }, 16))}
        ${fld('Address', `<input id="a-val" value="2A" class="mono">`)}
        ${fld('Format', sel('a-fmt', { hex: 'Hexadecimal', dec: 'Decimal' }, 'hex'))}
        ${fld('Operation', sel('a-op', { READ: 'READ', WRITE: 'WRITE' }, 'READ'))}
        ${fld('Target', sel('a-tg', { mem: 'Memory', io: 'I/O' }, 'mem'))}
        <button class="b pri" onclick="doAddr()">Send address</button>
      </div>
      <div id="a-out"></div>
    </div>`
  );
}

function doAddr() {
  const w = +$('#a-w').value;
  const f = $('#a-fmt').value;
  const op = $('#a-op').value;
  const tg = $('#a-tg').value;
  const r = parse($('#a-val').value, f);
  const n = 2 ** w;

  if (r.err) return msg('#a-out', 'er', r.err);
  if (r.v >= n) {
    return msg(
      '#a-out',
      'er',
      `Address ${r.v} (${hex(r.v, w / 4)}) does not fit: a ${w}-bit address bus reaches 0 to ${n - 1} (${hex(n - 1, Math.ceil(w / 4))}).`
    );
  }

  flash(
    'addr',
    'cpu',
    tg === 'mem' ? 'ram' : 'in',
    `CPU drives ${hex(r.v, Math.ceil(w / 4))} for ${op} ${tg === 'mem' ? 'memory' : 'I/O'}`,
    1100
  );
  addR('ADDR ' + op, hex(r.v, Math.ceil(w / 4)), '-', 'ADDR');

  const inM = tg === 'mem' && r.v < SZ;
  const selectedText = inM
    ? `RAM cell ${hex(r.v)} currently holds ${hex(mem[r.v])}`
    : tg === 'mem'
      ? 'Valid on the bus, but outside the 256-byte simulated RAM'
      : 'I/O port ' + hex(r.v);

  msg(
    '#a-out',
    'ok',
    `
    <table>
      <tr><th>Binary</th><td class="mono">${bin(r.v, w)}</td></tr>
      <tr><th>Hex / Decimal</th><td class="mono">${hex(r.v, Math.ceil(w / 4))} / ${r.v}</td></tr>
      <tr><th>Addressable locations</th><td>2<sup>${w}</sup> = ${n.toLocaleString()}</td></tr>
      <tr><th>Maximum address</th><td class="mono">${hex(n - 1, Math.ceil(w / 4))}</td></tr>
      <tr><th>Selected</th><td>${selectedText}</td></tr>
    </table>
    <p class="sub" style="margin:10px 0 0">
      <b>Locations vs capacity:</b> the address bus fixes the number of locations (2ⁿ). Capacity = locations × bits stored per location, so 2¹⁶ locations of 1 byte = 64 KB, but of 4 bytes = 256 KB.
    </p>`
  );
}

const SIG = [
  ['MEMR#', 'Memory Read', 1, 'CPU → Memory', 'Asserted (0) to read from memory.', 'cpu', 'ram'],
  ['MEMW#', 'Memory Write', 1, 'CPU → Memory', 'Asserted (0) to store data into memory.', 'cpu', 'ram'],
  ['IOR#', 'I/O Read', 1, 'CPU → I/O', 'Asserted (0) to read from an I/O port.', 'cpu', 'in'],
  ['IOW#', 'I/O Write', 1, 'CPU → I/O', 'Asserted (0) to write to an I/O port.', 'cpu', 'out'],
  ['CLK', 'Clock', 0, 'CPU → all', 'Square wave that synchronises every transfer.', 'cpu', 'ram'],
  ['INTR', 'Interrupt Request', 0, 'I/O → CPU', 'Active-high: a device asks for CPU attention.', 'in', 'cpu'],
  ['INTA#', 'Interrupt Acknowledge', 1, 'CPU → I/O', 'Asserted (0) when the CPU accepts the interrupt.', 'cpu', 'in'],
  ['BR', 'Bus Request', 0, 'Device → CPU', 'Active-high: a device asks to become bus master.', 'in', 'cpu'],
  ['BG', 'Bus Grant', 0, 'CPU → device', 'Active-high: CPU hands the bus over.', 'cpu', 'in']
];

let sg = ld('bas_sig', {});

function pCtrl() {
  const cards = SIG.map(
    (s, i) => `
    <div class="card">
      <div class="sig">
        <div>
          <b class="c-ctrl">${s[0]}</b> · ${s[1]}<br>
          <span class="sub" style="margin:0">${s[3]}</span>
        </div>
        <div
          class="sw ${sg[i] ? 'on' : ''}"
          onclick="tg(${i})"
          role="switch"
          aria-checked="${!!sg[i]}"
          aria-label="${s[1]}"
        ></div>
      </div>
      <p class="sub" style="margin:8px 0 0">${s[4]}</p>
    </div>`
  ).join('');

  return (
    head('Control Bus Simulator', 'Toggle signals and watch the pin level. Polarity differs: # means active-low.') +
    arch() +
    `<div class="grid">${cards}</div>
    <div class="card">
      <h2>Live signal monitor</h2>
      <div id="mon"></div>
    </div>`
  );
}

function mon() {
  const m = $('#mon');
  if (!m) return;

  const rows = SIG.map((s, i) => {
    const a = !!sg[i];
    return `
      <tr>
        <td class="mono">${s[0]}</td>
        <td>${s[2] ? 'active-low' : 'active-high'}</td>
        <td class="${a ? 'c-ctrl' : ''}">${a ? 'ACTIVE' : 'inactive'}</td>
        <td class="mono">${(s[2] ? !a : a) ? 1 : 0}</td>
      </tr>`;
  }).join('');

  m.innerHTML = `
    <table>
      <tr><th>Signal</th><th>Polarity</th><th>State</th><th>Pin level</th></tr>
      ${rows}
    </table>`;
}

function tg(i) {
  sg[i] = !sg[i];
  sv('bas_sig', sg);

  const s = SIG[i];
  const sw = document.querySelectorAll('.sw')[i];
  sw.classList.toggle('on', sg[i]);
  sw.setAttribute('aria-checked', !!sg[i]);

  mon();
  flash('ctrl', s[5], s[6], `${s[0]} ${sg[i] ? 'asserted' : 'released'} (${s[3]})`, 900);
  addR('CTRL SIGNAL', '-', '-', s[0] + (sg[i] ? ' ACTIVE' : ' inactive'));
}

function pComb() {
  return (
    head('Combined Bus Simulator', 'A full CPU–memory transaction using all three buses, step by step.') +
    arch() +
    `
    <div class="card">
      <div class="row">
        ${fld('Mode', sel('c-m', { read: 'Memory READ', write: 'Memory WRITE' }, 'read'))}
        ${fld('Address', `<input id="c-a" value="10" class="mono">`)}
        ${fld('Addr format', sel('c-af', { hex: 'Hex', dec: 'Decimal' }, 'hex'))}
        ${fld('Data (write)', `<input id="c-d" value="7F" class="mono">`)}
        ${fld('Data format', sel('c-df', FM, 'hex'))}
        ${fld('Speed', `<input id="c-s" type="range" min="300" max="2000" step="100" value="1000" style="min-width:120px">`)}
      </div>
      <div class="row" style="margin-top:14px">
        <button class="b pri" onclick="cStart()">Start</button>
        <button class="b" onclick="cPause()">Pause</button>
        <button class="b" onclick="cResume()">Resume</button>
        <button class="b" onclick="cNext()">Next step</button>
        <button class="b" onclick="cReset()">Reset</button>
      </div>
      <div id="c-out"></div>
    </div>
    <div class="card">
      <h2>Timeline</h2>
      <div id="tl" class="tl"><span class="sub">Start or step a transaction to see stages.</span></div>
    </div>`
  );
}

function cBuild() {
  const m = $('#c-m').value;
  const a = parse($('#c-a').value, $('#c-af').value);
  const E = x => {
    msg('#c-out', 'er', x);
    return null;
  };

  if (a.err) return E(a.err);
  if (a.v >= SZ) {
    return E(`Simulated RAM has ${SZ} locations (0x00–0xFF). Address ${a.v} is out of range.`);
  }

  let d = 0;
  if (m === 'write') {
    const r = parse($('#c-d').value, $('#c-df').value);
    if (r.err) return E(r.err);
    if (r.v > 255) {
      return E(`${r.v} needs ${bits(r.v)} bits; the data bus here is 8 bits wide (max 255).`);
    }
    d = r.v;
  }

  const A = a.v;
  const ad = `${hex(A)} (${bin(A, 8)})`;
  const rd = m === 'read';
  const v = mem[A];

  const steps = [
    { b: 'addr', f: 'cpu', t: 'ram', x: `CPU places address ${ad} on the Address Bus` }
  ];

  if (rd) {
    steps.push(
      { b: 'ctrl', f: 'cpu', t: 'ram', x: 'CPU asserts MEMR# (active-low: line driven to 0)' },
      { b: null, f: 'ram', x: `Memory decodes ${hex(A)} and selects cell ${A}` },
      { b: 'data', f: 'ram', t: 'cpu', x: `Memory places ${hex(v)} (${bin(v, 8)}) on the Data Bus` },
      { b: null, f: 'cpu', x: `CPU latches ${hex(v)}. Read complete.`, done: 1 }
    );
  } else {
    steps.push(
      { b: 'data', f: 'cpu', t: 'ram', x: `CPU places data ${hex(d)} (${bin(d, 8)}) on the Data Bus` },
      { b: 'ctrl', f: 'cpu', t: 'ram', x: 'CPU asserts MEMW# (active-low: line driven to 0)' },
      {
        b: null,
        f: 'ram',
        x: `Memory stores ${hex(d)} at ${hex(A)}`,
        run: () => {
          mem[A] = d;
          sv('bas_mem', mem);
        }
      },
      { b: null, f: 'ram', x: 'Write completed successfully.', done: 1 }
    );
  }

  return { steps, i: 0, rd, A, d: rd ? v : d, paused: true, h: null };
}

function tl() {
  const o = $('#tl');
  if (!o || !sim) return;

  o.innerHTML = sim.steps
    .map(
      (s, k) =>
        `<div class="st ${k < sim.i ? 'done' : k === sim.i && !sim.fin ? 'cur' : ''}">${k + 1}. ${s.x}</div>`
    )
    .join('');
}

function cDo() {
  const s = sim.steps[sim.i];
  const ms = +$('#c-s').value;

  s.run && s.run();
  flash(s.b, s.f, s.t, s.x, Math.min(ms, 1200));
  sim.i++;
  tl();

  if (sim.i >= sim.steps.length) {
    sim.fin = 1;
    tl();
    addR(
      sim.rd ? 'MEM READ' : 'MEM WRITE',
      hex(sim.A),
      hex(sim.d),
      sim.rd ? 'ADDR, MEMR#, DATA' : 'ADDR, DATA, MEMW#'
    );
    msg(
      '#c-out',
      'ok',
      `${sim.rd ? 'Read' : 'Write'} complete: address ${hex(sim.A)}, data ${hex(sim.d)}.`
    );
    toast('Transaction complete');
  }
}

function cTick() {
  if (!sim || sim.paused || sim.fin) return;
  cDo();
  if (!sim.fin) {
    sim.h = setTimeout(cTick, +$('#c-s').value);
  }
}

function cStart() {
  cReset();
  sim = cBuild();
  if (!sim) return;
  $('#c-out').className = '';
  sim.paused = false;
  tl();
  cTick();
}

function cPause() {
  if (sim) {
    sim.paused = true;
    clearTimeout(sim.h);
  }
}

function cResume() {
  if (sim && sim.paused && !sim.fin) {
    sim.paused = false;
    cTick();
  }
}

function cNext() {
  if (!sim || sim.fin) {
    cReset();
    sim = cBuild();
    if (!sim) return;
  }
  cPause();
  cDo();
}

function cReset() {
  if (sim) clearTimeout(sim.h);
  sim = null;

  const o = $('#tl');
  if (o) o.innerHTML = '<span class="sub">Start or step a transaction to see stages.</span>';

  const m = $('#c-out');
  if (m) {
    m.className = '';
    m.innerHTML = '';
  }
}

function rtable(r) {
  const rows = r
    .map(
      (x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${x.op}</td>
        <td class="mono">${x.a}</td>
        <td class="mono">${x.d}</td>
        <td>${x.sg}</td>
        <td class="c-data">SUCCESS</td>
        <td>${x.t}</td>
      </tr>`
    )
    .join('');

  return `
    <div class="wrap">
      <table>
        <tr><th>#</th><th>Operation</th><th>Address</th><th>Data</th><th>Signals</th><th>Status</th><th>Time</th></tr>
        ${rows}
      </table>
    </div>`;
}

function pRecent() {
  return (
    head('Recent Transactions', 'The last 50 operations from all simulators, newest first.') +
    `
    <div class="card">
      <div class="row">
        <button class="b" onclick="confirm2(this, () => { recent = []; sv('bas_recent', recent); go('recent'); toast('Transactions cleared'); })">
          Clear transactions
        </button>
      </div>
    </div>
    <div class="card">
      ${recent.length ? rtable(recent) : '<p class="sub">No transactions yet. Run a simulation and it will appear here.</p>'}
    </div>`
  );
}

function pMem() {
  return (
    head('Memory Explorer', 'Live RAM used by every simulator. Edits persist in your browser.') +
    `
    <div class="card">
      <div class="row">
        ${fld('Address (hex)', `<input id="m-a" value="00" class="mono">`)}
        ${fld('Value (hex)', `<input id="m-v" value="00" class="mono">`)}
        <button class="b" onclick="mRead()">Read</button>
        <button class="b pri" onclick="mWrite()">Write</button>
        ${fld('Search address', `<input id="m-s" oninput="mTable()" placeholder="e.g. 3F">`)}
        <button class="b" id="m-r" onclick="confirm2(this, mReset)">Reset memory</button>
      </div>
      <div id="m-out"></div>
    </div>
    <div class="card scroll" id="m-t"></div>`
  );
}

function mTable() {
  const q = ($('#m-s').value || '').trim().toUpperCase();
  const rows = [];

  for (let i = 0; i < SZ; i++) {
    const h = i.toString(16).toUpperCase().padStart(2, '0');
    if (q && !h.includes(q) && String(i) !== q) continue;

    rows.push(`
      <tr style="cursor:pointer" onclick="$('#m-a').value='${h}';$('#m-v').value='${mem[i].toString(16).padStart(2, '0')}'">
        <td class="mono">${hex(i)}</td>
        <td>${i}</td>
        <td class="mono">${hex(mem[i])}</td>
        <td class="mono">${bin(mem[i], 8)}</td>
      </tr>`);
  }

  $('#m-t').innerHTML = `
    <table>
      <tr><th>Address</th><th>Dec</th><th>Hex</th><th>Binary</th></tr>
      ${rows.join('') || '<tr><td colspan="4" class="sub">No matching address.</td></tr>'}
    </table>`;
}

function mAddr() {
  const a = parse($('#m-a').value, 'hex');
  if (a.err || a.v >= SZ) {
    msg('#m-out', 'er', a.err || 'Address must be 00–FF.');
    return null;
  }
  return a.v;
}

function mRead() {
  const a = mAddr();
  if (a === null) return;

  flash('addr', 'cpu', 'ram', '', 500);
  addR('MEM READ', hex(a), hex(mem[a]), 'ADDR, MEMR#, DATA');
  msg('#m-out', 'ok', `Read ${hex(a)} → ${hex(mem[a])} (${bin(mem[a], 8)})`);
}

function mWrite() {
  const a = mAddr();
  if (a === null) return;

  const v = parse($('#m-v').value, 'hex');
  if (v.err || v.v > 255) {
    return msg('#m-out', 'er', v.err || 'Value must fit in 8 bits (00–FF).');
  }

  mem[a] = v.v;
  sv('bas_mem', mem);
  addR('MEM WRITE', hex(a), hex(v.v), 'ADDR, DATA, MEMW#');
  msg('#m-out', 'ok', `Wrote ${hex(v.v)} to ${hex(a)}`);
  mTable();
}

function mReset() {
  mem = initMem();
  sv('bas_mem', mem);
  mTable();
  toast('Memory reset');
}

function pLearn() {
  return (
    head('Learning Centre', 'The three buses at a glance.') +
    `
    <div class="card wrap">
      <table>
        <tr>
          <th>Feature</th>
          <th class="c-data">Data Bus</th>
          <th class="c-addr">Address Bus</th>
          <th class="c-ctrl">Control Bus</th>
        </tr>
        <tr>
          <td>Purpose</td>
          <td>Transfers data</td>
          <td>Identifies locations</td>
          <td>Coordinates operations</td>
        </tr>
        <tr>
          <td>Direction</td>
          <td>Usually bidirectional</td>
          <td>Usually CPU to target</td>
          <td>Depends on signal</td>
        </tr>
        <tr>
          <td>Width</td>
          <td>8/16/32/64 bits</td>
          <td>n lines → 2ⁿ locations</td>
          <td>Multiple single lines</td>
        </tr>
      </table>
    </div>
    <div class="card">
      <h2>Capacity</h2>
      <p>Capacity = 2ⁿ locations × bits per location. A 16-bit address bus with byte-wide memory addresses 65,536 bytes (64 KB). Data bus width only decides how many bits move per transfer; it does not change the number of locations.</p>
      <p>Active-low signals (marked #) are asserted when the line is at 0 V, e.g. MEMR# and MEMW#. Active-high signals such as INTR are asserted at logic 1.</p>
    </div>`
  );
}

const PAGES = {
  dash: ['Dashboard', pDash],
  data: ['Data Bus', pData],
  addr: ['Address Bus', pAddr],
  ctrl: ['Control Bus', pCtrl],
  comb: ['Combined Simulator', pComb],
  mem: ['Memory Explorer', pMem],
  recent: ['Recent Transactions', pRecent],
  learn: ['Learning Centre', pLearn]
};

function go(p) {
  cReset();
  page = p;

  $('#nav').innerHTML =
    '<div class="logo">⚡ BUS SIMULATOR</div>' +
    Object.entries(PAGES)
      .map(([k, v]) => `<button class="${k === p ? 'on' : ''}" onclick="go('${k}')">${v[0]}</button>`)
      .join('');

  $('#main').innerHTML = PAGES[p][1]();
  if (p === 'ctrl') mon();
  if (p === 'mem') mTable();
  scrollTo(0, 0);
}
go('dash');
