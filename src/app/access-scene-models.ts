import * as THREE from 'three';

export interface SceneResources {
  disposables: Array<{ dispose: () => void }>;
  courtGroup: THREE.Group;
  racketGroup: THREE.Group;
  ballGroup: THREE.Group;
  ballShadow: THREE.Mesh;
  orbitalRing: THREE.Mesh;
}

function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  maxAnisotropy: number,
  isColor: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createCourtSurfaceTexture(maxAnisotropy: number): THREE.CanvasTexture {
  return makeCanvasTexture(1024, 1024, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f3d2e');
    grad.addColorStop(0.5, '#144c3a');
    grad.addColorStop(1, '#0c3326');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle acrylic hard-court micro-speckle
    for (let i = 0; i < 6000; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 24634.6345) % 1;
      const px = Math.abs(x) * w;
      const py = Math.abs(y) * h;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(213, 234, 167, 0.035)' : 'rgba(6, 20, 15, 0.08)';
      ctx.fillRect(px, py, 2, 2);
    }

    // Inner playable court rectangle with crisp modern lines
    const padX = 110;
    const padY = 120;
    const cw = w - padX * 2;
    const ch = h - padY * 2;

    ctx.fillStyle = '#175843';
    ctx.fillRect(padX, padY, cw, ch);

    ctx.strokeStyle = 'rgba(244, 250, 238, 0.92)';
    ctx.lineWidth = 8;
    ctx.strokeRect(padX, padY, cw, ch);

    // Doubles alleys
    const alley = 64;
    ctx.beginPath();
    ctx.moveTo(padX + alley, padY);
    ctx.lineTo(padX + alley, padY + ch);
    ctx.moveTo(padX + cw - alley, padY);
    ctx.lineTo(padX + cw - alley, padY + ch);
    // Service lines
    const svcTop = padY + ch * 0.24;
    const svcBot = padY + ch * 0.76;
    ctx.moveTo(padX + alley, svcTop);
    ctx.lineTo(padX + cw - alley, svcTop);
    ctx.moveTo(padX + alley, svcBot);
    ctx.lineTo(padX + cw - alley, svcBot);
    // Center service line
    ctx.moveTo(w / 2, svcTop);
    ctx.lineTo(w / 2, svcBot);
    // Center marks
    ctx.moveTo(w / 2, padY);
    ctx.lineTo(w / 2, padY + 22);
    ctx.moveTo(w / 2, padY + ch - 22);
    ctx.lineTo(w / 2, padY + ch);
    ctx.stroke();
  }, maxAnisotropy, true);
}

function createNetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  return makeCanvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(235, 245, 232, 0.78)';
    ctx.lineWidth = 2;
    const step = 12;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }, maxAnisotropy, true);
}

function createFeltTexture(maxAnisotropy: number): { colorMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const colorMap = makeCanvasTexture(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#c8f224');
    grad.addColorStop(0.5, '#b6e314');
    grad.addColorStop(1, '#9fcc09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 8000; i++) {
      const rx = Math.abs((Math.sin(i * 19.31) * 43758.5453) % 1) * w;
      const ry = Math.abs((Math.cos(i * 47.17) * 24634.6345) % 1) * h;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,230,0.18)' : 'rgba(130,165,10,0.16)';
      ctx.fillRect(rx, ry, 2, 2);
    }
  }, maxAnisotropy, true);

  const bumpMap = makeCanvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8000; i++) {
      const rx = Math.abs((Math.sin(i * 19.31) * 43758.5453) % 1) * w;
      const ry = Math.abs((Math.cos(i * 47.17) * 24634.6345) % 1) * h;
      const shade = i % 2 === 0 ? 205 : 65;
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(rx, ry, 2, 2);
    }
  }, maxAnisotropy, false);

  return { colorMap, bumpMap };
}

function createGripTexture(maxAnisotropy: number): THREE.CanvasTexture {
  return makeCanvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#12241d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(213, 234, 167, 0.22)';
    ctx.lineWidth = 4;
    for (let y = -w; y < h + w; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + 64);
      ctx.stroke();
    }
  }, maxAnisotropy, true);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(3, 12, 9, 0.72)');
    grad.addColorStop(0.55, 'rgba(3, 12, 9, 0.25)');
    grad.addColorStop(1, 'rgba(3, 12, 9, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, 1, true);
}

