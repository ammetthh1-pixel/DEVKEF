/* ══════════════════════════════════════════════════════════
   DEVKËF — Calculatrice cliquable (composant partagé)
   Le DESIGN est identique pour Python et C.
   Seule la fonction "computeFn" qui pilote le calcul change :
   c'est le code écrit par l'étudiant (Python réel via Pyodide,
   ou C interprété par notre mini-interpréteur) qui la pilote.
══════════════════════════════════════════════════════════ */

function initCalculator(container, computeFn) {
  container.innerHTML = `
    <div class="dk-calc">
      <div class="dk-calc-screen">
        <div class="dk-calc-expr" id="dk-calc-expr">&nbsp;</div>
        <div class="dk-calc-display" id="dk-calc-display">0</div>
      </div>
      <div class="dk-calc-grid">
        <button class="dk-key dk-key-fn" data-k="C">C</button>
        <button class="dk-key dk-key-fn" data-k="⌫">⌫</button>
        <button class="dk-key dk-key-fn" data-k="%">%</button>
        <button class="dk-key dk-key-op" data-k="/">÷</button>

        <button class="dk-key" data-k="7">7</button>
        <button class="dk-key" data-k="8">8</button>
        <button class="dk-key" data-k="9">9</button>
        <button class="dk-key dk-key-op" data-k="*">×</button>

        <button class="dk-key" data-k="4">4</button>
        <button class="dk-key" data-k="5">5</button>
        <button class="dk-key" data-k="6">6</button>
        <button class="dk-key dk-key-op" data-k="-">−</button>

        <button class="dk-key" data-k="1">1</button>
        <button class="dk-key" data-k="2">2</button>
        <button class="dk-key" data-k="3">3</button>
        <button class="dk-key dk-key-op" data-k="+">+</button>

        <button class="dk-key dk-key-wide" data-k="0">0</button>
        <button class="dk-key" data-k=".">.</button>
        <button class="dk-key dk-key-eq" data-k="=">=</button>
      </div>
      <div class="dk-calc-status" id="dk-calc-status">Prête — pilotée par ton code</div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .dk-calc{width:100%;max-width:280px;margin:0 auto;background:#161d2e;border:1px solid #243450;border-radius:16px;padding:14px;font-family:'Space Grotesk',sans-serif}
    .dk-calc-screen{background:#0A0E1A;border-radius:10px;padding:14px 12px;margin-bottom:12px;text-align:right;min-height:64px}
    .dk-calc-expr{font-family:'Fira Code',monospace;font-size:.75rem;color:#7A8BAD;min-height:16px;overflow-wrap:break-word}
    .dk-calc-display{font-size:1.7rem;font-weight:700;color:#F0F4FF;overflow-wrap:break-word}
    .dk-calc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .dk-key{background:#1C2333;border:1px solid #243450;color:#F0F4FF;border-radius:10px;padding:12px 0;font-size:1rem;font-weight:600;cursor:pointer;font-family:inherit}
    .dk-key:hover{background:#243450}
    .dk-key:active{transform:scale(.96)}
    .dk-key-fn{color:#FF6B35;background:rgba(255,107,53,.1);border-color:rgba(255,107,53,.25)}
    .dk-key-op{color:#FF6B35;background:rgba(255,107,53,.06)}
    .dk-key-eq{background:#FF6B35;border-color:#FF6B35;color:#0A0E1A;grid-column:span 1}
    .dk-key-eq:hover{background:#ff7d4d}
    .dk-key-wide{grid-column:span 2}
    .dk-calc-status{margin-top:10px;text-align:center;font-family:'Fira Code',monospace;font-size:.68rem;color:#4A5C78}
    .dk-calc-status.err{color:#FF4757}
    .dk-calc-status.ok{color:#00C896}
  `;
  container.appendChild(style);

  let a = null, op = null, current = '0', freshEntry = true;
  const exprEl = container.querySelector('#dk-calc-expr');
  const dispEl = container.querySelector('#dk-calc-display');
  const statusEl = container.querySelector('#dk-calc-status');

  function paint() {
    dispEl.textContent = current;
    exprEl.textContent = (a !== null && op) ? `${a} ${op}` : '\u00A0';
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'dk-calc-status' + (kind ? ' ' + kind : '');
  }

  async function pressEquals() {
    if (a === null || !op) return;
    const b = parseFloat(current);
    setStatus('Exécution de ton code…');
    try {
      const result = await computeFn(a, op, b);
      if (result === null || result === undefined || Number.isNaN(result)) {
        current = 'Erreur';
        setStatus('Ton code n\u2019a rien retourné pour ce cas.', 'err');
      } else {
        current = String(result);
        setStatus('✓ Calculé par ton code', 'ok');
      }
    } catch (e) {
      current = 'Erreur';
      setStatus('Erreur dans ton code : ' + e.message, 'err');
    }
    a = null; op = null; freshEntry = true;
    paint();
  }

  container.querySelectorAll('.dk-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.k;
      if (k >= '0' && k <= '9') {
        current = (freshEntry || current === '0') ? k : current + k;
        freshEntry = false;
      } else if (k === '.') {
        if (!current.includes('.')) current += '.';
        freshEntry = false;
      } else if (k === 'C') {
        a = null; op = null; current = '0'; freshEntry = true;
        setStatus('Prête — pilotée par ton code');
      } else if (k === '⌫') {
        current = current.length > 1 ? current.slice(0, -1) : '0';
      } else if (['+', '-', '*', '/'].includes(k)) {
        a = parseFloat(current);
        op = k;
        current = '0';
        freshEntry = true;
      } else if (k === '=') {
        pressEquals();
        return;
      }
      paint();
    });
  });

  paint();
}
