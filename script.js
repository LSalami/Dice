/* ========================================
   DICE ROLLER — Script
   ======================================== */

const FACE_OPTIONS = [4, 6, 8, 10, 12, 20, 100];
const ROLL_DURATION = 700;
const ROLL_INTERVAL = 50;
const STORAGE_KEY = 'dice-roller-state';

let dice = [];
let nextId = 1;

// ---- Persistence ----

function saveState() {
  const state = dice.map(d => ({ faces: d.faces, value: d.value }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return false;
    saved.forEach(({ faces, value }) => {
      const die = { id: nextId++, faces, value: value ?? null, isRolling: false };
      dice.push(die);
      renderDieCard(die);
      if (value !== null && value !== undefined) {
        const card = container.querySelector(`[data-id="${die.id}"]`);
        card.querySelector('.die-value').textContent = value;
        card.querySelector('.die-face').classList.add('settled');
        card.classList.toggle('critical-fail', value === 1);
      }
    });
    updateDiceSize();
    updateTotal();
    return true;
  } catch {
    return false;
  }
}

// ---- Mobile Detection ----
function isMobile() {
  return window.matchMedia('(max-width: 600px)').matches;
}

// ---- DOM References ----
const container = document.getElementById('dice-container');
const totalEl = document.getElementById('total');
const addBtn = document.getElementById('add-die');
const rollAllBtn = document.getElementById('roll-all');

// ---- Die Management ----

function addDie(faces = 6) {
  const die = { id: nextId++, faces, value: null, isRolling: false };
  dice.push(die);
  renderDieCard(die);
  updateDiceSize();
  updateTotal();
  saveState();
}

function removeDie(id) {
  const card = container.querySelector(`[data-id="${id}"]`);
  if (!card) return;

  card.classList.add('exiting');
  card.addEventListener('animationend', () => {
    card.remove();
    dice = dice.filter(d => d.id !== id);
    updateDiceSize();
    updateTotal();
    saveState();
  }, { once: true });
}

function getDie(id) {
  return dice.find(d => d.id === id);
}

// ---- Rolling ----

function rollDie(id) {
  const die = getDie(id);
  if (!die || die.isRolling) return;

  die.isRolling = true;

  const card = container.querySelector(`[data-id="${id}"]`);
  const faceEl = card.querySelector('.die-face');
  const valueEl = card.querySelector('.die-value');
  const rollBtn = card.querySelector('.roll-btn');

  rollBtn.disabled = true;
  card.classList.remove('critical-fail');
  faceEl.classList.remove('settled');
  faceEl.classList.add('rolling');

  let elapsed = 0;
  const timer = setInterval(() => {
    elapsed += ROLL_INTERVAL;
    valueEl.textContent = Math.ceil(Math.random() * die.faces);

    if (elapsed >= ROLL_DURATION) {
      clearInterval(timer);

      const finalValue = Math.ceil(Math.random() * die.faces);
      die.value = finalValue;
      die.isRolling = false;

      valueEl.textContent = finalValue;
      faceEl.classList.remove('rolling');
      faceEl.classList.add('settled');
      card.classList.toggle('critical-fail', finalValue === 1);

      valueEl.classList.add('flash');
      valueEl.addEventListener('animationend', () => {
        valueEl.classList.remove('flash');
      }, { once: true });

      rollBtn.disabled = false;
      updateTotal();
      saveState();
    }
  }, ROLL_INTERVAL);
}

function rollAll() {
  const maxStagger = 2000;
  const stagger = Math.min(100, maxStagger / Math.max(dice.length, 1));

  dice.forEach((die, index) => {
    setTimeout(() => rollDie(die.id), index * stagger);
  });
}

// ---- Dynamic Sizing (mobile) ----

// Lookup table: optimal columns for 1..20 dice, minimising orphaned last-row slots
const OPTIMAL_COLS = [0,1,2,3,2,3,3,4,4,3,5,4,4,5,5,5,4,5,5,5,5];

function optimalColumns(count) {
  return count <= 20 ? OPTIMAL_COLS[count] : 5;
}

function updateDiceSize() {
  if (!isMobile()) return;

  const count = dice.length;
  if (count === 0) return;

  const cols = optimalColumns(count);
  const gap = cols <= 3 ? 14 : cols <= 4 ? 10 : 8;

  // Compute face size from actual available width per column
  const availableWidth = window.innerWidth - 24 - gap * (cols - 1);
  const cardWidth = availableWidth / cols;
  const faceSize = Math.min(90, Math.round(cardWidth * 0.62));
  const fontSize = +(Math.max(1.0, Math.min(2.2, faceSize / 42))).toFixed(1);

  container.style.setProperty('--dice-cols', cols);
  container.style.setProperty('--dice-size', faceSize + 'px');
  container.style.setProperty('--dice-font', fontSize + 'rem');
  container.style.setProperty('--dice-gap', gap + 'px');
}

// ---- Total ----

function updateTotal() {
  const sum = dice.reduce((acc, d) => acc + (d.value || 0), 0);
  totalEl.textContent = sum;

  const display = totalEl.closest('.total-display');
  display.classList.remove('flash');
  void display.offsetWidth; // force reflow
  display.classList.add('flash');
}

// ---- Face Selection ----

function setFaces(id, faces) {
  const die = getDie(id);
  if (!die) return;

  die.faces = faces;
  die.value = null;

  const card = container.querySelector(`[data-id="${id}"]`);
  card.classList.remove('critical-fail');
  card.querySelector('.die-value').textContent = '–';
  card.querySelector('.die-label').textContent = `d${faces}`;
  card.querySelector('.die-face').classList.remove('settled');

  updateTotal();
  saveState();
}

function showCustomInput(card, die) {
  const selector = card.querySelector('.face-selector');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '2';
  input.max = '999';
  input.placeholder = 'Facce...';
  input.className = 'custom-face-input';
  input.value = '';

  selector.style.display = 'none';
  selector.parentNode.insertBefore(input, selector.nextSibling);
  input.focus();

  function confirm() {
    const val = parseInt(input.value, 10);
    if (val >= 2 && val <= 999) {
      setFaces(die.id, val);

      // Update selector: add custom option if needed
      let customOpt = selector.querySelector('option[data-custom]');
      if (!customOpt) {
        customOpt = document.createElement('option');
        customOpt.setAttribute('data-custom', 'true');
        selector.insertBefore(customOpt, selector.querySelector('option[value="custom"]'));
      }
      customOpt.value = val;
      customOpt.textContent = `d${val}`;
      selector.value = val;
    } else {
      // Revert to previous
      selector.value = die.faces;
    }

    input.remove();
    selector.style.display = '';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') {
      selector.value = die.faces;
      input.remove();
      selector.style.display = '';
    }
  });

  input.addEventListener('blur', confirm);
}

