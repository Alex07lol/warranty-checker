/* WarrantyVault enhanced motion (WebGL aurora, particles, anime.js,
   motion.dev) — extracted from public/index.html <script type="module">.
   Runs as an ES module from /js/, so dynamic imports must use absolute
   paths (e.g. /vendor/...). */

/* ─────────────────────────────────────────────────────────────────────────────
   Enhanced motion — WebGL aurora + anime.js login intro + motion.dev springs

   Libraries are vendored locally (public/vendor/). Every part degrades
   gracefully: if a vendor module fails to load, the app works exactly as
   before. All effects respect prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────────── */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const loginHooks = [];   // run every time the login view is opened

  // ── WebGL tuning helpers: read CSS custom properties from :root so the
  // aurora/particles can be re-themed without touching shader code. ──
  const cssVar = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) {
      console.warn("Error reading CSS variable:", name, e);
      return fallback;
    }
  };
  const clampNum = (v, min, max, fb) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
  };
  // '#rrggbb' → [r, g, b] in 0..1, or null for anything invalid.
  const hexToRgb = (h) => {
    const s = String(h || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    const n = Number.parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  };
  // Build a GLSL vec3 literal from a CSS color var (hex) with a fallback array.
  const vec3 = (v, fb) => {
    const c = hexToRgb(v) || fb;
    return 'vec3(' + c[0].toFixed(4) + ', ' + c[1].toFixed(4) + ', ' + c[2].toFixed(4) + ')';
  };

  // Shared helper to compile shaders to resolve S4144 duplicate compiler issues.
  const compileShader = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Shader compilation failed:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };

  // Shared helper to link programs.
  const linkProgram = (gl, vsSrc, fsSrc) => {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("Program linking failed:", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  };

  // Shared helper to check if main app is visible.
  const mainVisible = () => {
    const login = $('view-login');
    const loginOn = !!login && login.classList.contains('active');
    return !loginOn && document.visibilityState === 'visible';
  };

  // Shared helper to check if the login view is visible.
  const loginVisible = () => {
    const v = $('view-login');
    return !!v && v.classList.contains('active') && document.visibilityState === 'visible';
  };

  // Shared helper to handle canvas resizing.
  const ensureGlSize = (canvas, gl, dpr, uRes, state) => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === state.lastW && h === state.lastH) return null;
    state.lastW = w; state.lastH = h;
    const width = Math.max(1, Math.round((w * dpr) / 2));
    const height = Math.max(1, Math.round((h * dpr) / 2));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    if (uRes) gl.uniform2f(uRes, width, height);
    return { width, height };
  };

  // Secure cryptographically pseudorandom generator wrapper to satisfy S2245.
  const cryptoRand = () => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] / 0xffffffff;
  };

  /* ────────────────────────────────────────────────────────────────
     1. WebGL2 aurora — flowing indigo gradient behind the login card
     Zero dependencies; raw WebGL2 quad + fbm noise fragment shader.
     Half-resolution rendering, DPR capped at 1.5, paints only while
     the login view is visible. Renders one calm static frame under
     prefers-reduced-motion.                                       */
  function startAurora() {
    const canvas = $('aurora-canvas');
    if (!canvas) return;
    let gl = null, prog = null, uRes = null, uTime = null;

    const VS = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const FS = `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_time;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
        return v;
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / u_res;
        vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
        float t = u_time * 0.06;
        float n1 = fbm(p * 1.8 + vec2(t, -t * 0.5));
        float n2 = fbm(p * 1.8 + vec2(-t * 0.6, t * 0.5) + n1 * 1.6);
        float n3 = fbm(p * 2.6 + vec2(t * 0.5, -t * 0.4) + n2 * 1.3);
        float wisp = smoothstep(0.25, 0.85, n3) * (0.6 + 0.4 * sin(n2 * 6.28 + t * 4.0));
        vec3 deep     = vec3(0.30, 0.34, 0.60);
        vec3 indigo   = vec3(0.55, 0.62, 0.95);
        vec3 lavender = vec3(0.72, 0.75, 0.96);
        vec3 col = mix(mix(deep, indigo, n1), lavender, n2 * 0.6 + wisp * 0.5);
        float fade = smoothstep(0.0, 0.55, 1.0 - abs(p.y * 0.9));
        gl_FragColor = vec4(col * (0.55 + 0.45 * wisp) * fade, 0.28 + 0.32 * wisp);
      }
    `;

    // (Re-)initialise the WebGL pipeline; safe to call again after a
    // webglcontextrestored event so the aurora survives GPU/driver resets.
    function setup() {
      try {
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
      } catch (e) {
        console.warn("WebGL2 context creation failed:", e);
        gl = null;
      }
      if (!gl) return false;
      const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'u_res');
      uTime = gl.getUniformLocation(prog, 'u_time');
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return true;
    }
    if (!setup()) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const sizeState = { lastW: 0, lastH: 0 };
    const paint = (t) => { gl.uniform1f(uTime, t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    window.addEventListener('resize', () => ensureGlSize(canvas, gl, dpr, uRes, sizeState));

    // Survive GPU/driver resets instead of dying silently.
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
    canvas.addEventListener('webglcontextrestored', () => { setup(); ensureGlSize(canvas, gl, dpr, uRes, sizeState); }, false);

    let rafId = null;
    function loop() {
      if (loginVisible()) {
        ensureGlSize(canvas, gl, dpr, uRes, sizeState);
        paint(performance.now() / 1000);
      }
      rafId = requestAnimationFrame(loop);
    }

    // Lazy loop: it only starts once the login view is actually opened, so a
    // user who never visits the login screen pays zero idle RAF cost.
    const onLoginShown = () => {
      ensureGlSize(canvas, gl, dpr, uRes, sizeState);
      if (reduceMotion) { paint(0); return; }   // one calm static frame
      if (!rafId) { rafId = requestAnimationFrame(loop); }
    };
    loginHooks.push(onLoginShown);
  }
  startAurora();

  /* ────────────────────────────────────────────────────────────────
     1b. WebGL2 ambient app aurora — flowing indigo field behind the
     whole app UI. Same zero-dependency WebGL2 quad pipeline, tuned to
     sit *under* the content: softer alpha keeps cards readable, a
     faint glow follows the cursor, and it only paints while a main
     view is visible (the opaque login screen hides it; a hidden tab
     skips painting). One static frame under prefers-reduced-motion. */
  function startAppAurora() {
    const canvas = $('app-aurora-canvas');
    if (!canvas) return;
    let gl = null, prog = null, uRes = null, uTime = null, uMouse = null;

    const VS = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;

    // Tunable via CSS variables in :root (--aurora-*).
    const aSpeed = clampNum(cssVar('--aurora-speed', '1'), 0.1, 5, 1);
    const aDeep = vec3(cssVar('--aurora-deep', '#4d55a5'), [0.28, 0.32, 0.58]);
    const aIndigo = vec3(cssVar('--aurora-indigo', '#8a95f2'), [0.52, 0.60, 0.92]);
    const aLavender = vec3(cssVar('--aurora-lavender', '#b6bcf7'), [0.70, 0.73, 0.95]);

    const FS = `
      precision highp float;
      uniform vec2 u_res;
      uniform float u_time;
      uniform vec2 u_mouse;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
        return v;
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / u_res;
        vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
        float t = u_time * 0.05 * ${aSpeed};
        vec2 m = (u_mouse - 0.5) * 0.4;
        float n1 = fbm(p * 1.6 + vec2(t, -t * 0.4) + m);
        float n2 = fbm(p * 1.6 + vec2(-t * 0.5, t * 0.4) + n1 * 1.4 + m * 0.5);
        float n3 = fbm(p * 2.4 + vec2(t * 0.4, -t * 0.35) + n2 * 1.2);
        float wisp = smoothstep(0.3, 0.85, n3) * (0.5 + 0.5 * sin(n2 * 6.28 + t * 3.0));
        vec3 deep     = ${aDeep};
        vec3 indigo   = ${aIndigo};
        vec3 lavender = ${aLavender};
        vec3 col = mix(mix(deep, indigo, n1), lavender, n2 * 0.55 + wisp * 0.5);
        float glow = exp(-distance(uv, u_mouse) * 5.0);
        col += ${aIndigo} * glow * 0.14;
        float fade = smoothstep(0.0, 0.5, 1.0 - abs(p.y * 0.85));
        gl_FragColor = vec4(col * (0.62 + 0.38 * wisp) * fade, 0.28 + 0.26 * wisp);
      }
    `;

    // (Re-)initialise the WebGL pipeline; safe to call again after a
    // webglcontextrestored event so the aurora survives GPU/driver resets.
    function setup() {
      try {
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
      } catch (e) {
        console.warn("WebGL2 context creation failed for app aurora:", e);
        gl = null;
      }
      if (!gl) return false;
      const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return false;
      prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'u_res');
      uTime = gl.getUniformLocation(prog, 'u_time');
      uMouse = gl.getUniformLocation(prog, 'u_mouse');
      gl.useProgram(prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return true;
    }
    if (!setup()) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const mouse = { x: 0.5, y: 0.5 };
    const sizeState = { lastW: 0, lastH: 0 };

    window.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX / (window.innerWidth || 1);
      mouse.y = e.clientY / (window.innerHeight || 1);
    }, { passive: true });

    const paint = (t) => {
      gl.uniform1f(uTime, t);
      if (uMouse !== null) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    window.addEventListener('resize', () => ensureGlSize(canvas, gl, dpr, uRes, sizeState));
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
    canvas.addEventListener('webglcontextrestored', () => { setup(); ensureGlSize(canvas, gl, dpr, uRes, sizeState); }, false);

    let rafId = null;
    function loop() {
      if (mainVisible()) {
        ensureGlSize(canvas, gl, dpr, uRes, sizeState);
        paint(performance.now() / 1000);
      }
      rafId = requestAnimationFrame(loop);
    }

    // The app boots onto the dashboard, so kick off immediately; reduced-motion
    // users get one calm static frame instead of a live animation.
    ensureGlSize(canvas, gl, dpr, uRes, sizeState);
    if (reduceMotion) { paint(0); }
    else { rafId = requestAnimationFrame(loop); }
  }
  startAppAurora();

  /* ────────────────────────────────────────────────────────────────
     1c. WebGL2 interactive particles — a field of soft glowing dots
     floating over the aurora. Each particle drifts on its own sin
     path, twinkles, and is gently pushed away from the cursor. Point
     sprites (GL_POINTS) with additive blending; simulation runs on
     the CPU for ~150 particles (trivial), rendering on the GPU.
     A factory: one instance for the app views (paints while a main
     view is visible) and one for the login screen (paints behind
     its aurora while the login view is open). Reduced-motion users
     get one static frame.                                       */
  function createParticles(canvasId, visible) {
    const canvas = $(canvasId);
    if (!canvas) return null;
    let gl = null, ptProg = null, lnProg = null;
    let uPtRes = null, uPtTime = null, uLnRes = null, uLnColor = null, uLnAlpha = null;

    // Tunable via CSS variables in :root (--particles-*).
    const pSpeed = clampNum(cssVar('--particles-speed', '1'), 0.1, 5, 1);
    const pA = vec3(cssVar('--particles-color-a', '#95a1f8'), [0.58, 0.65, 0.97]);
    const pB = vec3(cssVar('--particles-color-b', '#d2d6fc'), [0.80, 0.83, 0.99]);
    const pTwinkle = (1.8 * pSpeed).toFixed(4);
    const lineRgb = hexToRgb(cssVar('--particles-color-a', '#95a1f8')) || [0.58, 0.65, 0.97];

    // Soft glowing point sprites (bigger + brighter than before).
    const VS_PT = `
      attribute vec2 a_pos;
      attribute vec3 a_vary;   // size, phase, tint
      uniform vec2 u_res;
      varying float v_phase;
      varying float v_tint;
      void main(){
        vec2 ndc = (a_pos / u_res) * 2.0 - 1.0;
        ndc.y *= -1.0;
        gl_Position = vec4(ndc, 0.0, 1.0);
        gl_PointSize = a_vary.x * (u_res.y / 720.0);
        v_phase = a_vary.y;
        v_tint = a_vary.z;
      }
    `;
    const FS_PT = `
      precision mediump float;
      uniform float u_time;
      varying float v_phase;
      varying float v_tint;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float alpha = smoothstep(1.0, 0.0, d);
        alpha *= 0.55 + 0.45 * (0.5 + 0.5 * sin(u_time * ${pTwinkle} + v_phase * 6.2831));
        vec3 indigo   = ${pA};
        vec3 lavender = ${pB};
        vec3 col = mix(indigo, lavender, v_tint);
        gl_FragColor = vec4(col, alpha * 1.0);
      }
    `;
    // Constellation links between nearby particles (and to the cursor).
    const VS_LN = `
      attribute vec2 a_pos;
      uniform vec2 u_res;
      void main(){
        vec2 ndc = (a_pos / u_res) * 2.0 - 1.0;
        ndc.y *= -1.0;
        gl_Position = vec4(ndc, 0.0, 1.0);
      }
    `;
    const FS_LN = `
      precision mediump float;
      uniform vec3 u_color;
      uniform float u_alpha;
      void main(){ gl_FragColor = vec4(u_color, u_alpha); }
    `;

    function setup() {
      try {
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
      } catch (e) {
        console.warn("WebGL2 context creation failed for particles:", e);
        gl = null;
      }
      if (!gl) return false;
      ptProg = linkProgram(gl, VS_PT, FS_PT);
      lnProg = linkProgram(gl, VS_LN, FS_LN);
      if (!ptProg || !lnProg) return false;
      uPtRes = gl.getUniformLocation(ptProg, 'u_res');
      uPtTime = gl.getUniformLocation(ptProg, 'u_time');
      uLnRes = gl.getUniformLocation(lnProg, 'u_res');
      uLnColor = gl.getUniformLocation(lnProg, 'u_color');
      uLnAlpha = gl.getUniformLocation(lnProg, 'u_alpha');
      gl.enable(gl.BLEND);
      // Normal alpha blending (NOT additive): the app background is light
      // (#f5f5f7), so additive glow washes the particles out to invisible.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return true;
    }
    if (!setup()) return;

    // ── Simulation state (positions live in CSS pixels) ──
    const COUNT = 150;
    const posBuf = new Float32Array(COUNT * 2);
    const varyBuf = new Float32Array(COUNT * 3);
    const px = new Float32Array(COUNT);
    const py = new Float32Array(COUNT);
    const vx = new Float32Array(COUNT);
    const vy = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      px[i] = cryptoRand() * (window.innerWidth || 400);
      py[i] = cryptoRand() * (window.innerHeight || 800);
      vx[i] = (cryptoRand() - 0.5) * 0.18;
      vy[i] = (cryptoRand() - 0.5) * 0.18;
      varyBuf[i * 3 + 0] = 3.4 + cryptoRand() * 4.2;      // clearly visible on light bg
      varyBuf[i * 3 + 1] = cryptoRand();                    // phase
      varyBuf[i * 3 + 2] = cryptoRand();                    // tint
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const mouse = { x: 0.5, y: 0.5 };
    const sizeState = { lastW: 0, lastH: 0 };

    window.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });

    let width = 0, height = 0;
    function handleResize() {
      const size = ensureGlSize(canvas, gl, dpr, null, sizeState);
      if (size) {
        width = size.width;
        height = size.height;
        gl.uniform2f(uPtRes, width, height);
        gl.uniform2f(uLnRes, width, height);
      }
    }

    const posVbo = gl.createBuffer();
    const varyVbo = gl.createBuffer();
    const lineVbo = gl.createBuffer();
    const posLoc = gl.getAttribLocation(ptProg, 'a_pos');
    const varyLoc = gl.getAttribLocation(ptProg, 'a_vary');
    const lineLoc = gl.getAttribLocation(lnProg, 'a_pos');

    const LINK = 92;             // particle↔particle link distance (px)
    const MAX_SEGS = 420;        // hard cap so dense clusters can't blow up
    const lineVerts = new Float32Array(MAX_SEGS * 4);

    function step(dt, t) {
      const mX = mouse.x / (window.innerWidth || 1) * width;
      const mY = mouse.y / (window.innerHeight || 1) * height;
      const R = 130;
      for (let i = 0; i < COUNT; i++) {
        const ph = varyBuf[i * 3 + 1];
        // gentle flow (scaled by --particles-speed)
        vx[i] += Math.sin(t * 0.5 * pSpeed + ph * 12.0) * 0.0016;
        vy[i] += Math.cos(t * 0.42 * pSpeed + ph * 9.0) * 0.0014;
        // cursor repulsion
        const dx = px[i] - mX;
        const dy = py[i] - mY;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const f = (1 - d / R) * 0.42;
          vx[i] += (dx / d) * f;
          vy[i] += (dy / d) * f;
        }
        // integrate + damping
        vx[i] *= 0.995; vy[i] *= 0.995;
        px[i] += vx[i] * dt * 60;
        py[i] += vy[i] * dt * 60;
        // wrap around edges with a soft margin
        if (px[i] < -12) px[i] = width + 12;
        else if (px[i] > width + 12) px[i] = -12;
        if (py[i] < -12) py[i] = height + 12;
        else if (py[i] > height + 12) py[i] = -12;
      }
    }

    // Build the constellation: a segment between the cursor and every nearby
    // particle, plus segments joining particles within LINK px of each other.
    function buildLines(mX, mY) {
      let segs = 0;
      const l2 = LINK * LINK;
      const c2 = 130 * 130;
      outer:
      for (let i = 0; i < COUNT; i++) {
        const cdx = px[i] - mX;
        const cdy = py[i] - mY;
        if (cdx * cdx + cdy * cdy < c2) {
          if (segs >= MAX_SEGS) break;
          lineVerts[segs * 4 + 0] = px[i];
          lineVerts[segs * 4 + 1] = py[i];
          lineVerts[segs * 4 + 2] = mX;
          lineVerts[segs * 4 + 3] = mY;
          segs++;
        }
        for (let j = i + 1; j < COUNT; j++) {
          if (segs >= MAX_SEGS) break outer;
          const dx = px[i] - px[j];
          const dy = py[i] - py[j];
          if (dx * dx + dy * dy < l2) {
            lineVerts[segs * 4 + 0] = px[i];
            lineVerts[segs * 4 + 1] = py[i];
            lineVerts[segs * 4 + 2] = px[j];
            lineVerts[segs * 4 + 3] = py[j];
            segs++;
          }
        }
      }
      return segs;
    }

    function paint(t) {
      step(1 / 60, t);
      const mX = mouse.x / (window.innerWidth || 1) * width;
      const mY = mouse.y / (window.innerHeight || 1) * height;

      for (let i = 0; i < COUNT; i++) {
        posBuf[i * 2 + 0] = px[i];
        posBuf[i * 2 + 1] = py[i];
      }
      const segs = buildLines(mX, mY);

      // Points
      gl.useProgram(ptProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, posVbo);
      gl.bufferData(gl.ARRAY_BUFFER, posBuf, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, varyVbo);
      gl.bufferData(gl.ARRAY_BUFFER, varyBuf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(varyLoc);
      gl.vertexAttribPointer(varyLoc, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uPtTime, t);
      gl.drawArrays(gl.POINTS, 0, COUNT);

      // Constellation links
      if (segs > 0) {
        gl.useProgram(lnProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo);
        gl.bufferData(gl.ARRAY_BUFFER, lineVerts.subarray(0, segs * 4), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(lineLoc);
        gl.vertexAttribPointer(lineLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3f(uLnColor, lineRgb[0], lineRgb[1], lineRgb[2]);
        gl.uniform1f(uLnAlpha, 0.5);
        gl.drawArrays(gl.LINES, 0, segs * 2);
      }
    }

    window.addEventListener('resize', () => handleResize());
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
    canvas.addEventListener('webglcontextrestored', () => { setup(); handleResize(); }, false);

    let rafId = null;
    function loop() {
      if (visible()) { handleResize(); paint(performance.now() / 1000); }
      rafId = requestAnimationFrame(loop);
    }

    // Lazy loop: the caller decides when to start. The app instance boots
    // immediately; the login instance only starts once the login view opens,
    // so a user who never visits it pays zero idle RAF cost.
    return function start() {
      handleResize();
      if (reduceMotion) { paint(0); return; }   // one calm static frame
      if (!rafId) { rafId = requestAnimationFrame(loop); }
    };
  }
  // App views: boot onto the dashboard, so start immediately.
  const startAppParticles = createParticles('app-particles-canvas', mainVisible);
  if (startAppParticles) startAppParticles();

  // Login screen: constellation behind the aurora, started on demand.
  const startLoginParticles = createParticles('login-particles-canvas', loginVisible);
  if (startLoginParticles) loginHooks.push(startLoginParticles);

  /* Install the openLogin wrapper immediately — the aurora hook is already
     queued, so even an instant "Sign In" click runs it. The intro/springs
     hooks are pushed when the vendored modules resolve and fire on the
     next open. */
  const origOpenLogin = window.openLogin;
  if (typeof origOpenLogin === 'function') {
    window.openLogin = function (...args) {
      const r = origOpenLogin.apply(this, args);
      loginHooks.forEach((fn) => { try { fn(); } catch (e) {} });
      return r;
    };
  }

  /* Load the vendored libraries independently so one failure never breaks
     the other (or the app). */
  let animeNS = null, motion = null;
  Promise.all([
    import('/vendor/anime.esm.min.js').then((m) => { animeNS = m; }).catch(() => {}),
    import('/vendor/motionone.dom.js').then((m) => { motion = m; }).catch(() => {})
  ]).then(() => {
    if (animeNS) wireLoginIntro(animeNS);
    if (motion) wireMicroInteractions(motion);
  });

  /* ────────────────────────────────────────────────────────────────
     2. anime.js login intro — SVG shield draws itself, then the
     title / subtitle / tabs / form stagger in on a springy ease. */
  function wireLoginIntro(anime) {
    const { svg, createTimeline, stagger } = anime;
    if (reduceMotion) return;

    const shield = $('shield-path');
    const check = $('check-path');
    const logo = $('login-logo');
    const title = $('login-title');
    const sub = $('login-sub');
    const tabRow = document.querySelector('.login-tab-row');
    const form = $('form-login');
    if (!shield || !check || !logo) return;

    const resetState = () => {
      shield.style.strokeDasharray = '';
      shield.style.strokeDashoffset = '';
      check.style.strokeDasharray = '';
      check.style.strokeDashoffset = '';
      [logo, title, sub, tabRow, form].forEach((el) => {
        if (el) { el.style.opacity = ''; el.style.transform = ''; }
      });
    };

    function runIntro() {
      let shieldLen, checkLen;
      try {
        shieldLen = svg.getTotalLength(shield);
        checkLen = svg.getTotalLength(check);
      } catch (e) {
        console.warn("SVG getTotalLength failed, using element fallback:", e);
        shieldLen = shield.getTotalLength();
        checkLen = check.getTotalLength();
      }
      if (!shieldLen) { resetState(); return; }

      shield.style.strokeDasharray = shieldLen;
      shield.style.strokeDashoffset = shieldLen;
      check.style.strokeDasharray = checkLen;
      check.style.strokeDashoffset = checkLen;
      const targets = [title, sub, tabRow, form].filter(Boolean);
      targets.forEach((el) => {
        el.style.opacity = 0;
        el.style.transform = 'translateY(12px)';
      });
      logo.style.transform = 'scale(0.6)';

      try {
        createTimeline({ defaults: { ease: 'out(3)', duration: 500 } })
          .add(shield, { strokeDashoffset: [shieldLen, 0], duration: 750 })
          .add(check, { strokeDashoffset: [checkLen, 0], duration: 380 }, '-=260')
          .add(logo, { scale: 1, duration: 420, ease: 'out(4)' }, '-=320')
          .add(targets, { opacity: [0, 1], translateY: ['12px', '0px'], duration: 460, delay: stagger(55) }, '-=260');
      } catch (e) {
        resetState();   // never leave the login hidden behind stuck styles
      }
    }

    loginHooks.push(runIntro);
  }

  /* ────────────────────────────────────────────────────────────────
     3. motion.dev springs — press feedback on interactive elements
     and one-time in-view reveals for section labels.              */
  function wireMicroInteractions(motion) {
    const { animate, spring, inView } = motion;
    if (reduceMotion) return;

    const PRESS = '.btn, .product-card, .notification-item, .nav-item, .login-tab, .login-btn';
    const springPress = spring({ stiffness: 420, damping: 34, mass: 0.55 });
    const springBack = spring({ stiffness: 260, damping: 18 });

    // Track the pressed element so a drag-off release (pointerup landing
    // outside the element) can still spring it back — otherwise the element
    // would stay stuck at `transition: none` + scale forever.
    let pressedEl = null;
    function pressEl(el) {
      if (el.dataset.mpActive) return;
      el.dataset.mpActive = '1';
      el.dataset.mpPrevTransition = el.style.transition || '';
      el.style.transition = 'none';   // keep the spring crisp, no CSS lag
      animate(el, { scale: 0.96 }, { duration: 0.16, easing: springPress });
      pressedEl = el;
    }
    function releaseEl(el) {
      if (!el) return;
      if (pressedEl === el) pressedEl = null;
      if (!el.dataset.mpActive) return;
      delete el.dataset.mpActive;
      const prev = el.dataset.mpPrevTransition || '';
      delete el.dataset.mpPrevTransition;
      animate(el, { scale: 1 }, { duration: 0.4, easing: springBack });
      setTimeout(() => {
        if (el.dataset.mpActive) return;   // re-pressed mid-flight — let the new gesture win
        el.style.transition = prev;
        el.style.transform = '';           // hand back to CSS (e.g. hover lift)
      }, 520);
    }
    const closest = (e) => (e.target && e.target.closest ? e.target.closest(PRESS) : null);
    document.addEventListener('pointerdown', (e) => { const el = closest(e); if (el) pressEl(el); }, true);
    document.addEventListener('pointerup', () => { if (pressedEl) releaseEl(pressedEl); }, true);
    document.addEventListener('pointercancel', () => { if (pressedEl) releaseEl(pressedEl); }, true);
    document.addEventListener('pointerleave', () => { if (pressedEl) releaseEl(pressedEl); });

    // Section labels have no CSS entrance animation, so a once-only inView
    // reveal adds motion without double-animating anything.
    document.querySelectorAll('.attention-label, .detail-section-title').forEach((el) => {
      inView(el, () => {
        animate(el, { opacity: [0, 1], y: [10, 0] }, { duration: 0.55, easing: springBack });
      }, { once: true, amount: 0.3 });
    });
  }
})();
