// this is a pen — 形状エンジン
// ペン軸・後ろ栓・キャップを回転体として作り、くびれとねじれを付けて3MFに書き出す。
// ブラウザでは window.PenCore、Node では module.exports として使う。
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  // 無印良品 ゲルインキ替芯の形(陽介さんが実物から作った STEP「muji_44872666」から読んだ値)。
  // 位置はペン先(ボール)を 0 とした軸方向の距離、径は直径。すべて mm
  const REFILL = {
    length: 111.0,         // 全長
    dia: 6.2,              // 本体の筒
    metalEnd: 8.4,         // 金属の口金が終わる位置(ここで Ø2.25 → Ø3.0 の段差)
    resinFrom: 3.0,        // 樹脂の先端の径(位置 8.4)
    resinTo: 3.7,          // 樹脂の先端の径(位置 19.9)
    face: 19.9,            // 前向きの平らな段差(Ø3.7 → Ø5.2)
    faceOuter: 5.2,
    fillet: 0.5,           // 段差から筒へつながる角丸(位置 19.9〜20.4)
    rearHole: 3.0,         // 後端のインク室の開口(ここから空気が入る)
  };
  // 替芯の外径(位置 s での直径)
  function refillDiaAt(s) {
    if (s <= 3.0) return 0.26 + (2.25 - 0.26) * clamp(s / 3.0, 0, 1);
    if (s <= REFILL.metalEnd) return 2.25;
    if (s <= REFILL.face) return REFILL.resinFrom + (REFILL.resinTo - REFILL.resinFrom) * (s - REFILL.metalEnd) / (REFILL.face - REFILL.metalEnd);
    if (s <= REFILL.face + REFILL.fillet) {
      const a = Math.acos(clamp((REFILL.face + REFILL.fillet - s) / REFILL.fillet, -1, 1));
      return REFILL.faceOuter + 2 * REFILL.fillet * Math.sin(a);
    }
    return REFILL.dia;
  }

  const DEFAULTS = {
    tipExposed: 4,         // 替芯が軸から出る長さ(無印良品の製品と同じくらい。金属の口金の先だけが出る)
    clearance: 0.3,        // 替芯と内径のすき間(直径で)
    trial: false,          // 試し刷り(口金から座までの 30mm だけ)

    outerDia: 13.5,        // いちばん太いところの外径
    wall: 1.2,             // 最小肉厚
    section: 'poly',       // round / poly / petal
    sides: 6,              // 多角形の角数、または花びらの枚数
    petalDepth: 1.2,       // 花びらの切れ込みの深さ
    twist: 1,              // 軸全体でのねじれ回数(負で逆向き)
    waists: 2,             // くびれの数
    waistDepth: 1.5,       // くびれの深さ(半径で)
    waistWidth: 0.6,       // くびれの幅(くびれどうしの間隔に対する割合)
    waistPos: 0.5,         // くびれの位置(0 = 後ろ寄り、0.5 = まんべんなく、1 = 前寄り)

    capStyle: 'slip',      // キャップ: slip = 帯にかぶせる / flush = 軸と面一 / none = なし
    noseLen: 14,           // ペン先の先細りの長さ
    flat: false,           // 1面だけ平らにして転がりを止める
    flatDepth: 0.8,        // 平らな面の削り量(いちばん太い所から)
    withCap: true,         // 古い指定(false ならキャップなし)
    withPlug: true,
  };

  const BAND_LEN = 8;      // キャップがはまる丸い帯
  const REAR_LEN = 7;      // 後ろ端の丸い帯(中にねじがある)
  const FADE = 6;          // 丸い帯から形が立ち上がる長さ
  const PLUG_DEPTH = 6;    // 後ろ栓が差し込まれる深さ
  const PLUG_GAP = 0.2;    // 後ろ栓の先と替芯の後端のすき間(替芯の長さのばらつき分)
  // 後ろ栓のねじ(軸の後端と面一、コインで回す)。右ねじ、ピッチ 1.5、山の高さ 0.6(フランク 45°で立てて印刷できる)
  const TH_P = 1.5;
  const TH_H = 0.6;
  const TH_RMIN = 3.6;     // めねじの内径側(替芯 Ø6.2 が通る)
  const TH_RMAX = TH_RMIN + TH_H; // めねじの谷 = Ø8.4
  const TH_CLR = 0.25;     // おねじとめねじのすき間(半径で)
  const SLOT_W = 2.0;      // コインのスリット幅(1円〜500円玉の厚み 1.5〜2.0 に合わせる)
  const SLOT_D = 1.6;      // スリットの深さ
  const SLOT_L = 2.6;      // スリットの半分の長さ(端は丸く閉じる)
  const EXIT_FIT = 0.4;    // 口金の穴と替芯のすき間(直径で)
  const VENT = 0.75;       // 後ろ栓とキャップの通気穴の半径
  const SEAT_ANGLE = 45;   // 替芯の角丸を受ける座の角度(立てて印刷してもサポート不要)
  const TRIAL_LEN = 30;    // 試し刷りの長さ
  const CAP_FIT = 0.15;    // キャップ内径と帯のすき間(半径で)
  const CAP_WALL = 1.6;
  const FLUSH_WALL = 1.2;  // 面一キャップの肉厚(軸の段差に収める)
  const DZ = 0.5;          // 軸方向の刻み
  const NOSE_WALL = 1.0;   // 口金まわりの最小肉厚

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  // 平らな面(x = d の平面)で外側を切る。th は世界座標での角度なので、ねじれても面は軸に平行
  function flatCut(r, th, d) {
    if (!d) return r;
    const c = Math.cos(th);
    return c > 1e-6 && r * c > d ? d / c : r;
  }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function frac(x) { return x - Math.floor(x); }

  // 断面の形。φ は断面の向き(ねじれの分だけ回した角度)、戻り値は外径に対する倍率で最大 1。
  // 多角形は平らな面と角の差を 1.25 倍までに抑えて角を丸める(三角形が尖りすぎないように)
  function sectionFn(p, rMax) {
    const n = p.sides;
    if (p.section === 'poly') {
      const k = Math.min(1, Math.log(1.25) / Math.log(1 / Math.cos(Math.PI / n)));
      const peak = Math.pow(1 / Math.cos(Math.PI / n), k);
      const seg = TAU / n;
      const f = (phi) => {
        const a = ((phi % seg) + seg) % seg - seg / 2;
        return Math.pow(1 / Math.cos(a), k) / peak;
      };
      return { f, min: 1 / peak };
    }
    if (p.section === 'petal') {
      const d = clamp(p.petalDepth / rMax, 0, 0.45);
      return { f: (phi) => 1 - d * (0.5 - 0.5 * Math.cos(n * phi)), min: 1 - d };
    }
    return { f: () => 1, min: 1 };
  }

  function normalize(p) {
    const q = Object.assign({}, DEFAULTS, p || {});
    if (!['round', 'poly', 'petal'].includes(q.section)) q.section = 'round';
    q.sides = Math.round(clamp(q.sides, 3, q.section === 'petal' ? 12 : 8));
    q.waists = Math.round(clamp(q.waists, 0, 8));
    q.waistWidth = clamp(q.waistWidth, 0.1, 1);
    q.waistPos = clamp(Number.isFinite(q.waistPos) ? q.waistPos : 0.5, 0, 1);
    q.waistDepth = Math.max(0, q.waistDepth);
    if (!['slip', 'flush', 'none'].includes(q.capStyle)) q.capStyle = 'slip';
    if (p && p.withCap === false && !p.capStyle) q.capStyle = 'none';
    q.withCap = q.capStyle !== 'none';
    q.noseLen = clamp(Number.isFinite(q.noseLen) ? q.noseLen : 14, 8, 24);
    return q;
  }

  // 寸法を決める。ここで内径・肉厚の矛盾も調べる
  function layout(p) {
    const bore = REFILL.dia + p.clearance;
    const rIn = bore / 2;
    const rMin = rIn + p.wall;
    const rMax = Math.max(p.outerDia / 2, rMin + 0.05);
    const sec = sectionFn(p, rMax);
    // 丸い帯の自然な太さ(断面の内接円)。後ろ端はねじの谷の外に肉厚を残す
    const rNat = clamp(rMax * sec.min, rMin + 0.05, rMax);
    const rRear = Math.max(rNat, TH_RMAX + p.wall);
    const rBand = rRear;
    const bodyLen = REFILL.length - p.tipExposed + PLUG_DEPTH;
    const holeR = (refillDiaAt(p.tipExposed) + EXIT_FIT) / 2;
    const noseR = holeR + NOSE_WALL;
    // キャップの形式で、口金側の帯とキャップの寸法が変わる
    let rFront = rNat, rFrontBase = rNat, rCapIn = 0, rCapOut = 0, bandLen = BAND_LEN, capGap = 1;
    if (p.capStyle === 'slip') {
      rCapIn = rFront + CAP_FIT; rCapOut = rCapIn + CAP_WALL;
    } else if (p.capStyle === 'flush') {
      // 軸の形は rCapOut の丸に収まって終わり、そこから一段細い帯にキャップがはまる
      rCapOut = Math.max(rNat, rMin + CAP_FIT + FLUSH_WALL);
      rCapIn = rCapOut - FLUSH_WALL; rFront = rCapIn - CAP_FIT; rFrontBase = rCapOut; capGap = 0;
    } else {
      bandLen = 0;
    }
    // ペン先の先細りは急すぎると立てて刷った時に垂れるので、勾配を抑える
    const noseMin = Math.ceil(1.7 * (rFront - noseR));
    const noseLen = Math.max(p.noseLen, noseMin);
    const zoneStart = REAR_LEN;
    const zoneEnd = bodyLen - noseLen - bandLen;
    const noseStart = zoneEnd + bandLen;
    const capZ = zoneEnd + capGap;
    const flatD = p.flat ? Math.max(rMin, rMax - p.flatDepth) : 0;
    const flatRear = p.flat ? Math.max(flatD, TH_RMAX + p.wall) : 0;
    const flatCap = p.flat && rCapIn ? Math.max(flatD, rCapIn + 1.3) : 0;
    const issues = [];
    if (p.tipExposed < 3) issues.push('ペン先の出る長さが短すぎて、ボールの手前の円すいが軸に当たります（3 mm 以上にしてください）');
    if (p.tipExposed > 18) issues.push('ペン先が出すぎて、替芯を受ける段差が軸の外に出ます（18 mm 以下にしてください）');
    if (zoneEnd - zoneStart < 2 * FADE + 5) issues.push('軸が短すぎて、形を付ける場所がありません');
    const blocking = issues.length > 0;
    if (p.outerDia / 2 < rMin + 0.05) issues.push(`外径が細いので、肉厚を確保するため Ø${(rMax * 2).toFixed(1)} にしました`);
    else if ((rMax - (p.waists > 0 ? p.waistDepth : 0)) * sec.min < rMin - 1e-6) issues.push('くびれが深いので、肉厚が足りない所は少し太らせています');
    if (noseLen > p.noseLen) issues.push(`先細りが急なので、サポートなしで刷れる ${noseLen} mm にしました`);
    if (rRear > rMax + 0.05) issues.push(`後ろ端は栓のねじのため Ø${(rRear * 2).toFixed(1)} あります`);
    if (p.capStyle === 'flush' && rCapOut > rMax + 0.05) issues.push(`面一キャップは Ø${(rCapOut * 2).toFixed(1)} 以上になります`);
    return { bore, rIn, rMin, rMax, rBand, r0: rBand, rRear, rFront, rFrontBase, rCapIn, rCapOut, flatD, flatRear, flatCap, bandLen, noseLen, noseStart, capZ, bodyLen, holeR, noseR, zoneStart, zoneEnd, sec, issues, blocking };
  }

  // 回転体メッシュ。profile は (r, z) の閉じた輪郭で、各点の kind で形の付け方を決める。
  // twist(z) は円周方向の格子をずらす角度で、断面の角と頂点の列をそろえるのに使う。
  function revolve(profile, N, shapeFn, twist) {
    const pos = [];
    const rings = [];
    for (const pt of profile) {
      if (pt.r <= 1e-9) {
        rings.push({ pole: pos.length / 3 });
        pos.push(0, 0, pt.z);
        continue;
      }
      const start = pos.length / 3;
      const off = twist(pt.z);
      for (let j = 0; j < N; j++) {
        const th = TAU * j / N + off;
        const v = shapeFn(pt, th);
        const r = typeof v === 'number' ? v : v.r;
        const z = typeof v === 'number' ? pt.z : v.z;
        pos.push(r * Math.cos(th), r * Math.sin(th), z);
      }
      rings.push({ start });
    }
    const idx = [];
    const M = rings.length;
    for (let i = 0; i < M; i++) {
      const a = rings[i], b = rings[(i + 1) % M];
      for (let j = 0; j < N; j++) {
        const j1 = (j + 1) % N;
        if (a.pole !== undefined && b.pole !== undefined) continue;
        if (a.pole !== undefined) { idx.push(a.pole, b.start + j, b.start + j1); continue; }
        if (b.pole !== undefined) { idx.push(a.start + j, b.pole, a.start + j1); continue; }
        idx.push(a.start + j, b.start + j, b.start + j1);
        idx.push(a.start + j, b.start + j1, a.start + j1);
      }
    }
    const mesh = { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
    if (signedVolume(mesh) < 0) flip(mesh);
    return mesh;
  }

  function signedVolume(m) {
    const P = m.positions, I = m.indices;
    let v = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
         - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
         + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    }
    return v / 6;
  }

  function flip(m) {
    const I = m.indices;
    for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  }

  function zSteps(z0, z1, step) {
    const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(z0 + (z1 - z0) * i / n);
    return out;
  }

  // 円周の分割数。断面の対称数×4 の倍数にして、角や花びらの先が頂点の列に乗るようにする
  function ringCount(p) {
    const unit = (p.section === 'round' ? 1 : p.sides) * 4;
    return Math.max(unit, Math.round(168 / unit) * unit);
  }

  // くびれ: 区間 [0,1] に等間隔で n 個のくぼみ(0〜1)
  function waistFn(p) {
    const n = p.waists;
    if (!n || p.waistDepth <= 0) return () => 0;
    const half = p.waistWidth / n; // くぼみの片側の幅(区間に対して)
    // 位置 0 = 後ろ寄り、0.5 = まんべんなく、1 = 前(グリップ)寄り。区間を t^k でゆがめて並べる
    const k = Math.pow(2, (p.waistPos - 0.5) * 4);
    return (t0) => {
      const t = Math.pow(clamp(t0, 0, 1), k);
      let w = 0;
      for (let k = 0; k < n; k++) {
        const x = (t - (k + 0.5) / n) / half;
        if (Math.abs(x) < 1) w = Math.max(w, 0.5 + 0.5 * Math.cos(Math.PI * x));
      }
      return w;
    };
  }

  // 形の付いた区間の表面。twist(z) は格子をずらす角度で、断面の角と頂点の列をそろえる
  function makeSurface(p, L, z0, z1, opts) {
    const len = Math.max(1e-6, z1 - z0);
    const t = (z) => clamp((z - z0) / len, 0, 1);
    const fade = (z) => smooth((z - z0) / FADE) * smooth((z1 - z) / FADE);
    const turns = opts.turns;
    const twist = (z) => -TAU * turns * t(z);
    const waist = opts.waists ? waistFn(p) : () => 0;
    const sec = L.sec;
    function outerR(z, th) {
      const phi = th + TAU * turns * t(z);
      const f = fade(z);
      const shaped = opts.radius(sec.f(phi), waist(t(z)));
      const base = typeof opts.base === 'function' ? opts.base(z) : opts.base;
      return Math.max(opts.floor, base + (shaped - base) * f);
    }
    return { twist, outerR };
  }

  // ねじ山の形(0 = めねじの山 / おねじの谷、1 = めねじの谷 / おねじの山)。台形で、斜面は 45°
  function threadW(th, z) {
    const u = frac(z / TH_P - th / TAU);
    if (u < 0.4) return u / 0.4;
    if (u < 0.5) return 1;
    if (u < 0.9) return 1 - (u - 0.5) / 0.4;
    return 0;
  }

  // 軸の z(後端 0、口金 H)を替芯の位置 s(ペン先 0)に直す
  function REFILL_POS(p, H, z) { return p.tipExposed + (H - z); }

  // 軸の内側の半径(替芯の位置 s で)。
  // 口金の穴 1mm → 替芯の樹脂部に沿って Ø4.4 まで広がる → 45°の座で替芯の角丸を受ける → 内径
  function innerRadius(p, L, s) {
    const E = p.tipExposed;
    const passR = 2.2;                               // 座の手前の通り道(替芯の段差 Ø3.7 より太く、Ø5.2 より細い)
    const t = Math.tan(SEAT_ANGLE * Math.PI / 180);
    // 座は替芯の角丸の 45°の点(r = 2.6 + 0.5 sin45°, s = 20.4 − 0.5 cos45°)を通る
    const cr = REFILL.faceOuter / 2 + REFILL.fillet * Math.SQRT1_2;
    const cs = REFILL.face + REFILL.fillet - REFILL.fillet * Math.SQRT1_2;
    const seat = (x) => cr + (x - cs) * t;
    const sPass = cs - (cr - passR) / t;             // 座が始まる位置
    if (s <= E + 1.0) return L.holeR;
    // 穴の奥は 45°で広げ、替芯(金属の口金・樹脂の先)とは必ず 0.15mm 以上すき間を空ける
    if (s < sPass) return Math.min(passR, Math.max(L.holeR + (s - E - 1.0), refillDiaAt(s) / 2 + 0.15));
    return Math.min(L.rIn, seat(s));
  }

  function buildBody(p, L, opts) {
    opts = opts || {};
    const N = ringCount(p);
    const S = makeSurface(p, L, L.zoneStart, L.zoneEnd, {
      turns: p.twist,
      waists: true,
      base: (z) => (z < (L.zoneStart + L.zoneEnd) / 2 ? L.rRear : L.rFrontBase),
      floor: L.rMin,
      radius: (s, w) => (L.rMax - p.waistDepth * w) * s,
    });
    const H = L.bodyLen;
    const bandTop = L.noseStart;
    const prof = [];
    const innerR = (z) => innerRadius(p, L, REFILL_POS(p, H, z));
    // 外側: 後ろ端から口金へ。試し刷りは口金から TRIAL_LEN だけ
    const zBase = opts.trial ? Math.max(0, H - TRIAL_LEN) : 0;
    const ch = 0.4;
    const r0 = zBase < L.zoneStart ? L.rRear : L.rFront;
    prof.push({ r: r0 - ch, z: zBase, kind: 'plain' });
    for (const z of zSteps(zBase + ch, H - 0.6, DZ)) {
      let r = z < L.zoneStart ? L.rRear : L.rFront, kind = 'plain';
      if (z >= L.zoneStart && z <= L.zoneEnd) kind = 'shaped';
      else if (z > bandTop) {
        const s = smooth((z - bandTop) / (H - bandTop));
        r = L.rFront + (L.noseR - L.rFront) * (0.15 * s + 0.85 * Math.sin(s * Math.PI / 2) ** 1.6);
        r = Math.max(r, innerR(z) + NOSE_WALL);
      }
      if (kind === 'plain') r = Math.max(r, innerR(z) + (z > bandTop ? NOSE_WALL : p.wall));
      prof.push({ r, z, kind, outer: true });
    }
    prof.push({ r: L.noseR - 0.3, z: H, kind: 'plain' });
    // 内側: 口金から座の先までは細かく、その後ろはまっすぐなので粗く
    const zSeat = Math.max(zBase, H - (REFILL.face + 2 - p.tipExposed));
    const thTop = PLUG_DEPTH + 0.4;                  // めねじはおねじより少し奥まで
    const zBore = opts.trial ? zBase : thTop + 0.3;
    const inner = zSteps(H, zSeat, 0.1).concat(zSteps(zSeat, zBore, DZ).slice(1));
    for (const z of inner) prof.push({ r: innerR(z), z, kind: 'plain' });
    if (!opts.trial) {
      // 後端のめねじ。入口は面取り
      for (const z of zSteps(thTop, 0.5, 0.1)) prof.push({ r: TH_RMIN, z, kind: 'fthread' });
      prof.push({ r: TH_RMAX + 0.4, z: 0, kind: 'plain' });
    }
    // 平らな面は後ろ端(ねじの外)では浅く、形の始まりで本来の深さへ
    const flatAt = (z) => L.flatD + (L.flatRear - L.flatD) * (1 - smooth((z - L.zoneStart) / FADE));
    const shape = (pt, th) => {
      if (pt.outer && L.flatD) return flatCut(pt.kind === 'shaped' ? S.outerR(pt.z, th) : pt.r, th, flatAt(pt.z));
      if (pt.kind === 'shaped') return S.outerR(pt.z, th);
      if (pt.kind === 'fthread') return TH_RMIN + TH_H * threadW(th, pt.z);
      return pt.r;
    };
    return revolve(prof, N, shape, S.twist);
  }

  function buildCap(p, L) {
    const N = ringCount(p);
    const rIn = L.rCapIn;
    const rOut = L.rCapOut;
    const flush = p.capStyle === 'flush';
    const depthIn = L.bodyLen + p.tipExposed + 2.5 - L.capZ; // 口金と出ている替芯を覆う
    const H = depthIn + 2.0;
    const top = 1.8;
    // 断面とねじれは軸と同じ割合で続け、張り出しは 1.5mm までにする
    const z0 = 2.5, z1 = H - 4;
    const bodyZone = Math.max(1, L.zoneEnd - L.zoneStart);
    const bulge = Math.min(1.5, L.rMax * (1 - L.sec.min));
    const S = makeSurface(p, L, z0, z1, {
      turns: p.twist * (z1 - z0) / bodyZone,
      waists: false,
      base: rOut,
      floor: rOut,
      radius: flush ? (s) => L.rMax * s : (s) => rOut + bulge * (L.sec.min < 1 ? (s - L.sec.min) / (1 - L.sec.min) : 0),
    });
    const prof = [];
    prof.push({ r: rIn + 0.5, z: 0, kind: 'plain' });
    prof.push({ r: rOut - 0.3, z: 0, kind: 'plain' });
    for (const z of zSteps(0.3, H - top, DZ)) prof.push({ r: rOut, z, kind: z > z0 && z < z1 ? 'shaped' : 'plain', outer: true });
    // 丸い頭
    for (let k = 1; k <= 8; k++) {
      const a = (k / 8) * Math.PI / 2;
      prof.push({ r: Math.max(0, rOut * Math.cos(a)), z: H - top + top * Math.sin(a), kind: 'plain', outer: k < 8 });
    }
    // 頭の中心に通気穴
    prof[prof.length - 1].r = VENT;
    // 内側は上から下へ。開口から 6mm の位置に小さな絞りを入れて、はめたときに止まるようにする
    prof.push({ r: VENT, z: depthIn });
    prof.push({ r: rIn - 1.5, z: depthIn, kind: 'plain' });
    for (const z of zSteps(depthIn - 1.5, 0.6, DZ)) {
      const rib = Math.max(0, 1 - Math.abs(z - 6) / 1.2) * 0.22;
      const r = z > depthIn - 6 ? rIn + 0.3 : rIn - rib;
      prof.push({ r, z, kind: 'plain' });
    }
    const shape = (pt, th) => {
      const r = pt.kind === 'shaped' ? S.outerR(pt.z, th) : pt.r;
      return pt.outer ? flatCut(r, th, L.flatCap) : r;
    };
    return revolve(prof, N, shape, S.twist);
  }

  // 後ろ栓: 軸の後端と面一になるねじ込み式。後端の面にコイン用のスリット、中心に通気穴。
  // 軸の座標(後端 z = 0)で作ってから、前の面を下にして印刷できるよう X 軸まわりに 180°回す(ねじの向きは変わらない)
  function buildPlug(p, L) {
    const N = 192;
    const len = PLUG_DEPTH - PLUG_GAP;               // 替芯の後端の 0.2mm 手前まで
    const rRoot = TH_RMIN - TH_CLR;                  // おねじの谷
    const lead = 0.8;                                // ねじ山を両端で細らせる長さ(入れやすくする)
    const prof = [];
    // コイン側の面(z = 0)を通気穴から外へ
    for (let r = VENT; r < rRoot - 0.35; r += 0.12) prof.push({ r, z: 0, kind: 'face' });
    prof.push({ r: rRoot - 0.3, z: 0, kind: 'face' });
    // おねじ
    for (const z of zSteps(0.3, len - 0.3, 0.1)) prof.push({ r: rRoot, z, kind: 'mthread' });
    // 前の面(替芯を押す)
    prof.push({ r: rRoot - 0.3, z: len, kind: 'plain' });
    prof.push({ r: VENT, z: len, kind: 'plain' });
    // 通気穴の壁(スリットの底まで)
    for (const z of zSteps(len - 0.2, SLOT_D + 0.2, DZ)) prof.push({ r: VENT, z, kind: 'plain' });
    const inSlot = (r, th) => {
      const x = Math.abs(r * Math.cos(th)), y = Math.abs(r * Math.sin(th));
      const hw = SLOT_W / 2, end = SLOT_L - hw;
      if (x <= end) return y <= hw;
      return Math.hypot(x - end, y) <= hw;
    };
    const shape = (pt, th) => {
      if (pt.kind === 'face') return { r: pt.r, z: inSlot(pt.r, th) ? SLOT_D : 0 };
      if (pt.kind === 'mthread') {
        const f = smooth(Math.min(pt.z, len - pt.z) / lead);
        return rRoot + (TH_H * threadW(th, pt.z)) * f;
      }
      return pt.r;
    };
    const m = revolve(prof, N, shape, () => 0);
    // 印刷向きへ: (x, y, z) → (x, −y, len − z)
    const P = m.positions;
    for (let i = 0; i < P.length; i += 3) { P[i + 1] = -P[i + 1]; P[i + 2] = len - P[i + 2]; }
    m.assembled = { flipX: true, z: len };          // 組み立て図: X 軸まわりに 180°回して z = len に置く
    return m;
  }

  // 全部品を作る。印刷向きに立てた状態で、ベッド上に並べる位置も返す
  function build(params) {
    const p = normalize(params);
    const L = layout(p);
    const parts = [];
    if (p.trial) {
      parts.push({ name: 'pen-tip-test', mesh: buildBody(p, L, { trial: true }), place: [0, 0, -Math.max(0, L.bodyLen - TRIAL_LEN)] });
      return { params: p, layout: L, parts };
    }
    parts.push({ name: 'pen-body', mesh: buildBody(p, L), place: [0, 0, 0] });
    const gap = L.rMax * 2 + 8;
    if (p.capStyle !== 'none') parts.push({ name: 'pen-cap', mesh: buildCap(p, L), place: [gap, 0, 0] });
    if (p.withPlug) parts.push({ name: 'pen-plug', mesh: buildPlug(p, L), place: [0, gap, 0] });
    return { params: p, layout: L, parts };
  }

  // 形が閉じているか(全ての辺がちょうど2枚の三角形に、逆向きで共有されているか)を調べる
  function checkManifold(m) {
    const I = m.indices;
    const edges = new Map();
    const key = (a, b) => a * 4194304 + b;
    for (let t = 0; t < I.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = I[t + e], b = I[t + (e + 1) % 3];
        const k = key(a, b);
        edges.set(k, (edges.get(k) || 0) + 1);
      }
    }
    let bad = 0;
    for (const [k, n] of edges) {
      const a = Math.floor(k / 4194304), b = k % 4194304;
      if (n !== 1 || edges.get(key(b, a)) !== 1) bad++;
    }
    let degenerate = 0;
    for (let t = 0; t < I.length; t += 3) if (I[t] === I[t + 1] || I[t + 1] === I[t + 2] || I[t] === I[t + 2]) degenerate++;
    return { badEdges: bad, degenerate, triangles: I.length / 3, volume: signedVolume(m) };
  }

  // ---- 3MF 書き出し ----
  function modelXML(build3) {
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    out.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
    out.push(' <metadata name="Title">this is a pen</metadata>\n');
    out.push(' <metadata name="Designer">this is a pen generator</metadata>\n');
    out.push(' <resources>\n');
    const items = [];
    build3.parts.forEach((part, k) => {
      const id = k + 1;
      const m = part.mesh;
      out.push(`  <object id="${id}" name="${part.name}" type="model">\n   <mesh>\n    <vertices>\n`);
      const P = m.positions;
      const lines = [];
      for (let v = 0; v < P.length; v += 3) lines.push(`     <vertex x="${P[v].toFixed(4)}" y="${P[v + 1].toFixed(4)}" z="${P[v + 2].toFixed(4)}" />`);
      out.push(lines.join('\n'), '\n    </vertices>\n    <triangles>\n');
      const I = m.indices;
      const tl = [];
      for (let t = 0; t < I.length; t += 3) tl.push(`     <triangle v1="${I[t]}" v2="${I[t + 1]}" v3="${I[t + 2]}" />`);
      out.push(tl.join('\n'), '\n    </triangles>\n   </mesh>\n  </object>\n');
      const [x, y, z] = part.place;
      items.push(`  <item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${x + 90} ${y + 90} ${z}" printable="1" />`);
    });
    out.push(' </resources>\n <build>\n', items.join('\n'), '\n </build>\n</model>\n');
    return out.join('');
  }

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n';
  const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n';

  // ---- 最小の ZIP 書き出し(deflate が使えれば圧縮、無ければ無圧縮) ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  async function deflateRaw(data) {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const stream = new Blob([data]).stream().pipeThrough(cs);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (e) { /* 使えなければ無圧縮 */ }
    }
    if (typeof require === 'function') {
      try { return new Uint8Array(require('zlib').deflateRawSync(data)); } catch (e) { /* 無圧縮へ */ }
    }
    return null;
  }

  async function zip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(raw);
      const def = await deflateRaw(raw);
      const method = def ? 8 : 0;
      const body = def || raw;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, method, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, body);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, method, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + body.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = chunks.concat(central, [new Uint8Array(end.buffer)]);
    const total = all.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of all) { out.set(c, o); o += c.length; }
    return out;
  }

  async function export3MF(build3) {
    return zip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: RELS },
      { name: '3D/3dmodel.model', data: modelXML(build3) },
    ]);
  }

  const api = { DEFAULTS, REFILL, refillDiaAt, innerRadius, build, layout, normalize, checkManifold, export3MF, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PenCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