// ---- Popover (mobile controls) ----

let activePopover = null;

function openPopover(card, die) {
  closePopover();

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'die-popover-backdrop';
  backdrop.addEventListener('click', closePopover);
  document.body.appendChild(backdrop);

  // Popover
  const popover = document.createElement('div');
  popover.className = 'die-popover open';

  // Title
  const title = document.createElement('div');
  title.className = 'popover-title';
  title.textContent = `d${die.faces}`;
  popover.appendChild(title);

  // Selector
  const selector = document.createElement('select');
  selector.className = 'face-selector';
  FACE_OPTIONS.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = `d${f}`;
    if (f === die.faces) opt.selected = true;
    selector.appendChild(opt);
  });
  if (!FACE_OPTIONS.includes(die.faces)) {
    const customCurrent = document.createElement('option');
    customCurrent.value = die.faces;
    customCurrent.textContent = `d${die.faces}`;
    customCurrent.selected = true;
    customCurrent.setAttribute('data-custom', 'true');
    selector.appendChild(customCurrent);
  }
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Personalizzato...';
  selector.appendChild(customOpt);

  selector.addEventListener('change', () => {
    if (selector.value === 'custom') {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '2';
      input.max = '999';
      input.placeholder = 'Facce...';
      input.className = 'custom-face-input';
      selector.replaceWith(input);
      input.focus();

      function confirmCustom() {
        const val = parseInt(input.value, 10);
        if (val >= 2 && val <= 999) {
          setFaces(die.id, val);
        }
        closePopover();
      }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmCustom();
        if (e.key === 'Escape') closePopover();
      });
      input.addEventListener('blur', () => setTimeout(confirmCustom, 100));
    } else {
      setFaces(die.id, parseInt(selector.value, 10));
      closePopover();
    }
  });

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'popover-remove-btn';
  removeBtn.textContent = 'Rimuovi dado';
  removeBtn.addEventListener('click', () => {
    closePopover();
    removeDie(die.id);
  });

  popover.appendChild(selector);
  popover.appendChild(removeBtn);

  document.body.appendChild(popover);
  activePopover = { popover, backdrop, cardId: die.id };
}