function buildCourtStage(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  // 1. Beveled architectural plinth base (grounded at y = 0)
  const deckShape = new THREE.Shape();
  const hw = 2.9;
  const hd = 4.2;
  const r = 0.28;
  deckShape.moveTo(-hw + r, -hd);
  deckShape.lineTo(hw - r, -hd);
  deckShape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  deckShape.lineTo(hw, hd - r);
  deckShape.quadraticCurveTo(hw, hd, hw - r, hd);
  deckShape.lineTo(-hw + r, hd);
  deckShape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  deckShape.lineTo(-hw, -hd + r);
  deckShape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const plinthGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.05,
    bevelThickness: 0.04,
  });
  plinthGeo.rotateX(Math.PI / 2);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x0a1e17,
    roughness: 0.72,
    metalness: 0.22,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = 0.24;
  plinth.receiveShadow = !isSoftwareGl;
  group.add(plinth);
  disposables.push(plinthGeo, plinthMat);

  // 2. Brushed champagne-lime perimeter trim rail
  const trimGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.015,
  });
  trimGeo.rotateX(Math.PI / 2);
  const trimMat = new THREE.MeshPhysicalMaterial({
    color: 0xbcd88a,
    metalness: 0.9,
    roughness: 0.22,
    anisotropy: 0.75,
  });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.position.y = 0.275;
  trim.scale.set(1.006, 1, 1.004);
  group.add(trim);
  disposables.push(trimGeo, trimMat);

  // 3. Playable court surface top plate (offset above plinth so zero Z-fighting)
  const surfaceTex = createCourtSurfaceTexture(maxAnisotropy);
  const surfaceGeo = new THREE.PlaneGeometry(5.55, 8.15);
  surfaceGeo.rotateX(-Math.PI / 2);
  const surfaceMat = new THREE.MeshStandardMaterial({
    map: surfaceTex,
    roughness: 0.85,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.position.y = 0.292;
  surface.receiveShadow = !isSoftwareGl;
  group.add(surface);
  disposables.push(surfaceTex, surfaceGeo, surfaceMat);

  // 4. Net posts & brushed metallic caps
  const postGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.62, 20);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x162b23,
    metalness: 0.85,
    roughness: 0.24,
  });
  const capGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.05, 20);
  const capMat = new THREE.MeshPhysicalMaterial({
    color: 0xd5eaa7,
    metalness: 0.95,
    roughness: 0.16,
  });
  for (const x of [-2.42, 2.42]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.6, 0);
    post.castShadow = !isSoftwareGl;
    group.add(post);

    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, 0.92, 0);
    group.add(cap);
  }
  disposables.push(postGeo, postMat, capGeo, capMat);

  // 5. Woven procedural tennis net + white headband tape + center strap
  const netTex = createNetTexture(maxAnisotropy);
  netTex.wrapS = THREE.RepeatWrapping;
  netTex.repeat.set(3.2, 1);
  const netGeo = new THREE.PlaneGeometry(4.8, 0.52);
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    transparent: true,
    alphaTest: 0.15,
    side: THREE.DoubleSide,
    roughness: 0.78,
    metalness: 0.05,
  });
  const net = new THREE.Mesh(netGeo, netMat);
  net.position.set(0, 0.58, 0);
  net.castShadow = !isSoftwareGl;
  group.add(net);

  const tapeGeo = new THREE.BoxGeometry(4.84, 0.045, 0.024);
  const tapeMat = new THREE.MeshStandardMaterial({
    color: 0xf4faf0,
    roughness: 0.48,
    metalness: 0.02,
  });
  const tape = new THREE.Mesh(tapeGeo, tapeMat);
  tape.position.set(0, 0.855, 0);
  tape.castShadow = !isSoftwareGl;
  group.add(tape);

  const strapGeo = new THREE.BoxGeometry(0.05, 0.56, 0.032);
  const strap = new THREE.Mesh(strapGeo, tapeMat);
  strap.position.set(0, 0.57, 0);
  group.add(strap);
  disposables.push(netTex, netGeo, netMat, tapeGeo, tapeMat, strapGeo);

  // 6. Soft grounded studio floor shadow beneath the entire stage
  const stageShadowTex = createContactShadowTexture();
  const stageShadowGeo = new THREE.PlaneGeometry(8.6, 11.4);
  stageShadowGeo.rotateX(-Math.PI / 2);
  const stageShadowMat = new THREE.MeshBasicMaterial({
    map: stageShadowTex,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const stageShadow = new THREE.Mesh(stageShadowGeo, stageShadowMat);
  stageShadow.position.y = -0.02;
  group.add(stageShadow);
  disposables.push(stageShadowTex, stageShadowGeo, stageShadowMat);

  return group;
}

function buildTennisRacket(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const racket = new THREE.Group();

  // 1. Sculpted beveled graphite hoop (outer ellipse with inner cutout)
  const rx = 0.62;
  const ry = 0.82;
  const rim = 0.078;
  const hoopShape = new THREE.Shape();
  hoopShape.absellipse(0, 0.72, rx, ry, 0, Math.PI * 2, false, 0);
  const hoopHole = new THREE.Path();
  hoopHole.absellipse(0, 0.72, rx - rim, ry - rim, 0, Math.PI * 2, true, 0);
  hoopShape.holes.push(hoopHole);

  const hoopGeo = new THREE.ExtrudeGeometry(hoopShape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.02,
    bevelSegments: 4,
    curveSegments: 48,
  });
  hoopGeo.translate(0, 0, -0.0375);
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e3b2e,
    roughness: 0.24,
    metalness: 0.65,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });
  const hoop = new THREE.Mesh(hoopGeo, frameMat);
  hoop.castShadow = !isSoftwareGl;
  racket.add(hoop);
  disposables.push(hoopGeo, frameMat);

  // 2. Optic-lime inner accent ring inside the hoop bevel
  const accentGeo = new THREE.TorusGeometry(0.58, 0.014, 10, 64);
  accentGeo.scale(0.99, 1.33, 1);
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: 0xd5eaa7,
    emissive: 0x3b6620,
    emissiveIntensity: 0.35,
    metalness: 0.85,
    roughness: 0.18,
  });
  const accent = new THREE.Mesh(accentGeo, accentMat);
  accent.position.set(0, 0.72, 0);
  racket.add(accent);
  disposables.push(accentGeo, accentMat);

  // 3. Y-throat sculpted tubes connecting hoop to shaft
  const leftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.34, 0.05, 0),
    new THREE.Vector3(-0.19, -0.25, 0),
    new THREE.Vector3(-0.045, -0.52, 0),
  ]);
  const rightCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.34, 0.05, 0),
    new THREE.Vector3(0.19, -0.25, 0),
    new THREE.Vector3(0.045, -0.52, 0),
  ]);
  const leftThroatGeo = new THREE.TubeGeometry(leftCurve, 24, 0.038, 12, false);
  const rightThroatGeo = new THREE.TubeGeometry(rightCurve, 24, 0.038, 12, false);
  const leftThroat = new THREE.Mesh(leftThroatGeo, frameMat);
  const rightThroat = new THREE.Mesh(rightThroatGeo, frameMat);
  leftThroat.castShadow = !isSoftwareGl;
  rightThroat.castShadow = !isSoftwareGl;
  racket.add(leftThroat, rightThroat);
  disposables.push(leftThroatGeo, rightThroatGeo);

  // 4. Throat bridge crossbar
  const bridgeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.44, 16);
  bridgeGeo.rotateZ(Math.PI / 2);
  const bridge = new THREE.Mesh(bridgeGeo, frameMat);
  bridge.position.set(0, -0.06, 0);
  racket.add(bridge);
  disposables.push(bridgeGeo);

  // 5. Brushed champagne-gold/lime metallic ferrule collar
  const collarGeo = new THREE.CylinderGeometry(0.062, 0.072, 0.12, 8);
  const collarMat = new THREE.MeshPhysicalMaterial({
    color: 0xd5eaa7,
    metalness: 0.94,
    roughness: 0.16,
    anisotropy: 0.8,
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.set(0, -0.54, 0);
  racket.add(collar);
  disposables.push(collarGeo, collarMat);

  // 6. Octagonal leather/overgrip handle with procedural spiral wrap texture
  const gripTex = createGripTexture(maxAnisotropy);
  const gripGeo = new THREE.CylinderGeometry(0.066, 0.072, 0.72, 8);
  const gripMat = new THREE.MeshStandardMaterial({
    map: gripTex,
    roughness: 0.84,
    metalness: 0.05,
  });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.set(0, -0.96, 0);
  grip.castShadow = !isSoftwareGl;
  racket.add(grip);
  disposables.push(gripTex, gripGeo, gripMat);

  // 7. Flared butt cap & metallic crest
  const buttGeo = new THREE.CylinderGeometry(0.074, 0.088, 0.07, 8);
  const butt = new THREE.Mesh(buttGeo, collarMat);
  butt.position.set(0, -1.34, 0);
  racket.add(butt);
  disposables.push(buttGeo);

  // 8. InstancedMesh string bed (13 mains + 17 crosses = 30 strings in 1 draw call)
  const stringMat = new THREE.MeshStandardMaterial({
    color: 0xf1f7e9,
    roughness: 0.42,
    metalness: 0.15,
  });
  const baseStringGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 6);
  const mainCount = 13;
  const crossCount = 17;
  const stringMesh = new THREE.InstancedMesh(baseStringGeo, stringMat, mainCount + crossCount);
  const dummy = new THREE.Object3D();
  let idx = 0;

  // Vertical mains clipped cleanly to inner ellipse
  for (let i = 0; i < mainCount; i++) {
    const x = -0.46 + (i / (mainCount - 1)) * 0.92;
    const normX = x / (rx - rim);
    const halfH = (ry - rim) * Math.sqrt(Math.max(0.02, 1 - normX * normX));
    dummy.position.set(x, 0.72, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, halfH * 2, 1);
    dummy.updateMatrix();
    stringMesh.setMatrixAt(idx++, dummy.matrix);
  }
  // Horizontal crosses clipped cleanly to inner ellipse
  for (let j = 0; j < crossCount; j++) {
    const yOff = -0.62 + (j / (crossCount - 1)) * 1.24;
    const normY = yOff / (ry - rim);
    const halfW = (rx - rim) * Math.sqrt(Math.max(0.02, 1 - normY * normY));
    dummy.position.set(0, 0.72 + yOff, 0);
    dummy.rotation.set(0, 0, Math.PI / 2);
    dummy.scale.set(1, halfW * 2, 1);
    dummy.updateMatrix();
    stringMesh.setMatrixAt(idx++, dummy.matrix);
  }
  stringMesh.instanceMatrix.needsUpdate = true;
  stringMesh.computeBoundingSphere();
  racket.add(stringMesh);
  disposables.push(baseStringGeo, stringMat);

  return racket;
}

