// Swish Basket – tangentbindningar som spelaren själv kan ändra (sparas i webbläsaren)
const Controls = (() => {
  const $ = id => document.getElementById(id);
  const KEY = 'geocoolness-keys';
  const ACTIONS = [
    ['up', 'Gå uppåt'], ['down', 'Gå nedåt'], ['left', 'Gå vänster'], ['right', 'Gå höger'],
    ['shoot', 'Skjut (försvar: blocka)'], ['fake', 'Finta (försvar: sno bollen)'], ['pass', 'Passa (2 tillsammans)'],
  ];
  const SETS = [['solo', 'Solo & träning'], ['p1', 'Spelare 1'], ['p2', 'Spelare 2']];
  const DEFAULTS = {
    solo: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Space', fake: 'AltLeft' },
    p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', shoot: 'Space', fake: 'KeyQ', pass: 'KeyE' },
    p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Slash', fake: 'Period', pass: 'ShiftRight' },
  };
  // Ctrl är spärrad: Ctrl+W stänger fliken om någon råkar trycka W samtidigt.
  const RESERVED = ['Escape', 'KeyP', 'KeyM', 'KeyN', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight',
    'ContextMenu', 'F5', 'F11', 'F12'];
  const NAMES = {
    Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'V. Shift', ShiftRight: 'H. Shift', AltLeft: 'V. Alt', AltRight: 'Alt Gr', Enter: 'Enter', NumpadEnter: 'Num Enter',
    Backspace: '⌫', Tab: 'Tab', CapsLock: 'Caps Lock', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
    PageUp: 'Page Up', PageDown: 'Page Down',
  };
  // reserv om webbläsaren inte kan berätta vad som står på tangenten (svensk layout)
  const SE = { Slash: '-', Period: '.', Comma: ',', Minus: '+', Equal: '´', Semicolon: 'Ö', Quote: 'Ä', BracketLeft: 'Å',
    BracketRight: '¨', Backslash: "'", Backquote: '§', IntlBackslash: '<' };

  const storage = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* privat läge */ } },
  };
  const saved = storage.get();
  const binds = {}, labels = Object.assign({}, saved.labels);
  // bara handlingar som finns i DEFAULTS tas med (det gamla superhoppet blev pass-knappen)
  for (const [set] of SETS) {
    const old = Object.assign({}, saved.binds && saved.binds[set]);
    if (old.super && !old.pass) old.pass = old.super;
    binds[set] = {};
    for (const a in DEFAULTS[set]) binds[set][a] = old[a] || DEFAULTS[set][a];
  }
  const save = () => storage.set({ binds, labels });

  let layout = null;
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then(m => { layout = m; changed(); }).catch(() => {});
  }

  function label(code) {
    if (!code) return '–';
    if (NAMES[code]) return NAMES[code];
    if (labels[code]) return labels[code];
    const fromLayout = layout && layout.get(code);
    if (fromLayout) return fromLayout.toUpperCase();
    if (SE[code]) return SE[code];
    let m = code.match(/^Key(.)$/) || code.match(/^Digit(.)$/);
    if (m) return m[1];
    if ((m = code.match(/^Numpad(.+)$/))) return 'Num ' + m[1];
    return code;
  }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kbd = (set, action) => `<kbd>${esc(label(binds[set][action]))}</kbd>`;
  const moveKbds = set => ['up', 'left', 'down', 'right'].map(a => kbd(set, a)).join('');
  const isBound = code => SETS.some(([s]) => Object.values(binds[s]).includes(code));

  const listeners = [];
  function changed() { listeners.forEach(fn => fn()); if (isOpen()) render(); }

  // P1 och P2 spelar samtidigt och får inte dela tangenter. Solo-uppsättningen används aldrig samtidigt med dem.
  const group = set => set === 'solo' ? ['solo'] : ['p1', 'p2'];
  function bind(set, action, code) {
    if (RESERVED.includes(code)) return `${label(code)} är reserverad (P = paus, M = musik, N = ljud, Esc = meny).`;
    const old = binds[set][action];
    let note = '';
    for (const s of group(set)) for (const a in binds[s]) {
      if (binds[s][a] === code && !(s === set && a === action)) {
        binds[s][a] = old;
        note = `${label(code)} användes redan till "${actionName(a)}"${s !== set ? ' för ' + setName(s) : ''} – de bytte plats.`;
      }
    }
    binds[set][action] = code;
    save(); changed();
    return note;
  }
  const actionName = a => ACTIONS.find(x => x[0] === a)[1].replace(/ \(.*/, '').toLowerCase();
  const setName = s => SETS.find(x => x[0] === s)[1];

  // ---------- redigeraren ----------
  let waiting = null, onClose = null;
  const isOpen = () => !$('controls').classList.contains('hidden');

  function render() {
    const t = $('keysTable');
    t.innerHTML = '<tr><th></th>' + SETS.map(([, n]) => `<th>${n}</th>`).join('') + '</tr>';
    for (const [a, name] of ACTIONS) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="act">${name}</td>`;
      for (const [s] of SETS) {
        const td = document.createElement('td');
        if (!(a in binds[s])) { td.textContent = '–'; td.className = 'na'; tr.appendChild(td); continue; }
        const b = document.createElement('button');
        const wait = waiting && waiting.set === s && waiting.action === a;
        b.className = 'keybtn' + (wait ? ' wait' : '');
        b.textContent = wait ? 'Tryck en tangent…' : label(binds[s][a]);
        b.addEventListener('click', e => {
          e.currentTarget.blur();
          waiting = { set: s, action: a };
          setMsg(`Tryck tangenten för "${actionName(a)}" (${setName(s)}). Esc avbryter.`);
          render();
        });
        td.appendChild(b); tr.appendChild(td);
      }
      t.appendChild(tr);
    }
  }
  const setMsg = s => { $('keysMsg').textContent = s; };

  function open(cb) {
    onClose = cb; waiting = null;
    setMsg('Klicka på en knapp och tryck sedan den tangent du vill använda.');
    $('controls').classList.remove('hidden');
    render();
  }
  function close() {
    waiting = null;
    $('controls').classList.add('hidden');
    const cb = onClose; onClose = null;
    if (cb) cb();
  }

  addEventListener('keydown', e => {
    if (!isOpen()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (!waiting) { if (e.code === 'Escape') close(); return; }
    const w = waiting; waiting = null;
    if (e.code === 'Escape') { setMsg('Avbrutet.'); render(); return; }
    if (e.key && e.key.length === 1 && e.key !== ' ') labels[e.code] = e.key.toUpperCase();
    setMsg(bind(w.set, w.action, e.code) || `${actionName(w.action)} (${setName(w.set)}) = ${label(e.code)}`);
    render();
  }, true);
  addEventListener('keyup', e => { if (isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  $('keysDone').addEventListener('click', e => { e.currentTarget.blur(); close(); });
  $('keysReset').addEventListener('click', e => {
    e.currentTarget.blur();
    for (const [s] of SETS) binds[s] = Object.assign({}, DEFAULTS[s]);
    waiting = null; save(); changed();
    setMsg('Standardtangenterna är tillbaka.');
  });

  return {
    get: set => binds[set], label, kbd, moveKbds, isBound, isOpen, open,
    onChange: fn => listeners.push(fn),
  };
})();