function closePopover() {
  if (activePopover) {
    activePopover.popover.remove();
    activePopover.backdrop.remove();
    activePopover = null;
  }
}

// ---- Mobile Touch Handling ----

function setupMobileTouch(card, die) {
  // Tap on die face = roll
  const faceEl = card.querySelector('.die-face');
  faceEl.addEventListener('click', (e) => {
    if (!isMobile()) return;
    e.stopPropagation();
    closePopover();
    card.classList.add('tapped');
    setTimeout(() => card.classList.remove('tapped'), 200);
    rollDie(die.id);
  });

  // Tap on label = open popover
  const labelEl = card.querySelector('.die-label');
  labelEl.addEventListener('click', (e) => {
    if (!isMobile()) return;
    e.stopPropagation();
    if (activePopover && activePopover.cardId === die.id) {
      closePopover();
    } else {
      openPopover(card, die);
    }
  });
}

// ---- Rendering ----

function renderDieCard(die) {
  const card = document.createElement('div');
  card.className = 'die-card entering';
  card.dataset.id = die.id;

  card.innerHTML = `
    <button class="remove-btn" aria-label="Rimuovi dado">&times;</button>
    <div class="die-face">
      <span class="die-value">–</span>
    </div>
    <div class="die-label">d${die.faces}</div>
    <select class="face-selector">
      ${FACE_OPTIONS.map(f =>
        `<option value="${f}" ${f === die.faces ? 'selected' : ''}>d${f}</option>`
      ).join('')}
      <option value="custom">Personalizzato...</option>
    </select>
    <button class="roll-btn">Lancia</button>
  `;

  // Event: remove (desktop)
  card.querySelector('.remove-btn').addEventListener('click', () => {
    removeDie(die.id);
  });

  // Event: roll single (desktop)
  card.querySelector('.roll-btn').addEventListener('click', () => {
    rollDie(die.id);
  });

  // Event: face selection (desktop)
  const selector = card.querySelector('.face-selector');
  selector.addEventListener('change', () => {
    if (selector.value === 'custom') {
      showCustomInput(card, die);
    } else {
      setFaces(die.id, parseInt(selector.value, 10));
    }
  });

  // Mobile touch events
  setupMobileTouch(card, die);

  // Remove entering animation class after it plays
  card.addEventListener('animationend', (e) => {
    if (e.animationName === 'card-enter') {
      card.classList.remove('entering');
    }
  }, { once: true });

  container.appendChild(card);
}

// ---- Toolbar Events ----

addBtn.addEventListener('click', () => addDie(6));

rollAllBtn.addEventListener('click', rollAll);

