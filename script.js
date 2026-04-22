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
