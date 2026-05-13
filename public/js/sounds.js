// ============================================================
// public/js/sounds.js — Sons optionnels via Web Audio API
// ============================================================

const Sounds = (() => {
  let ctx = null;
  let enabled = true;

  // Initialise le contexte audio au premier clic utilisateur
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio non supporté');
    }
  }

  // Joue une tonalité synthétique
  function tone(freq, type = 'sine', duration = 0.15, vol = 0.15, delay = 0) {
    if (!enabled || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  }

  return {
    init,
    setEnabled: (v) => { enabled = v; },
    isEnabled: () => enabled,

    // Son de notification
    notify() {
      tone(880, 'sine', 0.12, 0.12);
      tone(1100, 'sine', 0.1, 0.08, 0.1);
    },

    // Son joueur rejoint
    join() {
      tone(440, 'triangle', 0.1, 0.1);
      tone(660, 'triangle', 0.15, 0.1, 0.08);
    },

    // Démarrage de la partie
    start() {
      [0, 0.1, 0.2, 0.3].forEach((d, i) => {
        tone(330 + i * 110, 'sawtooth', 0.15, 0.12, d);
      });
    },

    // Révélation du rôle
    roleReveal(isImpostor) {
      if (isImpostor) {
        tone(200, 'sawtooth', 0.3, 0.15);
        tone(150, 'square', 0.4, 0.1, 0.25);
      } else {
        tone(440, 'sine', 0.2, 0.12);
        tone(550, 'sine', 0.2, 0.1, 0.15);
        tone(660, 'sine', 0.25, 0.08, 0.3);
      }
    },

    // Vote
    vote() {
      tone(220, 'triangle', 0.1, 0.1);
    },

    // Élimination
    eliminate() {
      tone(180, 'sawtooth', 0.4, 0.15);
      tone(100, 'square', 0.5, 0.1, 0.3);
    },

    // Victoire
    win(team) {
      if (team === 'crewmates') {
        [0, 0.1, 0.2, 0.35, 0.5].forEach((d, i) => {
          const freqs = [330, 440, 550, 660, 880];
          tone(freqs[i], 'sine', 0.3, 0.1, d);
        });
      } else {
        tone(220, 'square', 0.4, 0.15);
        tone(110, 'sawtooth', 0.6, 0.15, 0.3);
      }
    },

    // Timer warning
    tick() {
      tone(660, 'square', 0.05, 0.05);
    },

    // Message chat
    chat() {
      tone(440, 'sine', 0.06, 0.04);
    }
  };
})();