// ---- Keyboard shortcut ----
document.addEventListener('keydown', (e) => {
  // Space bar rolls all (when not focused on input/select)
  if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) {
    e.preventDefault();
    rollAll();
  }
});

// ---- Resize handler ----
window.addEventListener('resize', updateDiceSize);

// ---- Init ----
if (!loadState()) addDie(6);

/* ========================================
   MULTIPLAYER MODE
   ======================================== */

const MP_STORAGE_KEY = 'dice-roller-mp';

const mpEls = {
  soloView: document.getElementById('solo-view'),
  roomView: document.getElementById('room-view'),
  modal: document.getElementById('lobby-modal'),
  openBtn: document.getElementById('open-multiplayer'),
  closeBtn: document.getElementById('lobby-close'),
  nameInput: document.getElementById('player-name'),
  facesInput: document.getElementById('lobby-faces'),
  diceInput: document.getElementById('lobby-dice'),
  maxInput: document.getElementById('lobby-max'),
  codeInput: document.getElementById('lobby-code'),
  createBtn: document.getElementById('lobby-create'),
  joinBtn: document.getElementById('lobby-join'),
  errorEl: document.getElementById('lobby-error'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),

  roomTitle: document.getElementById('room-title'),
  roomCode: document.getElementById('room-code-display'),
  roomCodeCopy: document.getElementById('room-code-copy'),
  status: document.getElementById('room-status'),
  myDice: document.getElementById('my-dice'),
  myDiceCount: document.getElementById('my-dice-count'),
  diceMinus: document.getElementById('dice-minus'),
  dicePlus: document.getElementById('dice-plus'),
  diceControls: document.getElementById('dice-controls-buttons'),
  playersList: document.getElementById('players-list'),
  revealSection: document.getElementById('reveal-section'),
  countsGrid: document.getElementById('counts-grid'),
  allDice: document.getElementById('all-dice'),
  readyBtn: document.getElementById('ready-btn'),
  dudoBtn: document.getElementById('dudo-btn'),
  newRoundBtn: document.getElementById('new-round-btn'),
  leaveBtn: document.getElementById('leave-btn'),
  waitingHostBanner: document.getElementById('waiting-host-banner')
};

let socket = null;
let mp = {
  playerId: null,
  name: '',
  code: null,
  state: null,
  myDice: null,
  reveal: null,
  ready: false,
  dudo: false
};

function mpLoad() {
  try {
    const raw = localStorage.getItem(MP_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      mp.playerId = data.playerId || null;
      mp.name = data.name || '';
      mp.code = data.code || null;
    }
  } catch {}
}

function mpPersist() {
  localStorage.setItem(MP_STORAGE_KEY, JSON.stringify({
    playerId: mp.playerId, name: mp.name, code: mp.code
  }));
}

function showError(msg) {
  mpEls.errorEl.textContent = msg || '';
}

function ensureSocket() {
  if (socket) return socket;
  if (typeof io === 'undefined') {
    showError('Server non raggiungibile. Avvia con "npm start".');
    return null;
  }
  const basePath = (document.querySelector('meta[name="base-path"]')?.content || '').replace(/\/$/, '');
  socket = io({ path: (basePath || '') + '/socket.io/' });
  socket.on('connect_error', () => showError('Errore di connessione al server.'));
  socket.on('roomState', (state) => {
    mp.state = state;
    if (state) {
      const me = state.players.find(p => p.id === mp.playerId);
      mp.ready = me ? me.ready : false;
      mp.dudo = me ? me.dudo : false;
    }
    renderRoom();
  });
  socket.on('yourDice', ({ dice }) => {
    mp.myDice = dice;
    mp.reveal = null;
    renderRoom();
  });
  socket.on('revealed', (data) => {
    mp.reveal = data;
    renderRoom();
  });
  return socket;
}

// ---- Modal / lobby ----

