// this is a pen — 画面の動き(見本の並び・操作パネル・3Dプレビュー・書き出し)
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const Core = window.PenCore;

  // 色: clear は透けるフィラメント(中の替芯が見える)
  const FILAMENTS = [
    { hex: '#A6CB2B', en: 'lime', ja: 'ライムの', name: 'Lime ライム' },
    { hex: '#5C9B34', en: 'leaf green', ja: '若草色の', name: 'Leaf 若草' },
    { hex: '#1F4A2E', en: 'forest green', ja: '深緑の', name: 'Forest 深緑' },
    { hex: '#DCE6E4', en: 'clear', ja: '透明な', name: 'Clear 透明', clear: true },
    { hex: '#C4DF35', en: 'clear lime', ja: '透けるライムの', name: 'Clear Lime 透明ライム', clear: true },
    { hex: '#2E9150', en: 'clear green', ja: '透ける緑の', name: 'Clear Green 透明グリーン', clear: true },
    { hex: '#1E1F1C', en: 'black', ja: '黒い', name: 'Black 黒' },
    { hex: '#F1F1EC', en: 'white', ja: '白い', name: 'White 白' },
    { hex: '#D2392E', en: 'red', ja: '赤い', name: 'Red 赤' },
    { hex: '#2453B8', en: 'blue', ja: '青い', name: 'Blue 青' },
    { hex: '#EE7A2A', en: 'orange', ja: 'オレンジの', name: 'Orange オレンジ' },
    { hex: '#F09CB8', en: 'pink', ja: 'ピンクの', name: 'Pink ピンク' },
  ];

  // 見本: どれも DEFAULTS に上書きする差分だけ
  const BASE = Object.assign({}, Core.DEFAULTS, { polySides: 6, petals: 6, waistPos: 0.5, capStyle: 'slip', noseLen: 14, flat: false, flatDepth: 0.8 });
  const PRESETS = [
    { key: 'stick', name: 'Stick', ja: 'まっすぐ', p: { section: 'round', waists: 0, twist: 0, outerDia: 9, capStyle: 'none', noseLen: 20, color: 7 } },
    { key: 'hex', name: 'Hex', ja: '六角', p: { section: 'poly', polySides: 6, waists: 0, twist: 0, outerDia: 12, capStyle: 'flush', color: 9 } },
    { key: 'twist', name: 'Twist', ja: 'ねじり', p: { section: 'poly', polySides: 4, waists: 0, twist: 1.5, outerDia: 12, color: 5 } },
    { key: 'bamboo', name: 'Bamboo', ja: '竹', p: { section: 'round', waists: 3, waistDepth: 0.6, waistWidth: 0.15, waistPos: 0.5, twist: 0, outerDia: 13, capStyle: 'flush', flat: true, flatDepth: 1.0, color: 2 } },
    { key: 'grip', name: 'Grip', ja: 'にぎり', p: { section: 'poly', polySides: 3, waists: 1, waistDepth: 1.0, waistWidth: 0.5, waistPos: 1, twist: 0, outerDia: 15.5, capStyle: 'none', noseLen: 12, color: 6 } },
    { key: 'flower', name: 'Flower', ja: '花', p: { section: 'petal', petals: 5, petalDepth: 1.0, waists: 2, waistDepth: 1.2, waistWidth: 0.6, waistPos: 0.5, twist: 0.5, outerDia: 14, color: 11 } },
    { key: 'rope', name: 'Rope', ja: 'なわ', p: { section: 'petal', petals: 8, petalDepth: 1.4, waists: 0, twist: 1.25, outerDia: 14, flat: true, flatDepth: 1.2, color: 3 } },
  ];
  const presetParams = (pr) => Object.assign({}, BASE, pr.p);

  const state = presetParams(PRESETS[1]);
  let presetKey = 'hex';
  const SLIDERS = {
    waists: (v) => `${v}`,
    waistDepth: (v) => `${v.toFixed(1)} mm`,
    waistWidth: (v) => `${Math.round(v * 100)}%`,
    waistPos: (v) => (v < 0.35 ? '後ろ' : v > 0.65 ? 'ペン先' : '均等'),
    petals: (v) => `${v}`,
    petalDepth: (v) => `${v.toFixed(2)} mm`,
    twist: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}回`,
    outerDia: (v) => `Ø${v.toFixed(1)}`,
    tipExposed: (v) => `${v.toFixed(1)} mm`,
    clearance: (v) => `${v.toFixed(2)} mm`,
    noseLen: (v) => `${v.toFixed(1)} mm`,
    flatDepth: (v) => `${v.toFixed(1)} mm`,
  };

  function coreParams(s) {
    s = s || state;
    const sides = s.section === 'petal' ? s.petals : s.polySides;
    return Object.assign({}, s, { sides, trial: false });
  }

  // ---- 操作パネル ----
  function sectionKey() { return state.section === 'poly' ? 'poly:' + state.polySides : state.section; }
  function setPressed(box, v) {
    for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  }
  function syncInputs() {
    for (const k of Object.keys(SLIDERS)) { $(k).value = state[k]; $(k + '_o').textContent = SLIDERS[k](state[k]); }
    setPressed($('sectionChips'), sectionKey());
    setPressed($('modelChips'), presetKey || '');
    setPressed($('capChips'), state.capStyle);
    $('flat').checked = state.flat;
    showSectionRows();
    renderSwatches();
    markLineup();
  }
  function showSectionRows() {
    $('petalsRow').hidden = state.section !== 'petal';
    $('petalDepthRow').hidden = state.section !== 'petal';
    $('twistRow').hidden = state.section === 'round';
    $('twistNote').hidden = state.section !== 'round';
    const noWaist = state.waists === 0;
    for (const k of ['waistDepth', 'waistWidth', 'waistPos']) $(k).disabled = noWaist;
    $('flatDepthRow').hidden = !state.flat;
    $('capNote').textContent = { slip: '帯にかぶせる、いちばん丈夫な形。', flush: '軸と同じ太さで段差なし。太さ Ø11.6 以上で面一になります。', none: 'キャップなし。形とくびれをペン先の手前まで付けられます。' }[state.capStyle];
    $('waistNote').hidden = !noWaist;
  }
  function renderSwatches() {
    const box = $('swatches');
    box.textContent = '';
    FILAMENTS.forEach((f, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (f.clear ? ' clear' : '');
      b.style.setProperty('--sw', f.hex);
      b.title = f.name;
      b.setAttribute('aria-label', f.name);
      b.setAttribute('aria-pressed', String(k === state.color));
      b.addEventListener('click', () => { state.color = k; custom(); renderSwatches(); applyColors(); if (current) rebuildScene(); updateSentence(); showModel(); });
      box.appendChild(b);
    });
    $('colorName').textContent = FILAMENTS[state.color].name;
  }
  function custom() {
    if (!presetKey) return;
    presetKey = null;
    setPressed($('modelChips'), '');
    markLineup();
  }
  function showModel() {
    const pr = PRESETS.find((q) => q.key === presetKey);
    $('modelName').textContent = pr ? pr.name : 'Yours';
    $('modelNote').textContent = pr ? `見本「${pr.ja}」` : '見本から変えました';
  }

  for (const k of Object.keys(SLIDERS)) {
    const r = $(k);
    r.addEventListener('input', () => {
      state[k] = Number(r.value);
      $(k + '_o').textContent = SLIDERS[k](state[k]);
      if (k !== 'tipExposed' && k !== 'clearance') custom();
      if (k === 'waists') showSectionRows();
      changed();
    });
  }
  $('sectionChips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const [sec, n] = b.dataset.v.split(':');
    state.section = sec;
    if (n) state.polySides = Number(n);
    setPressed($('sectionChips'), b.dataset.v);
    showSectionRows();
    custom();
    changed();
  });
  $('capChips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.capStyle = b.dataset.v;
    setPressed($('capChips'), state.capStyle);
    showSectionRows();
    custom();
    needFit = true;
    changed();
  });
  $('flat').addEventListener('change', () => { state.flat = $('flat').checked; showSectionRows(); custom(); changed(); });
  $('panel').addEventListener('submit', (e) => e.preventDefault());

  // 見本のボタン(パネル内)
  for (const pr of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = pr.key;
    b.textContent = pr.name;
    b.title = pr.ja;
    b.addEventListener('click', () => usePreset(pr.key));
    $('modelChips').appendChild(b);
  }
  {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'random'; b.className = 'ghost'; b.textContent = 'おまかせ';
    $('modelChips').appendChild(b);
  }
  function usePreset(key, scroll) {
    const pr = PRESETS.find((q) => q.key === key);
    const keep = { tipExposed: state.tipExposed, clearance: state.clearance };
    Object.assign(state, presetParams(pr), keep);
    presetKey = key;
    spinNext = true;
    applyColors();
    syncInputs();
    needFit = true;
    changed();
    if (scroll) $('make').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ---- 見出しと「This is a ___ pen.」 ----
  let current = null;
  function setHeadline(kind) {
    const h = $('headline');
    h.classList.toggle('no', kind === 'no');
    if (kind === 'thinking') h.innerHTML = 'Is this a pen<span class="q">?</span>';
    else if (kind === 'yes') h.textContent = 'This is a pen!';
    else h.textContent = 'No, it isn’t.';
  }
  function describe(s) {
    const en = [], ja = [];
    if (s.outerDia < 10) { en.push('skinny'); ja.push('極細の'); }
    else if (s.outerDia < 12) { en.push('slim'); ja.push('細身の'); }
    else if (s.outerDia > 15) { en.push('chunky'); ja.push('太い'); }
    const w = s.waistDepth > 0.2 ? s.waists : 0;
    if (w === 1 && s.waistPos > 0.7) { en.push('grippy'); ja.push('にぎりの付いた'); }
    else if (w >= 4) { en.push('wiggly'); ja.push('くびれだらけの'); }
    else if (w >= 1) { en.push('curvy'); ja.push('くびれた'); }
    const t = Math.abs(s.twist);
    if (s.section !== 'round') {
      if (t >= 1.5) { en.push('very twisted'); ja.push('ぐるぐるねじれた'); }
      else if (t >= 0.2) { en.push('twisted'); ja.push('ねじれた'); }
    }
    const shapes = { 3: ['triangular', '三角の'], 4: ['square', '四角の'], 6: ['hexagonal', '六角の'], 8: ['octagonal', '八角の'] };
    if (s.section === 'poly' && shapes[s.polySides]) { en.push(shapes[s.polySides][0]); ja.push(shapes[s.polySides][1]); }
    if (s.section === 'petal') { en.push('flower-shaped'); ja.push('花形の'); }
    if (s.flat) { en.push('flat-sided'); ja.push('平らな面のある'); }
    if (!en.length) { en.push('plain'); ja.push('素直な'); }
    const f = FILAMENTS[s.color];
    const words = en.slice(-3).concat([f.en]);
    const art = /^[aeiou]/i.test(words[0]) ? 'an' : 'a';
    return {
      en: `This is ${art} ${words.join(', ').replace(/, (\S+)$/, ' $1')} pen.`,
      ja: `これは${ja.slice(-3).join('、')}、${f.ja}ペンです。`,
    };
  }
  function updateSentence() {
    if (!current) return;
    const L = current.layout;
    if (L.blocking) {
      $('sentence').textContent = 'It is not a pen. It is a tube.';
      $('sentenceJa').textContent = L.issues[0];
      return;
    }
    const d = describe(state);
    $('sentence').textContent = d.en;
    $('sentenceJa').textContent = d.ja;
  }

  // ---- 3D 共通 ----
  function toGeometry(mesh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    return g;
  }
  // スタジオの光: 部屋の映り込み(環境マップ)に、上からのキーライトと後ろからの縁取り
  function addLights(scene, r) {
    const env = !!(THREE.RoomEnvironment && r);
    if (env) {
      const pm = new THREE.PMREMGenerator(r);
      scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7440, env ? 0.35 : 0.8));
    const key = new THREE.DirectionalLight(0xffffff, env ? 0.6 : 0.8); key.position.set(80, 140, 120); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, env ? 0.5 : 0.4); rim.position.set(-120, -40, -80); scene.add(rim);
  }
  // 接地の影: ペンの下にぼかした楕円を敷く
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 32, 4, 128, 32, 128);
    grad.addColorStop(0, 'rgba(27,32,12,.24)'); grad.addColorStop(1, 'rgba(27,32,12,0)');
    g.setTransform(1, 0, 0, 0.25, 0, 24); g.fillStyle = grad; g.fillRect(0, -100, 256, 400);
    return new THREE.CanvasTexture(c);
  })();
  function contactShadow(len, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.1, len * 0.22), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    return m;
  }
  function penMaterial(color) {
    const f = FILAMENTS[color];
    const m = new THREE.MeshPhysicalMaterial({ color: f.hex, roughness: f.clear ? 0.12 : 0.42, metalness: 0, clearcoat: f.clear ? 1 : 0.15, clearcoatRoughness: 0.35, envMapIntensity: f.clear ? 0.6 : 0.3, side: THREE.DoubleSide });
    if (f.clear) { m.transparent = true; m.opacity = 0.65; m.depthWrite = false; }
    return m;
  }
  const inkMat = new THREE.MeshStandardMaterial({ color: 0x2A2E30, roughness: 0.4, transparent: true, opacity: 0.85 });
  const backMat = new THREE.MeshBasicMaterial({ color: 0x1B200C, side: THREE.BackSide });
  const ghostMat = new THREE.MeshStandardMaterial({ color: 0xB9C7D6, roughness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  function refillMesh(p, L, mat) {
    const pts = [new THREE.Vector2(0, 0)];
    for (let x = 0; x <= Core.REFILL.length; x += x < 22 ? 0.2 : 3) pts.push(new THREE.Vector2(Core.refillDiaAt(x) / 2, x));
    pts.push(new THREE.Vector2(0, Core.REFILL.length));
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    // 替芯の先端は軸の z = bodyLen + E。替芯の位置 s は z = bodyLen + E − s
    m.scale.z = -1;
    m.position.z = L.bodyLen + p.tipExposed;
    m.renderOrder = -1;
    return m;
  }
  // 組み立てた姿のペン(軸の z が前向き)。capOn ならキャップを閉じる
  function assemble(b, mat, opts) {
    const L = b.layout;
    const pen = new THREE.Group();
    const geos = {};
    for (const part of b.parts) geos[part.name] = toGeometry(part.mesh);
    pen.add(new THREE.Mesh(geos['pen-body'], mat));
    if (geos['pen-plug']) {
      // 後ろ栓は印刷向きで届くので、180°回して軸の後端に面一で戻す
      const plug = new THREE.Mesh(geos['pen-plug'], mat);
      plug.rotation.x = Math.PI;
      plug.position.z = b.parts.find((q) => q.name === 'pen-plug').mesh.assembled.z;
      pen.add(plug);
    }
    if (geos['pen-cap']) {
      const cap = new THREE.Mesh(geos['pen-cap'], mat);
      cap.position.z = opts.capOn ? L.capZ : L.bodyLen + b.params.tipExposed + 6;
      pen.add(cap);
    }
    if (opts.refill) pen.add(refillMesh(b.params, L, opts.refill));
    // 平らな面(軸の +x 側)を手前の少し上に向ける
    if (b.params.flat) pen.rotation.z = 2.7;
    return pen;
  }
  // 重さと時間の目安: 肉厚 1.2 mm は壁 3 周でほぼ中身が詰まるので、体積 × PLA の比重。
  // 時間は押し出し 5 mm³/s と 1 層あたり 1.5 秒(立てて刷るので層数は軸の長さで決まる)
  function estimate(b) {
    const vol = b.volume || 0;
    const H = b.layout.bodyLen;
    return { g: Math.max(1, Math.round(vol / 1000 * 1.24)), min: Math.round((vol / 5 + (H / 0.2) * 1.5) / 60 / 5) * 5 };
  }
  function disposeTree(o) { o.traverse((c) => c.geometry && c.geometry.dispose()); }

  // ---- 3D プレビュー ----
  const viewer = $('viewer');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.localClippingEnabled = true;
  viewer.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  addLights(scene, renderer);

  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let material = penMaterial(state.color);
  let root = null;
  let view = 'pen';
  let fitSize = new THREE.Vector3(160, 20, 20);
  let needFit = true;
  const VIEW_DIRS = { pen: [0.25, 0.4, 1], cut: [0, 0.08, 1], print: [1, 0.7, 1], real: [0, 0.35, 1] };
  const HINTS = { pen: 'ドラッグで回転・ホイールで拡大', cut: '軸を縦に切った断面。灰色は替芯', print: '3MFはこの向きで並びます(サポート不要)', real: '画面上のおおよその実寸(機種によって少しずれます)' };
  // 実寸: 1 CSS px = 1/96 インチとして、正投影で mm を px に合わせる
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
  const PX_PER_MM = 96 / 25.4;
  function fitOrtho() {
    const w = viewer.clientWidth / PX_PER_MM / 2, h = viewer.clientHeight / PX_PER_MM / 2;
    Object.assign(ortho, { left: -w, right: w, top: h, bottom: -h });
    ortho.position.fromArray(VIEW_DIRS.real).normalize().multiplyScalar(200);
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();
  }
  // 見本を変えた時の、軸まわりにくるっと回って現れる動き
  let spinT = -1;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fitCamera() {
    const d = new THREE.Vector3().fromArray(VIEW_DIRS[view]).normalize();
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const half = Math.max(fitSize.x, fitSize.z) / 2;
    const dist = Math.max(half / Math.tan(hfov / 2), (fitSize.y / 2) / Math.tan(vfov / 2), half * 0.6 / Math.tan(vfov / 2)) * 1.04 + half * 0.22;
    camera.position.copy(d.multiplyScalar(dist));
    controls.target.set(0, 0, 0);
    controls.update();
  }
  function applyColors() {
    material.dispose();
    material = penMaterial(state.color);
  }

  function rebuildScene() {
    if (root) { disposeTree(root); scene.remove(root); }
    root = new THREE.Group();
    const b = current;
    const L = b.layout;
    const cutting = view === 'cut';
    material.clippingPlanes = cutting ? [clip] : [];
    material.side = cutting ? THREE.FrontSide : THREE.DoubleSide;
    backMat.clippingPlanes = [clip];
    material.needsUpdate = true;
    if (view === 'print') {
      // ベッドに立てた向き(3MFと同じ配置)
      const g = new THREE.Group();
      for (const part of b.parts) {
        const m = new THREE.Mesh(toGeometry(part.mesh), material);
        m.position.set(part.place[0], part.place[1], part.place[2]);
        g.add(m);
      }
      g.rotation.x = -Math.PI / 2;
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x1B200C, roughness: 1, transparent: true, opacity: 0.12 }));
      bed.rotation.x = -Math.PI / 2; bed.position.set(10, 0, -10);
      root.add(g, bed);
    } else {
      const clear = FILAMENTS[state.color].clear;
      const pen = assemble(b, material, { capOn: view === 'real', refill: cutting ? ghostMat : clear ? inkMat : null });
      if (cutting) {
        // 切り口から裏面が見えないよう、裏側を濃い色で塗って断面を締める
        const backs = [];
        pen.traverse((o) => { if (o.isMesh && o.material === material) backs.push(o); });
        for (const o of backs) { const m = new THREE.Mesh(o.geometry, backMat); m.position.copy(o.position); m.rotation.copy(o.rotation); m.scale.copy(o.scale); pen.add(m); }
      }
      pen.rotation.y = Math.PI / 2;
      root.add(pen);
    }
    scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    for (const c of root.children) c.position.sub(center);
    fitSize = box.getSize(new THREE.Vector3());
    if (view === 'pen' || view === 'real') root.add(contactShadow(fitSize.x, -fitSize.y / 2 - 3));
    if (needFit) { fitCamera(); fitOrtho(); needFit = false; }
    controls.enabled = view !== 'real';
    const est = estimate(b);
    $('tris').textContent = `約 ${est.g} g · 約 ${est.min} 分(PLA の目安)`;
    $('dims').textContent = `${L.bodyLen.toFixed(1)} × Ø${(L.rMax * 2).toFixed(1)} mm`;
    $('spec').textContent = `軸 ${L.bodyLen.toFixed(1)} mm · 外径 ${(L.rMax * 2).toFixed(1)} mm · 替芯の穴 Ø${L.bore.toFixed(2)} · 栓 P1.5 右ねじ`;
  }

  function setView(v) {
    view = v;
    for (const [id, k] of [['viewPen', 'pen'], ['viewCut', 'cut'], ['viewPrint', 'print'], ['viewReal', 'real']]) $(id).setAttribute('aria-pressed', String(v === k));
    $('hint').textContent = HINTS[v];
    needFit = true;
    if (current) rebuildScene();
  }
  $('viewPen').addEventListener('click', () => setView('pen'));
  $('viewCut').addEventListener('click', () => setView('cut'));
  $('viewPrint').addEventListener('click', () => setView('print'));
  $('viewReal').addEventListener('click', () => setView('real'));

  function resize() {
    const w = viewer.clientWidth, h = viewer.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    fitOrtho();
    if (root) fitCamera();
  }
  new ResizeObserver(resize).observe(viewer);
  resize();
  (function loop(now) {
    if (spinT >= 0 && root) {
      if (spinT === 0) spinT = now || 1;
      const k = Math.min(1, ((now || 0) - spinT) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      root.rotation.x = (1 - e) * -Math.PI;     // ペンの軸(横)まわりに半回転
      root.scale.setScalar(0.94 + 0.06 * e);
      if (k >= 1) spinT = -1;
    }
    controls.update();
    renderer.render(scene, view === 'real' ? ortho : camera);
    requestAnimationFrame(loop);
  })();

  // ---- 見本の並び: 横向きのペンを画像にして積む ----
  const LINE_W = 1600, LINE_H = 160;
  function markLineup() {
    for (const b of document.querySelectorAll('#models .model')) b.setAttribute('aria-current', String(b.dataset.key === presetKey));
  }
  function resetPick() { $('pick').innerHTML = '<b>Pick a pen.</b>押すとその形から作り始めます'; }
  function buildLineup() {
    const list = $('models');
    for (const pr of PRESETS) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'model';
      b.dataset.key = pr.key;
      b.setAttribute('aria-label', `${pr.name}(${pr.ja})で作り始める`);
      const img = document.createElement('img');
      img.alt = '';
      img.width = LINE_W; img.height = LINE_H;
      b.append(img);
      const show = () => { $('pick').innerHTML = '<b></b>'; $('pick').firstChild.textContent = pr.name; $('pick').append(`${pr.ja} — 押すとこの形から作ります`); };
      b.addEventListener('mouseenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('mouseleave', resetPick);
      b.addEventListener('blur', resetPick);
      b.addEventListener('click', () => usePreset(pr.key, true));
      li.appendChild(b);
      list.appendChild(li);
    }
    markLineup();
    // 7本の形はまとめて Worker に頼み、できた順に絵にして並べる
    const imgs = list.querySelectorAll('img');
    list.classList.remove('loading');
    PRESETS.forEach((pr, i) => {
      const s = presetParams(pr);
      buildAsync(coreParams(s)).then((b) => {
        const url = penImage(b, s.color, LINE_W, LINE_H, 160);
        if (url) imgs[i].src = url;
      });
    });
  }

  // 横向きのペンを透明な背景の画像にする(見本の並びとペンの名刺で使う)
  let studio = null;
  function penImage(b, color, w, h, mmW) {
    if (!studio) {
      try {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1);
        const sc = new THREE.Scene();
        addLights(sc, r);
        studio = { r, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500) };
      } catch (e) { return null; }
    }
    const { r, sc, cam } = studio;
    r.setSize(w, h, false);
    const mmH = mmW * h / w;
    Object.assign(cam, { left: -mmW / 2, right: mmW / 2, top: mmH / 2, bottom: -mmH / 2 });
    cam.position.set(0, 0.45, 1).normalize().multiplyScalar(200);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    const mat = penMaterial(color);
    const pen = assemble(b, mat, { capOn: true, refill: FILAMENTS[color].clear ? inkMat : null });
    pen.rotation.y = Math.PI / 2;                // ペン先を右へ
    const g = new THREE.Group();
    g.add(pen);
    const box = new THREE.Box3().setFromObject(g);
    g.position.sub(box.getCenter(new THREE.Vector3()));
    sc.add(g);
    r.render(sc, cam);
    const url = r.domElement.toDataURL('image/png');
    sc.remove(g); disposeTree(g); mat.dispose();
    return url;
  }

  // ---- 形の計算は Worker で(スライダーを動かしても画面が止まらないように) ----
  function plainBuild(b) {
    const layout = Object.assign({}, b.layout); delete layout.sec;
    const volume = b.parts.reduce((s, p) => s + Math.abs(Core.checkManifold(p.mesh).volume), 0);
    const parts = b.parts.map((p) => ({ name: p.name, place: p.place, mesh: { positions: p.mesh.positions, indices: p.mesh.indices, assembled: p.mesh.assembled } }));
    return { params: b.params, layout, parts, volume };
  }
  let worker = null, seq = 0;
  const waiting = new Map();
  try {
    const coreURL = new URL('pen-core.js', location.href).href;
    const src = `importScripts(${JSON.stringify(coreURL)});
      const C = self.PenCore;
      onmessage = (e) => {
        const b = C.build(e.data.params);
        const layout = Object.assign({}, b.layout); delete layout.sec;
        const volume = b.parts.reduce((s, p) => s + Math.abs(C.checkManifold(p.mesh).volume), 0);
        const parts = b.parts.map((p) => ({ name: p.name, place: p.place, mesh: { positions: p.mesh.positions, indices: p.mesh.indices, assembled: p.mesh.assembled } }));
        const tr = []; for (const p of parts) tr.push(p.mesh.positions.buffer, p.mesh.indices.buffer);
        postMessage({ id: e.data.id, build: { params: b.params, layout, parts, volume } }, tr);
      };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => { const f = waiting.get(e.data.id); if (f) { waiting.delete(e.data.id); f(e.data.build); } };
    worker.onerror = () => { worker = null; for (const [id, f] of waiting) { waiting.delete(id); f(null); } };
  } catch (e) { worker = null; }
  function buildAsync(params) {
    if (!worker) return Promise.resolve(plainBuild(Core.build(params)));
    const id = ++seq;
    return new Promise((res) => {
      const t = setTimeout(() => { if (waiting.delete(id)) { worker = null; res(plainBuild(Core.build(params))); } }, 4000);
      waiting.set(id, (b) => { clearTimeout(t); res(b || plainBuild(Core.build(params))); });
      worker.postMessage({ id, params });
    });
  }

  // ---- 作り直し ----
  let timer = 0, latest = 0, spinNext = false;
  function changed() {
    setHeadline('thinking');
    $('sentence').textContent = 'Hmm… let me see.';
    $('sentenceJa').textContent = 'ペン軸を作っています';
    $('status').textContent = '';
    showModel();
    clearTimeout(timer);
    timer = setTimeout(rebuild, worker ? 60 : 200);
  }
  async function rebuild() {
    const ticket = ++latest;
    const b = await buildAsync(coreParams());
    if (ticket !== latest) return;               // 計算中に次の変更が来たら古い結果は捨てる
    current = b;
    const L = current.layout;
    rebuildScene();
    if (spinNext && !reduceMotion && view !== 'print') spinT = 0;
    spinNext = false;
    setHeadline(L.blocking ? 'no' : 'yes');
    $('export').disabled = L.blocking;
    $('exportTrial').disabled = L.blocking;
    $('card').disabled = L.blocking;
    $('exportMeta').textContent = current.parts.map((p) => ({ 'pen-body': '軸', 'pen-cap': 'キャップ', 'pen-plug': '栓' })[p.name]).join(' + ') + (window.claude && typeof window.claude.use === 'function' ? '(zip)' : '');
    updateSentence();
    const s = $('status');
    s.className = 'status' + (L.blocking ? ' warn' : L.issues.length ? ' fix' : '');
    s.textContent = L.issues.length ? (L.blocking ? '' : 'ペンにはなっています。') + L.issues.join('。') + '。' : '';
    writeHash();
  }

  // ---- URL に形を残す(共有用) ----
  const HASH_KEYS = { sec: 'section', ps: 'polySides', pe: 'petals', pd: 'petalDepth', w: 'waists', wd: 'waistDepth', ww: 'waistWidth', wp: 'waistPos', tw: 'twist', od: 'outerDia', nl: 'noseLen', fd: 'flatDepth', c: 'color', e: 'tipExposed', cl: 'clearance' };
  function writeHash() {
    const q = new URLSearchParams();
    if (presetKey) q.set('m', presetKey);
    for (const [k, f] of Object.entries(HASH_KEYS)) q.set(k, String(state[f]));
    q.set('cs', state.capStyle);
    if (state.flat) q.set('fl', '1');
    try { history.replaceState(null, '', '#' + q.toString()); } catch (e) { /* 埋め込み先で使えない時はそのまま */ }
  }
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.has('od')) return false;
    for (const [k, f] of Object.entries(HASH_KEYS)) {
      if (!q.has(k)) continue;
      const v = q.get(k);
      state[f] = f === 'section' ? v : Number(v);
    }
    if (!['round', 'poly', 'petal'].includes(state.section)) state.section = 'round';
    state.color = Math.max(0, Math.min(FILAMENTS.length - 1, Math.round(state.color) || 0));
    state.capStyle = ['slip', 'flush', 'none'].includes(q.get('cs')) ? q.get('cs') : 'slip';
    state.flat = q.get('fl') === '1';
    presetKey = PRESETS.some((p) => p.key === q.get('m')) ? q.get('m') : null;
    return true;
  }
  $('share').addEventListener('click', async () => {
    writeHash();
    const s = $('status');
    try { await navigator.clipboard.writeText(location.href); s.className = 'status'; s.textContent = 'リンクをコピーしました。開くとこのペンから始まります。'; }
    catch (e) { s.className = 'status'; s.textContent = location.href; }
  });

  // ---- おまかせ ----
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  const r2 = (v, q) => Math.round(v / q) * q;
  $('random').addEventListener('click', () => {
    const sec = pick(['round', 'poly', 'poly', 'poly', 'petal', 'petal']);
    state.section = sec;
    state.polySides = pick([3, 4, 6, 6, 8]);
    state.petals = pick([3, 4, 5, 6, 8, 10, 12]);
    state.petalDepth = r2(0.6 + Math.random() * 1.4, 0.05);
    state.outerDia = r2(11.5 + Math.random() * 4, 0.1);
    state.waists = pick([0, 1, 1, 2, 2, 3, 4, 6]);
    state.waistDepth = r2(0.5 + Math.random() * 1.5, 0.05);
    state.waistWidth = r2(0.3 + Math.random() * 0.6, 0.05);
    state.waistPos = pick([0, 0.5, 0.5, 0.5, 1]);
    state.twist = sec === 'round' ? 0 : r2(Math.random() * 4 - 2, 0.25);
    state.color = Math.floor(Math.random() * FILAMENTS.length);
    presetKey = null;
    spinNext = true;
    applyColors();
    syncInputs();
    changed();
  });

  // ---- 書き出し ----
  async function save(bytes, name) {
    // claude.ai の中では downloads 機能を使う(3mf は直接保存できないので zip に包む)
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads');
      if (dl) {
        const wrapped = await Core.zip([{ name, data: bytes }]);
        const zipName = name.replace(/\.3mf$/, '.zip');
        await dl.save({ filename: zipName, data: new Blob([wrapped]) });
        return `${zipName}（中に 3MF が入っています）`;
      }
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'model/3mf' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
  }
  // ---- ペンの名刺: 広告のような 1 枚絵 ----
  async function makeCard() {
    const W = 1600, H = 1000;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await Promise.all(['400 120px "Instrument Serif"', 'italic 400 40px "Instrument Serif"', '400 20px "IBM Plex Mono"'].map((f) => document.fonts.load(f))); } catch (e) { /* 代わりの書体で描く */ }
    const serif = '"Instrument Serif", "Times New Roman", serif';
    g.fillStyle = '#D8E021'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1B200C';
    g.font = `400 40px ${serif}`; g.textBaseline = 'top';
    g.fillText('this is a pen.', 64, 56);
    // ペンは右へはみ出させる
    const img = new Image();
    img.src = penImage(current, state.color, 1800, 260, 180);
    await img.decode();
    g.drawImage(img, 60, 250, 1800, 260);
    const d = describe(state);
    g.textBaseline = 'alphabetic';
    g.font = `400 150px ${serif}`;
    g.fillText('This is a pen.', 56, 760);
    g.font = `italic 400 44px ${serif}`;
    wrapText(g, d.en.replace(/^This is /, '— '), 64, 840, 1000, 52);
    g.font = '400 18px "IBM Plex Mono", ui-monospace, monospace';
    const L = current.layout;
    const lines = [`Ø${(L.rMax * 2).toFixed(1)} × ${L.bodyLen.toFixed(0)} mm`, `${FILAMENTS[state.color].name.split(' ')[0]} · ${PRESETS.find((p) => p.key === presetKey)?.name || 'Yours'}`, 'MUJI gel refill Ø6.2'];
    g.textAlign = 'right';
    lines.forEach((t, k) => g.fillText(t, W - 64, H - 64 - (lines.length - 1 - k) * 28));
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  function wrapText(g, text, x, y, maxW, lh) {
    let line = '';
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    g.fillText(line, x, y);
  }
  $('card').addEventListener('click', async () => {
    if (!current || current.layout.blocking) return;
    const s = $('status');
    s.className = 'status'; s.textContent = '名刺を描いています…';
    try {
      const blob = await makeCard();
      const name = fileBase() + '-card.png';
      if (window.claude && typeof window.claude.use === 'function') {
        const dl = await window.claude.use('downloads');
        if (dl) { await dl.save({ filename: name, data: blob }); s.textContent = `${name} を保存しました。`; return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      s.textContent = `${name} を保存しました。`;
    } catch (e) {
      s.className = 'status warn';
      s.textContent = e && e.code === 'declined' ? '保存をやめました。' : `保存できませんでした（${(e && (e.message || e.code)) || e}）。`;
    }
  });

  function fileBase() { return 'this-is-a-pen' + (presetKey ? '-' + presetKey : ''); }
  async function exportBuild(b, name, done) {
    const s = $('status');
    s.className = 'status';
    s.textContent = '3MFを作っています…';
    try {
      const bytes = await Core.export3MF(b);
      const saved = await save(bytes, name);
      s.className = 'status';
      s.innerHTML = '';
      s.append(`${done} ${saved} を保存しました。スライサーで開き、PLA・0.2 mm・壁3周・サポートなしで刷ってください。組み立ては `);
      const a = document.createElement('a'); a.href = '#how'; a.textContent = 'こちら'; s.append(a, '。');
    } catch (e) {
      s.className = 'status warn';
      s.textContent = e && e.code === 'declined' ? '保存をやめました。' : `保存できませんでした（${(e && (e.message || e.code)) || e}）。`;
    }
  }
  $('export').addEventListener('click', () => { if (current) exportBuild(current, fileBase() + '.3mf', 'Yes, it is!'); });
  $('exportTrial').addEventListener('click', () => {
    if (!current) return;
    const b = Core.build(Object.assign(coreParams(), { trial: true }));
    exportBuild(b, fileBase() + '-tip-test.3mf', 'Almost a pen.');
  });

  if (readHash()) applyColors();
  syncInputs();
  changed();
  setTimeout(buildLineup, 60);
})();
