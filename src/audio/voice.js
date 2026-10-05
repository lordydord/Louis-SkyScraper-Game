// A friendly spoken voice (the iPad's built-in speech, works offline).
// Used for heights ("500 metres!"), passing famous buildings, and planets.

export class Voice {
  constructor(store, audio) {
    this.store = store;
    this.audio = audio;
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.unlocked = false;
    this._last = '';
    this._lastAt = 0;
    if (this.synth) {
      this._pick();
      this.synth.addEventListener?.('voiceschanged', () => this._pick());
    }
  }

  get on() {
    return this.store.setting('voice') !== false && this.store.setting('sound') !== false;
  }

  _pick() {
    const voices = this.synth.getVoices();
    if (!voices.length) return;
    const gb = voices.filter((v) => /en[-_]GB/i.test(v.lang));
    const preferred = ['Daniel', 'Kate', 'Serena', 'Arthur', 'Martha', 'Stephanie', 'Google UK English Female'];
    this.voice =
      preferred.map((n) => gb.find((v) => v.name.includes(n))).find(Boolean) ||
      gb[0] ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0];
  }

  // iOS only speaks after a tap has started speech once.
  unlock() {
    if (!this.synth || this.unlocked) return;
    this.unlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    this.synth.speak(u);
  }

  // Say something. `important` interrupts whatever is being said.
  say(text, { important = false } = {}) {
    if (!this.synth || !this.on || !text) return;
    const now = performance.now();
    if (text === this._last && now - this._lastAt < 4000) return;
    this._last = text;
    this._lastAt = now;
    if (important) this.synth.cancel();
    else if (this.synth.speaking && this.synth.pending) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang || 'en-GB';
    u.rate = 0.95;
    u.pitch = 1.1;
    u.volume = 1;
    this.synth.speak(u);
    if (this.audio) this.audio.duck(Math.min(6, 1 + text.length / 14));
  }

  stop() {
    this.synth?.cancel();
  }
}