function openModal() {
  mpLoad();
  if (mp.name) mpEls.nameInput.value = mp.name;
  showError('');
  mpEls.modal.classList.remove('hidden');
}

function closeModal() {
  mpEls.modal.classList.add('hidden');
}

mpEls.openBtn.addEventListener('click', openModal);
mpEls.closeBtn.addEventListener('click', closeModal);
mpEls.modal.addEventListener('click', (e) => {
  if (e.target === mpEls.modal) closeModal();
});

mpEls.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    mpEls.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    mpEls.tabContents.forEach(c => c.classList.toggle('hidden', c.dataset.tab !== tab));
  });
});

mpEls.createBtn.addEventListener('click', () => {
  const name = mpEls.nameInput.value.trim();
  if (!name) return showError('Inserisci un nome.');
  const sock = ensureSocket();
  if (!sock) return;
  mp.name = name;
  sock.emit('createRoom', {
    name,
    faces: parseInt(mpEls.facesInput.value, 10) || 6,
    diceCount: parseInt(mpEls.diceInput.value, 10) || 5,
    maxPlayers: parseInt(mpEls.maxInput.value, 10) || 6,
    playerId: mp.playerId
  }, (res) => {
    if (!res || !res.ok) return showError(res?.error || 'Errore creazione');
    mp.playerId = res.playerId;
    mp.code = res.code;
    mpPersist();
    closeModal();
    enterRoomView();
  });
});

mpEls.joinBtn.addEventListener('click', () => {
  const name = mpEls.nameInput.value.trim();
  const code = mpEls.codeInput.value.trim().toUpperCase();
  if (!name) return showError('Inserisci un nome.');
  if (!code) return showError('Inserisci il codice.');
  const sock = ensureSocket();
  if (!sock) return;
  mp.name = name;
  sock.emit('joinRoom', { code, name, playerId: mp.playerId }, (res) => {
    if (!res || !res.ok) return showError(res?.error || 'Errore');
    mp.playerId = res.playerId;
    mp.code = res.code;
    mpPersist();
    closeModal();
    enterRoomView();
  });
});

// ---- Room view ----

function enterRoomView() {
  mpEls.soloView.classList.add('hidden');
  mpEls.roomView.classList.remove('hidden');
  mpEls.roomCode.textContent = mp.code;
  mp.myDice = null;
  mp.reveal = null;
  renderRoom();
}

function exitRoomView() {
  mpEls.soloView.classList.remove('hidden');
  mpEls.roomView.classList.add('hidden');
  mp.code = null;
  mp.state = null;
  mp.myDice = null;
  mp.reveal = null;
}

mpEls.leaveBtn.addEventListener('click', () => {
  if (socket) socket.emit('leave');
  mp.code = null;
  mpPersist();
  exitRoomView();
});

mpEls.diceMinus.addEventListener('click', () => {
  const me = mp.state?.players.find(p => p.id === mp.playerId);
  if (!me || !socket) return;
  socket.emit('setDiceCount', Math.max(0, (me.diceCount || 0) - 1));
});

mpEls.dicePlus.addEventListener('click', () => {
  const me = mp.state?.players.find(p => p.id === mp.playerId);
  if (!me || !socket) return;
  socket.emit('setDiceCount', Math.min(10, (me.diceCount || 0) + 1));
});

mpEls.roomCodeCopy.addEventListener('click', async () => {
  if (!mp.code) return;
  try {
    await navigator.clipboard.writeText(mp.code);
    mpEls.roomCodeCopy.textContent = '✓';
    setTimeout(() => { mpEls.roomCodeCopy.textContent = '⧉'; }, 1200);
  } catch {}
});

mpEls.readyBtn.addEventListener('click', () => {
  if (!socket) return;
  socket.emit('setReady', !mp.ready);
});

mpEls.dudoBtn.addEventListener('click', () => {
  if (!socket || mp.dudo) return;
  socket.emit('dudo');
});