class BallSeamCurve extends THREE.Curve<THREE.Vector3> {
  private radius: number;
  constructor(radius: number) {
    super();
    this.radius = radius;
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2;
    const x = Math.sin(a) + 2 * Math.sin(2 * a);
    const y = Math.cos(a) - 2 * Math.cos(2 * a);
    const z = -Math.sin(3 * a);
    return target.set(x, y, z).normalize().multiplyScalar(this.radius);
  }
}

function buildTennisBall(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  disposables: Array<{ dispose: () => void }>,
): { ballGroup: THREE.Group; ballShadow: THREE.Mesh } {
  const ballGroup = new THREE.Group();
  const radius = 0.24;

  // 1. Felt sphere with procedural bump + color
  const { colorMap, bumpMap } = createFeltTexture(maxAnisotropy);
  const sphereGeo = new THREE.SphereGeometry(radius, 36, 36);
  const feltMat = new THREE.MeshPhysicalMaterial({
    map: colorMap,
    bumpMap,
    bumpScale: 0.014,
    roughness: 0.9,
    metalness: 0.0,
    sheen: 0.85,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0xf4ffd0),
  });
  const core = new THREE.Mesh(sphereGeo, feltMat);
  core.castShadow = !isSoftwareGl;
  ballGroup.add(core);
  disposables.push(colorMap, bumpMap, sphereGeo, feltMat);

  // 2. Sculpted rubber saddle seam
  const seamCurve = new BallSeamCurve(radius * 1.004);
  const seamGeo = new THREE.TubeGeometry(seamCurve, 128, 0.011, 10, true);
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0xf7faf4,
    roughness: 0.38,
    metalness: 0.02,
  });
  const seam = new THREE.Mesh(seamGeo, seamMat);
  ballGroup.add(seam);
  disposables.push(seamGeo, seamMat);

  // 3. Dynamic contact shadow plane on court
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(0.85, 0.85);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
  ballShadow.position.y = 0.305;
  disposables.push(shadowTex, shadowGeo, shadowMat);

  return { ballGroup, ballShadow };
}

