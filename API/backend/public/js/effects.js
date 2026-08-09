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
     1c. Interactive constellation particles — a field of soft glowing
     dots drifting over the app. Pure Canvas-2D (no WebGL2 required),
     so it renders identically in every browser and device. Each
     particle drifts on its own sin path, twinkles, and is gently
     pushed away from the cursor; nearby particles and the cursor are
     joined by constellation lines. A factory: one instance for the
     app views (paints while a main view is visible) and one for the
     login screen (paints behind its aurora while the login view is
     open). Reduced-motion users get one static frame.            */
  function createParticles(canvasId, visible) {
    const canvas = $(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Tunable via CSS variables in :root (--particles-*).
    const pSpeed = clampNum(cssVar('--particles-speed', '1'), 0.1, 5, 1);
    const colA = hexToRgb(cssVar('--particles-color-a', '#7c88ea')) || [0.49, 0.53, 0.92];
    const colB = hexToRgb(cssVar('--particles-color-b', '#b9bff5')) || [0.73, 0.75, 0.96];
    const lineRgb = colA;

    // ── Simulation state (positions live in CSS px) ──
    const COUNT = 160;
    const px = new Float32Array(COUNT);
    const py = new Float32Array(COUNT);
    const vx = new Float32Array(COUNT);
    const vy = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);   // twinkle / drift phase
    const tint = new Float32Array(COUNT);    // color mix 0..1
    const size = new Float32Array(COUNT);    // core radius (CSS px)
    for (let i = 0; i < COUNT; i++) {
      px[i] = cryptoRand() * (window.innerWidth || 400);
      py[i] = cryptoRand() * (window.innerHeight || 800);
      vx[i] = (cryptoRand() - 0.5) * 0.18;
      vy[i] = (cryptoRand() - 0.5) * 0.18;
      phase[i] = cryptoRand() * 6.2831;
      tint[i] = cryptoRand();
      size[i] = 1.3 + cryptoRand() * 1.9;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: 0.5, y: 0.5 };
    let width = 0, height = 0;   // device px
    let cssW = 0, cssH = 0;      // css px

    function handleResize() {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      if (w === cssW && h === cssH) return;
      cssW = w; cssH = h;
      width = Math.max(1, Math.round(w * dpr));
      height = Math.max(1, Math.round(h * dpr));
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // draw in CSS px
    }

    window.addEventListener('pointermove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });

    const R = 130;              // cursor repulsion radius (px)
    const LINK = 92;            // particle↔particle link distance (px)
    const MAX_SEGS = 420;       // hard cap so dense clusters can't blow up
    const segsArr = new Float32Array(MAX_SEGS * 4);

    function step(dt, t) {
      for (let i = 0; i < COUNT; i++) {
        const ph = phase[i];
        // gentle flow (scaled by --particles-speed)
        vx[i] += Math.sin(t * 0.5 * pSpeed + ph * 2.0) * 0.0016;
        vy[i] += Math.cos(t * 0.42 * pSpeed + ph * 1.5) * 0.0014;
        // cursor repulsion
        const dx = px[i] - mouse.x;
        const dy = py[i] - mouse.y;
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
        if (px[i] < -12) px[i] = cssW + 12;
        else if (px[i] > cssW + 12) px[i] = -12;
        if (py[i] < -12) py[i] = cssH + 12;
        else if (py[i] > cssH + 12) py[i] = -12;
      }
    }

    // Build the constellation: a segment between the cursor and every nearby
    // particle, plus segments joining particles within LINK px of each other.
    function buildLines() {
      let segs = 0;
      const l2 = LINK * LINK;
      const c2 = R * R;
      outer:
      for (let i = 0; i < COUNT; i++) {
        const cdx = px[i] - mouse.x;
        const cdy = py[i] - mouse.y;
        if (cdx * cdx + cdy * cdy < c2) {
          if (segs >= MAX_SEGS) break;
          segsArr[segs * 4 + 0] = px[i];
          segsArr[segs * 4 + 1] = py[i];
          segsArr[segs * 4 + 2] = mouse.x;
          segsArr[segs * 4 + 3] = mouse.y;
          segs++;
        }
        for (let j = i + 1; j < COUNT; j++) {
          if (segs >= MAX_SEGS) break outer;
          const dx = px[i] - px[j];
          const dy = py[i] - py[j];
          if (dx * dx + dy * dy < l2) {
            segsArr[segs * 4 + 0] = px[i];
            segsArr[segs * 4 + 1] = py[i];
            segsArr[segs * 4 + 2] = px[j];
            segsArr[segs * 4 + 3] = py[j];
            segs++;
          }
        }
      }
      return segs;
    }

    function paint(t) {
      step(1 / 60, t);
      const segs = buildLines();

      ctx.clearRect(0, 0, cssW, cssH);

      // Constellation links
      if (segs > 0) {
        ctx.lineWidth = 1;
        ctx.strokeStyle =
          'rgba(' + (lineRgb[0] * 255 | 0) + ',' + (lineRgb[1] * 255 | 0) + ',' +
          (lineRgb[2] * 255 | 0) + ',0.5)';
        ctx.beginPath();
        for (let s = 0; s < segs; s++) {
          ctx.moveTo(segsArr[s * 4 + 0], segsArr[s * 4 + 1]);
          ctx.lineTo(segsArr[s * 4 + 2], segsArr[s * 4 + 3]);
        }
        ctx.stroke();
      }

      // Glowing dots (soft halo + bright core), twinkling over time.
      for (let i = 0; i < COUNT; i++) {
        const tw = 0.6 + 0.4 * Math.sin(t * 1.8 * pSpeed + phase[i]);
        const a = 0.35 + 0.65 * tw;                    // alpha 0.35..1
        const r = size[i];
        const rr = colA[0] + (colB[0] - colA[0]) * tint[i];
        const gg = colA[1] + (colB[1] - colA[1]) * tint[i];
        const bb = colA[2] + (colB[2] - colA[2]) * tint[i];
        const rgb =
          'rgba(' + (rr * 255 | 0) + ',' + (gg * 255 | 0) + ',' + (bb * 255 | 0) + ',';
        // soft halo
        const halo = ctx.createRadialGradient(px[i], py[i], 0, px[i], py[i], r * 3.2);
        halo.addColorStop(0, rgb + (a * 0.4).toFixed(3) + ')');
        halo.addColorStop(1, rgb + '0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px[i], py[i], r * 3.2, 0, 6.2832);
        ctx.fill();
        // bright core
        ctx.fillStyle = rgb + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px[i], py[i], r, 0, 6.2832);
        ctx.fill();
      }
    }

    window.addEventListener('resize', handleResize);

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