mpEls.newRoundBtn.addEventListener('click', () => {
  if (!socket) return;
  socket.emit('newRound');
});

function renderRoom() {
  const state = mp.state;
  if (!state) return;

  const me = state.players.find(p => p.id === mp.playerId);
  const isHost = state.hostId === mp.playerId;
  const myDiceCount = me?.diceCount ?? 0;

  // Status text
  const phaseLabel = {
    lobby: 'In attesa che tutti siano pronti',
    rolled: 'Round in corso — premi Dubito quando vuoi rivelare',
    revealed: 'Round rivelato'
  }[state.phase];
  mpEls.status.textContent = phaseLabel;

  // Dice count + controls (lobby only)
  mpEls.myDiceCount.textContent = myDiceCount;
  mpEls.diceControls.classList.toggle('hidden', state.phase !== 'lobby');

  // Buttons (use inline display to bulletproof against any class race)
  const showReady = state.phase === 'lobby';
  const showDudo = state.phase === 'rolled' && !!mp.myDice?.length;
  const showNewRound = state.phase === 'revealed' && isHost;

  mpEls.readyBtn.style.display = showReady ? '' : 'none';
  mpEls.readyBtn.disabled = myDiceCount === 0;
  mpEls.readyBtn.textContent = mp.ready ? '✓ Pronto' : 'Pronto';
  mpEls.readyBtn.classList.toggle('is-ready', mp.ready);

  mpEls.dudoBtn.style.display = showDudo ? '' : 'none';
  mpEls.dudoBtn.disabled = mp.dudo;
  mpEls.dudoBtn.textContent = mp.dudo ? '✓ Dubito' : 'Dubito';

  mpEls.newRoundBtn.style.display = showNewRound ? '' : 'none';

  // Waiting-for-host banner: revealed phase, non-host
  const showWaitingHost = state.phase === 'revealed' && !isHost;
  mpEls.waitingHostBanner.style.display = showWaitingHost ? '' : 'none';

  // My dice
  renderMyDice(state);

  // Players list
  renderPlayersList(state);

  // Reveal
  if (state.phase === 'revealed' && mp.reveal) {
    mpEls.revealSection.classList.remove('hidden');
    renderReveal(state, mp.reveal);
  } else {
    mpEls.revealSection.classList.add('hidden');
  }
}

function renderMyDice(state) {
  mpEls.myDice.innerHTML = '';
  const me = state.players.find(p => p.id === mp.playerId);
  const targetCount = me?.diceCount ?? 0;

  if (state.phase === 'lobby') {
    if (targetCount === 0) {
      mpEls.myDice.innerHTML = '<div class="empty-hint">Aggiungi i tuoi dadi con +</div>';
      return;
    }
    for (let i = 0; i < targetCount; i++) {
      const card = document.createElement('div');
      card.className = 'die-card mini-card placeholder';
      card.innerHTML = `
        <div class="die-face">
          <span class="die-value">?</span>
        </div>
        <div class="die-label">d${state.faces}</div>
      `;
      mpEls.myDice.appendChild(card);
    }
    return;
  }

  if (!mp.myDice || mp.myDice.length === 0) {
    mpEls.myDice.innerHTML = '<div class="empty-hint">In attesa del prossimo round per partecipare</div>';
    return;
  }
  mp.myDice.forEach(value => {
    const card = document.createElement('div');
    card.className = 'die-card mini-card';
    card.innerHTML = `
      <div class="die-face settled">
        <span class="die-value">${value}</span>
      </div>
      <div class="die-label">d${state.faces}</div>
    `;
    if (value === 1) card.classList.add('critical-fail');
    mpEls.myDice.appendChild(card);
  });
}