export function buildTennisSceneContent(
  maxAnisotropy: number,
  isSoftwareGl: boolean,
): SceneResources {
  const disposables: Array<{ dispose: () => void }> = [];

  const courtGroup = buildCourtStage(maxAnisotropy, isSoftwareGl, disposables);

  const racketGroup = buildTennisRacket(maxAnisotropy, isSoftwareGl, disposables);
  racketGroup.position.set(-0.62, 1.72, 0.45);
  racketGroup.rotation.set(-0.22, 0.46, 0.28);

  const { ballGroup, ballShadow } = buildTennisBall(maxAnisotropy, isSoftwareGl, disposables);
  ballGroup.position.set(0.68, 1.25, -0.35);

  // Sleek subtle stadium accent ring floating behind the court for modern architectural depth
  const ringGeo = new THREE.TorusGeometry(4.15, 0.015, 12, 128);
  const ringMat = new THREE.MeshPhysicalMaterial({
    color: 0xd5eaa7,
    metalness: 0.9,
    roughness: 0.16,
    transparent: true,
    opacity: 0.42,
  });
  const orbitalRing = new THREE.Mesh(ringGeo, ringMat);
  orbitalRing.position.set(0, 1.15, -0.2);
  orbitalRing.rotation.set(Math.PI / 2.25, 0.16, 0);
  disposables.push(ringGeo, ringMat);

  return { disposables, courtGroup, racketGroup, ballGroup, ballShadow, orbitalRing };
}
