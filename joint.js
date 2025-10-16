(() => {
  const canvas3d = document.getElementById('view3d');
  const projCanvas = document.getElementById('proj');
  const ctx3d = canvas3d.getContext('2d');
  const ctx2d = projCanvas.getContext('2d');

  const speedRange = document.getElementById('speed');
  const betaRange = document.getElementById('beta');
  const speedVal = document.getElementById('speedVal');
  const betaVal = document.getElementById('betaVal');
  const epsRatioEl = document.getElementById('epsRatio');
  const theta1El = document.getElementById('theta1');
  const theta2El = document.getElementById('theta2');
  const ratioEl = document.getElementById('ratio');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const left = canvas3d.parentElement.getBoundingClientRect();
    canvas3d.width = Math.floor(left.width * dpr);
    canvas3d.height = Math.floor(left.height * dpr);
    canvas3d.style.width = `${left.width}px`;
    canvas3d.style.height = `${left.height}px`;

    const right = projCanvas.parentElement.getBoundingClientRect();
    projCanvas.width = Math.floor(right.width * dpr);
    projCanvas.height = Math.floor(right.height * dpr);
    projCanvas.style.width = `${right.width}px`;
    projCanvas.style.height = `${right.height}px`;

    ctx3d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const V = {
    add: (a,b)=>[a[0]+b[0], a[1]+b[1], a[2]+b[2]],
    sub: (a,b)=>[a[0]-b[0], a[1]-b[1], a[2]-b[2]],
    dot: (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
    cross: (a,b)=>[
      a[1]*b[2]-a[2]*b[1],
      a[2]*b[0]-a[0]*b[2],
      a[0]*b[1]-a[1]*b[0]
    ],
    scale: (a,s)=>[a[0]*s, a[1]*s, a[2]*s],
    norm: a=>Math.hypot(a[0],a[1],a[2]),
    normalize: a=>{
      const n = Math.hypot(a[0],a[1],a[2]) || 1e-9;
      return [a[0]/n, a[1]/n, a[2]/n];
    },
    rotateAxis: (v, axis, angle)=>{
      const u = V.normalize(axis);
      const s = Math.sin(angle), c = Math.cos(angle);
      const dot = V.dot(u,v);
      const term1 = V.scale(v, c);
      const term2 = V.scale(V.cross(u, v), s);
      const term3 = V.scale(u, dot * (1 - c));
      return V.add(V.add(term1, term2), term3);
    },
    basisFromNormal: (n)=>{
      const nn = V.normalize(n);
      let e1 = V.cross(Math.abs(nn[1]) < 0.9 ? [0,1,0] : [1,0,0], nn);
      if (V.norm(e1) < 1e-6) e1 = [1,0,0];
      e1 = V.normalize(e1);
      const e2 = V.cross(nn, e1);
      return [e1, V.normalize(e2)];
    }
  };

  const UP = [-1,0,0];
  const AXIS = {
    X: [0,0,-1],
    Y: [0,1,0],
    Z: [-1,0,0]
  };

  const cam = {
    az: Math.PI,
    el: 0,
    roll: 0,
    dist: 7,
    fov: 55 * Math.PI/180
  };

  function camBasis(){
    const target = [0,0,0];
    const f0 = V.normalize([0,1,0]);
    const fYaw = V.normalize(V.rotateAxis(f0, UP, cam.az));
    let r = V.cross(fYaw, UP); if (V.norm(r) < 1e-6) r = [0,1,0]; r = V.normalize(r);
    const f = V.normalize(V.rotateAxis(fYaw, r, cam.el));
    const pos = V.add(target, V.scale(f, -cam.dist));
    const u = V.cross(r, f);
    return {pos, f, r, u};
  }

  function worldToScreen(p){
    const {pos,f,r,u} = camBasis();
    const cr = Math.cos(cam.roll||0), sr = Math.sin(cam.roll||0);
    const r2 = [ r[0]*cr + u[0]*sr, r[1]*cr + u[1]*sr, r[2]*cr + u[2]*sr ];
    const u2 = [ -r[0]*sr + u[0]*cr, -r[1]*sr + u[1]*cr, -r[2]*sr + u[2]*cr ];
    const v = V.sub(p, pos);
    const x = V.dot(v, r2);
    const y = V.dot(v, u2);
    const z = V.dot(v, f);
    const cw = canvas3d.width / (window.devicePixelRatio||1);
    const ch = canvas3d.height / (window.devicePixelRatio||1);
    const aspect = cw / ch;
    const s = (0.5 * ch) / Math.tan(cam.fov/2);
    const sx = cw/2 + (s * (x/(z||1e-6)));
    const sy = ch/2 - (s * (y/(z||1e-6)));
    return {x:sx, y:sy, z};
  }

  function worldToNDC(p){
    const {x,y} = worldToScreen(p);
    const cw = canvas3d.width / (window.devicePixelRatio||1);
    const ch = canvas3d.height / (window.devicePixelRatio||1);
    return {x: (x - cw/2)/(cw/2), y: (y - ch/2)/(ch/2)};
  }

  function line3D(a,b, color='#8ea3b8', width=2){
    const A = worldToScreen(a), B = worldToScreen(b);
    ctx3d.strokeStyle = color;
    ctx3d.lineWidth = width;
    ctx3d.beginPath();
    ctx3d.moveTo(A.x, A.y);
    ctx3d.lineTo(B.x, B.y);
    ctx3d.stroke();
  }

  function label3D(p, text, color='#e6e6e6'){
    const s = worldToScreen(p);
    ctx3d.fillStyle = color;
    ctx3d.font = '12px ui-sans-serif, -apple-system';
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillText(text, s.x + 4, s.y);
  }

  function ringPoints(normal, radius=1, segments=96){
    const [e1,e2] = V.basisFromNormal(normal);
    const pts = [];
    for(let i=0;i<=segments;i++){
      const t = (i/segments) * Math.PI*2;
      const p = V.add(V.scale(e1, Math.cos(t)*radius), V.scale(e2, Math.sin(t)*radius));
      pts.push(p);
    }
    return {pts, e1, e2};
  }

  function drawRing(normal, radius, color='#3e5a79'){
    const {pts} = ringPoints(normal, radius, 128);
    ctx3d.strokeStyle = color;
    ctx3d.lineWidth = 1.5;
    ctx3d.beginPath();
    for(let i=0;i<pts.length;i++){
      const s = worldToScreen(pts[i]);
      if(i===0) ctx3d.moveTo(s.x, s.y); else ctx3d.lineTo(s.x, s.y);
    }
    ctx3d.stroke();
  }

  function dot3D(p, r=4, color='#4ea1ff'){
    const s = worldToScreen(p);
    ctx3d.fillStyle = color;
    ctx3d.beginPath();
    ctx3d.arc(s.x, s.y, r, 0, Math.PI*2);
    ctx3d.fill();
  }

  function drawAngleArc({origin=[0,0,0], axisA, axisB, radius=1, color='#ff6464', textColor='#ffd166', label}){
    if(!axisA || !axisB) return;
    let a = V.normalize(axisA);
    let b = V.normalize(axisB);
    if (V.norm(a) < 1e-6 || V.norm(b) < 1e-6) return;
    if (V.dot(a, b) < 0) b = V.scale(b, -1);
    const dot = Math.max(-1, Math.min(1, V.dot(a, b)));
    const angle = Math.acos(dot);
    if (!Number.isFinite(angle) || angle < 1e-3) return;
    let axis = V.cross(a, b);
    if (V.norm(axis) < 1e-6) return;
    axis = V.normalize(axis);

    ctx3d.strokeStyle = color;
    ctx3d.lineWidth = 2;
    ctx3d.beginPath();
    const steps = 48;
    for(let i=0;i<=steps;i++){
      const theta = angle * (i/steps);
      const v = V.rotateAxis(a, axis, theta);
      const pt = V.add(origin, V.scale(v, radius));
      const s = worldToScreen(pt);
      if(i===0) ctx3d.moveTo(s.x, s.y); else ctx3d.lineTo(s.x, s.y);
    }
    ctx3d.stroke();

    if(label){
      const mid = V.rotateAxis(a, axis, angle/2);
      const labelPos = V.add(origin, V.scale(mid, radius + 0.18));
      const s = worldToScreen(labelPos);
      ctx3d.fillStyle = textColor;
      ctx3d.font = '13px ui-sans-serif, -apple-system';
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillText(label, s.x, s.y);
    }
  }

  let dragging = false, lastX=0, lastY=0;
  canvas3d.addEventListener('pointerdown', (e)=>{
    dragging = true; lastX=e.clientX; lastY=e.clientY; canvas3d.setPointerCapture(e.pointerId);
  });
  canvas3d.addEventListener('pointerup', (e)=>{ dragging=false; });
  canvas3d.addEventListener('pointerleave', ()=> dragging=false);
  canvas3d.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    cam.az -= dx * 0.005;
    cam.el += dy * 0.005;
    const lim = Math.PI/2 - 0.001;
    cam.el = Math.max(-lim, Math.min(lim, cam.el));
  });
  canvas3d.addEventListener('wheel', (e)=>{
  }, {passive:true});

  document.querySelectorAll('.views button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const v = btn.getAttribute('data-view');
      const eps = 1e-3;
      switch(v){
        case '+X': cam.az = 0; cam.el = 0; break;
        case '-X': cam.az = Math.PI; cam.el = 0; break;
        case '+Y': cam.az = Math.PI/2; cam.el = 0; break;
        case '-Y': cam.az = -Math.PI/2; cam.el = 0; break;
        case '+Z': cam.el = Math.PI/2 - eps; break;
        case '-Z': cam.el = -Math.PI/2 + eps; break;
        case 'ISO': cam.az = Math.PI/4; cam.el = Math.PI/6; break;
      }
    });
  });

  function updateLabels(){
    speedVal.textContent = speedRange.value;
    betaVal.textContent = betaRange.value;
    const alpha = parseFloat(betaRange.value) * Math.PI/180;
    const c = Math.cos(alpha);
    const ratio = 1 / Math.max(1e-9, c*c);
    if (epsRatioEl) epsRatioEl.textContent = ratio.toFixed(3);
  }
  speedRange.addEventListener('input', updateLabels);
  betaRange.addEventListener('input', updateLabels);
  updateLabels();

  let tPrev = performance.now();
  let theta1 = 0;

  function step(now){
    const dt = Math.max(0, Math.min(0.05, (now - tPrev)/1000));
    tPrev = now;
    const w1 = (parseFloat(speedRange.value) * Math.PI/180);
    const beta = parseFloat(betaRange.value) * Math.PI/180;
    theta1 = (theta1 + w1*dt) % (Math.PI*2);

    render(theta1, w1, beta);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  function render(theta1, w1, beta){
    const S1 = [0,0,1];
    const S2 = [Math.sin(beta), 0, Math.cos(beta)];
    const radius = 1.4;
    const shaftL = 2.8;
    const crossL = 1.2;

    const b1x = [1,0,0];
    const b1y = V.cross(S1, b1x);
    let Y1 = V.rotateAxis(b1x, S1, theta1);

    let Y2 = V.cross(S2, Y1);
    Y2 = V.normalize(Y2);
    let b2x = V.cross([0,1,0], S2); if (V.norm(b2x)<1e-6) b2x = V.cross([1,0,0], S2); b2x = V.normalize(b2x);
    let b2y = V.cross(S2, b2x); b2y = V.normalize(b2y);
    const theta2 = Math.atan2(V.dot(Y2, b2y), V.dot(Y2, b2x));

    const s = Math.sin(beta), c = Math.cos(beta);
    const ratio = c / (1 - (s*s) * (Math.sin(theta1)**2));
    const w2 = w1 * ratio;

    ctx3d.clearRect(0,0,canvas3d.width, canvas3d.height);

    drawAxes();

    line3D(V.scale(S1, -shaftL*0.5), V.scale(S1, shaftL*0.5), '#4f5b6b', 3);
    line3D(V.scale(S2, -shaftL*0.5), V.scale(S2, shaftL*0.5), '#6a7790', 3);

    drawRing(S1, radius, '#4ea1ff');
    drawRing(S2, radius, '#ff6464');

    const alphaDeg = (beta*180/Math.PI).toFixed(1);
    drawAngleArc({
      origin: [0,0,0],
      axisA: AXIS.X,
      axisB: S2,
      radius: radius*0.7,
      color: '#ff6464',
      textColor: '#ffd166',
      label: `α = ${alphaDeg}°`
    });
    label3D(V.scale(S2, -(radius + 0.4)), '구동축', '#ffd166');

    const theta2Adj = theta2 - Math.PI/2;
    const pinBlue = V.add(V.scale(b1x, Math.cos(theta2Adj)*radius), V.scale(b1y, Math.sin(theta2Adj)*radius));
    dot3D(pinBlue, 4, '#4ea1ff');
    const pinRed = V.add(V.scale(b2x, Math.cos(theta1)*radius), V.scale(b2y, Math.sin(theta1)*radius));
    dot3D(pinRed, 4, '#21d1b8');

    drawProjectionPanelFixed({S1, S2, b1x, b1y, b2x, b2y, radius, theta1});

    const wrap360 = (d)=>{ let x = d % 360; if (x < 0) x += 360; return x; };
    const deg1 = wrap360(theta1*180/Math.PI - 180);
    const deg2 = wrap360(theta2*180/Math.PI + 90);
    theta1El.textContent = deg1.toFixed(1);
    theta2El.textContent = deg2.toFixed(1);
    ratioEl.textContent = (ratio).toFixed(3);
  }

  function drawAxes(){
    const L = 2.2;
    line3D([0,0,0], [0,0,-L], '#606873', 2);
    line3D([0,0,0], [0,0,L], '#30363f', 1.5);
    label3D([0,0,-L], 'X', '#ff6b6b');
    label3D([0,0,-(L+0.25)], '종동축', '#ffd166');
    line3D([0,0,0], [0,L,0], '#606873', 2);
    line3D([0,0,0], [0,-L,0], '#30363f', 1.5);
    label3D([0,L,0], 'Y', '#4d8d4c');
    line3D([0,0,0], [-L,0,0], '#606873', 2);
    line3D([0,0,0], [L,0,0], '#30363f', 1.5);
    label3D([-L,0,0], 'Z', '#5ea7ff');
  }

  function drawProjectionPanelFixed({S1, S2, b1x, b1y, b2x, b2y, radius, theta1}){
    const W = projCanvas.width/(window.devicePixelRatio||1);
    const H = projCanvas.height/(window.devicePixelRatio||1);
    ctx2d.clearRect(0,0,W,H);

    const topY = H*0.30;
    const botY = H*0.70;
    const sep = botY - topY;
    const maxRbyWidth = W * 0.18;
    const maxRbySep = sep * 0.5 - 28;
    const maxRbyHeight = H * 0.22;
    const Rcommon = Math.max(10, Math.min(maxRbyWidth, maxRbySep, maxRbyHeight));

    const topCenter = {x: W*0.5, y: topY};
    const botCenter = {x: W*0.5, y: botY};
    const Rt = Rcommon;
    const Rb = Rcommon;

    ctx2d.strokeStyle = '#ff6464';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(topCenter.x, topCenter.y, Rt, 0, Math.PI*2);
    ctx2d.stroke();
    const ROT2D = Math.PI/2;
    const aTop = theta1 + ROT2D;
    const pTop = {x: topCenter.x + Rt*Math.cos(aTop), y: topCenter.y + Rt*Math.sin(aTop)};
    ctx2d.fillStyle = '#ffd166';
    ctx2d.beginPath(); ctx2d.arc(pTop.x, pTop.y, 5, 0, Math.PI*2); ctx2d.fill();

    ctx2d.save();
    ctx2d.setLineDash([5,5]);
    ctx2d.strokeStyle = 'rgba(160,170,190,0.95)';
    ctx2d.lineWidth = 1.2;
    ctx2d.beginPath();
    ctx2d.moveTo(topCenter.x, topCenter.y);
    ctx2d.lineTo(topCenter.x, topCenter.y - Rt);
    ctx2d.stroke();
    ctx2d.restore();

    ctx2d.save();
    ctx2d.strokeStyle = '#ff6464';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(topCenter.x, topCenter.y);
    ctx2d.lineTo(pTop.x, pTop.y);
    ctx2d.stroke();
    ctx2d.restore();

    const aStart = -Math.PI/2;
    let aCW = aTop - aStart; aCW %= Math.PI*2; if (aCW < 0) aCW += Math.PI*2;
    const rArc = Math.max(12, Rt * 0.45);
    ctx2d.save();
    ctx2d.strokeStyle = '#d75757';
    ctx2d.lineWidth = 2.5;
    ctx2d.beginPath();
    ctx2d.arc(topCenter.x, topCenter.y, rArc, aStart, aStart + aCW, false);
    ctx2d.stroke();
    const aMid = aStart + aCW*0.5;
    const rLabel = rArc + 14;
    const lx = topCenter.x + rLabel*Math.cos(aMid);
    const ly = topCenter.y + rLabel*Math.sin(aMid);
    const label = 'θ1';
    ctx2d.fillStyle = '#d75757';
    ctx2d.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx2d.lineWidth = 3;
    ctx2d.strokeText(label, lx, ly);
    ctx2d.fillText(label, lx, ly);
    ctx2d.restore();

    ctx2d.strokeStyle = '#4ea1ff';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(botCenter.x, botCenter.y, Rb, 0, Math.PI*2);
    ctx2d.stroke();

    let u2cand = V.sub(AXIS.X, V.scale(S2, V.dot(S2, AXIS.X)));
    let u2 = V.norm(u2cand) > 1e-6 ? V.normalize(u2cand) : V.normalize(V.cross([0,1,0], S2));
    if (V.norm(u2) < 1e-6) u2 = V.normalize(V.cross([1,0,0], S2));
    const v2 = V.normalize(V.cross(S2, u2));

    const u2r = v2;
    const v2r = V.scale(u2, -1);
    const samples = 220;
    ctx2d.strokeStyle = '#ff6464';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    for(let i=0;i<=samples;i++){
      const t = (i/samples)*Math.PI*2;
      const p3 = V.add(V.scale(b1x, Math.cos(t)*radius), V.scale(b1y, Math.sin(t)*radius));
      const proj = V.sub(p3, V.scale(S2, V.dot(S2, p3)));
      const x = V.dot(proj, u2r);
      const y = V.dot(proj, v2r);
      const sx = botCenter.x + (x/radius)*Rb;
      const sy = botCenter.y + (y/radius)*Rb;
      if(i===0) ctx2d.moveTo(sx,sy); else ctx2d.lineTo(sx,sy);
    }
    ctx2d.stroke();

    const p3d = V.add(V.scale(b1x, Math.cos(theta1)*radius), V.scale(b1y, Math.sin(theta1)*radius));
    const projP = V.sub(p3d, V.scale(S2, V.dot(S2, p3d)));
    const ex = V.dot(projP, u2r);
    const ey = V.dot(projP, v2r);
    const exLead = -ex;
    const eyLead = -ey;
    const px = botCenter.x + (exLead/radius) * Rb;
    const py = botCenter.y + (eyLead/radius) * Rb;
    ctx2d.fillStyle = '#ffd166';
    ctx2d.beginPath(); ctx2d.arc(px, py, 5, 0, Math.PI*2); ctx2d.fill();

    ctx2d.save();
    ctx2d.setLineDash([5,6]);
    ctx2d.strokeStyle = 'rgba(200,220,255,0.65)';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(pTop.x, pTop.y);
    ctx2d.lineTo(px, py);
    ctx2d.stroke();
    ctx2d.restore();
  }
})();