function renderPlayersList(state) {
  mpEls.playersList.innerHTML = '';
  state.players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row';
    if (!p.connected) row.classList.add('disconnected');
    if (p.id === mp.playerId) row.classList.add('is-me');
    if (p.id === state.hostId) row.classList.add('is-host');

    let badge = '';
    if (state.phase === 'lobby') {
      if (p.diceCount === 0) {
        badge = '<span class="badge waiting">Spettatore</span>';
      } else {
        badge = p.ready
          ? `<span class="badge ready">Pronto · ${p.diceCount} dadi</span>`
          : `<span class="badge waiting">${p.diceCount} dadi</span>`;
      }
    } else if (state.phase === 'rolled') {
      if (!p.rolledCount) {
        badge = '<span class="badge waiting">Spettatore</span>';
      } else {
        badge = p.dudo ? '<span class="badge dudo">Dubito</span>' : '<span class="badge waiting">…</span>';
      }
    } else if (state.phase === 'revealed') {
      badge = p.rolledCount
        ? `<span class="badge ready">${p.rolledCount} dadi</span>`
        : '<span class="badge waiting">Spettatore</span>';
    }

    row.innerHTML = `
      <span class="player-name">
        ${p.id === state.hostId ? '<span class="crown">♛</span>' : ''}
        ${escapeHtml(p.name)}
        ${p.id === mp.playerId ? '<span class="me-tag">(tu)</span>' : ''}
        ${!p.connected ? '<span class="me-tag">(disconnesso)</span>' : ''}
      </span>
      ${badge}
    `;
    mpEls.playersList.appendChild(row);
  });
}

function renderReveal(state, reveal) {
  // Counts per face: face number (bold) × total (incl. jolly 1s)
  mpEls.countsGrid.innerHTML = '';
  const onesCount = reveal.counts[1] || 0;
  // Compute totals with jolly: face 1 stays as-is, others add the ones
  const totals = {};
  for (let f = 1; f <= reveal.faces; f++) {
    const own = reveal.counts[f] || 0;
    totals[f] = (f === 1) ? own : own + onesCount;
  }
  for (let f = 1; f <= reveal.faces; f++) {
    const own = reveal.counts[f] || 0;
    const total = totals[f];
    const cell = document.createElement('div');
    cell.className = 'count-cell';
    if (f === 1) cell.classList.add('is-jolly');

    const jollySuffix = (f !== 1 && onesCount > 0)
      ? `<span class="count-jolly">(${own}+${onesCount})</span>`
      : '';

    cell.innerHTML = `
      <div class="count-face-box">
        <span class="count-face-num">${f}</span>
      </div>
      <div class="count-sum">
        <span class="count-x">×</span>
        <span class="count-value">${total}</span>
      </div>
      ${jollySuffix}
      <div class="count-label">${f === 1 ? 'jolly' : 'totale'}</div>
    `;
    mpEls.countsGrid.appendChild(cell);
  }

  // All dice per player
  mpEls.allDice.innerHTML = '';
  reveal.allDice.forEach(({ playerId, name, dice }) => {
    const row = document.createElement('div');
    row.className = 'all-dice-row';
    if (playerId === mp.playerId) row.classList.add('is-me');
    const diceHtml = dice.map(v =>
      `<span class="mini-die ${v === 1 ? 'crit' : ''}">${v}</span>`
    ).join('');
    row.innerHTML = `
      <span class="all-dice-name">${escapeHtml(name)}</span>
      <span class="all-dice-values">${diceHtml}</span>
    `;
    mpEls.allDice.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

mpLoad();

// Auto-rejoin on page load if we have a stored room code
function tryAutoRejoin() {
  if (!mp.code || !mp.playerId || typeof io === 'undefined') return;
  const sock = ensureSocket();
  if (!sock) return;
  sock.emit('joinRoom', { code: mp.code, name: mp.name, playerId: mp.playerId }, (res) => {
    if (res?.ok) {
      mp.code = res.code;
      mp.playerId = res.playerId;
      mpPersist();
      enterRoomView();
    } else {
      mp.code = null;
      mpPersist();
    }
  });
}
tryAutoRejoin();
