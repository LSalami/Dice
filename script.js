/* ========================================
   DICE ROLLER — Script
   ======================================== */

const FACE_OPTIONS = [4, 6, 8, 10, 12, 20, 100];
const ROLL_DURATION = 700;
const ROLL_INTERVAL = 50;
const LONG_PRESS_MS = 400;

let dice = [];
let nextId = 1;

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
  updateTotal();
}

function removeDie(id) {
  const card = container.querySelector(`[data-id="${id}"]`);
  if (!card) return;

  card.classList.add('exiting');
  card.addEventListener('animationend', () => {
    card.remove();
    dice = dice.filter(d => d.id !== id);
    updateTotal();
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

      valueEl.classList.add('flash');
      valueEl.addEventListener('animationend', () => {
        valueEl.classList.remove('flash');
      }, { once: true });

      rollBtn.disabled = false;
      updateTotal();
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
  card.querySelector('.die-value').textContent = '–';
  card.querySelector('.die-label').textContent = `d${faces}`;
  card.querySelector('.die-face').classList.remove('settled');

  updateTotal();
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

  const popover = document.createElement('div');
  popover.className = 'die-popover open';

  const selector = document.createElement('select');
  selector.className = 'face-selector';
  FACE_OPTIONS.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = `d${f}`;
    if (f === die.faces) opt.selected = true;
    selector.appendChild(opt);
  });
  // Check if current faces is custom
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
      // Replace selector with input inside popover
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
      input.addEventListener('blur', () => {
        setTimeout(confirmCustom, 100);
      });
    } else {
      setFaces(die.id, parseInt(selector.value, 10));
      closePopover();
    }
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'popover-remove-btn';
  removeBtn.textContent = 'Rimuovi dado';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopover();
    removeDie(die.id);
  });

  popover.appendChild(selector);
  popover.appendChild(removeBtn);

  // Stop popover taps from propagating to the card
  popover.addEventListener('click', (e) => e.stopPropagation());
  popover.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

  card.style.position = 'relative';
  card.appendChild(popover);
  activePopover = { element: popover, cardId: die.id };
}

function closePopover() {
  if (activePopover) {
    activePopover.element.remove();
    activePopover = null;
  }
}

// Close popover on tap outside
document.addEventListener('click', (e) => {
  if (activePopover && !e.target.closest('.die-popover')) {
    closePopover();
  }
});

// ---- Mobile Touch Handling ----

function setupMobileTouch(card, die) {
  let pressTimer = null;
  let didLongPress = false;
  let startX = 0;
  let startY = 0;

  card.addEventListener('touchstart', (e) => {
    if (e.target.closest('.die-popover')) return;
    didLongPress = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;

    pressTimer = setTimeout(() => {
      didLongPress = true;
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
      openPopover(card, die);
    }, LONG_PRESS_MS);
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    // Cancel long press if finger moves
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(pressTimer);
    }
  }, { passive: true });

  card.addEventListener('touchend', (e) => {
    clearTimeout(pressTimer);
    if (e.target.closest('.die-popover')) return;

    if (!didLongPress && isMobile()) {
      // Short tap = roll
      closePopover();
      card.classList.add('tapped');
      setTimeout(() => card.classList.remove('tapped'), 200);
      rollDie(die.id);
    }
  });

  // Prevent context menu on long press
  card.addEventListener('contextmenu', (e) => {
    if (isMobile()) e.preventDefault();
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

// ---- Init ----
addDie(6);
