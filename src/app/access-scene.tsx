'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildTennisSceneContent } from './access-scene-models';

type CameraPresetId = 'overview' | 'racket' | 'ball';

interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

const CAMERA_PRESETS: readonly CameraPreset[] = [
  {
    id: 'overview',
    label: 'نمای کل',
    position: [5.6, 3.95, 6.85],
    target: [0, 1.05, 0],
  },
  {
    id: 'racket',
    label: 'راکت',
    position: [-2.65, 2.45, 4.05],
    target: [-0.58, 1.56, 0.42],
  },
  {
    id: 'ball',
    label: 'توپ',
    position: [2.25, 1.75, 2.35],
    target: [0.68, 0.88, -0.32],
  },
];

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return false;
    const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer);
  } catch {
    return true;
  }
}

export function AccessScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const transitionFnRef = useRef<((preset: CameraPresetId) => void) | null>(null);
  const pausedRef = useRef(false);
  const presetRef = useRef<CameraPresetId>('overview');

  const [activePreset, setActivePreset] = useState<CameraPresetId>('overview');
  const [isPaused, setIsPaused] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [webglReady, setWebglReady] = useState(true);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    presetRef.current = activePreset;
  }, [activePreset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglReady(false);
      return;
    }

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const pixelRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071e17);
    scene.fog = new THREE.FogExp2(0x071e17, 0.042);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.78;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
    camera.position.set(5.6, 3.95, 6.85);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.05, 0);
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 2.6;
    controls.maxDistance = 11.5;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.85;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.85;
    controls.update();

    // 3-point warm/cool studio lighting
    const hemiLight = new THREE.HemisphereLight(0xcbe8df, 0x0d261e, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.35);
    keyLight.position.set(5.5, 8.5, 6.0);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 22;
      keyLight.shadow.camera.left = -5.5;
      keyLight.shadow.camera.right = 5.5;
      keyLight.shadow.camera.top = 5.5;
      keyLight.shadow.camera.bottom = -5.5;
      keyLight.shadow.bias = -0.0006;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xd5eaa7, 1.45);
    rimLight.position.set(-5.5, 4.5, -5.5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const topSoftbox = new THREE.RectAreaLight(0xf3fae8, 2.2, 6, 3);
      topSoftbox.position.set(0, 6.2, 1.5);
      topSoftbox.lookAt(0, 0.5, 0);
      scene.add(topSoftbox);

      const accentSoftbox = new THREE.RectAreaLight(0xb9e387, 1.8, 3.2, 2.2);
      accentSoftbox.position.set(-4.2, 2.4, 2.5);
      accentSoftbox.lookAt(0, 1.2, 0);
      scene.add(accentSoftbox);
    }

    const maxAnisotropy = isSoftwareGl
      ? 1
      : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const resources = buildTennisSceneContent(maxAnisotropy, isSoftwareGl);

    const heroGroup = new THREE.Group();
    heroGroup.add(
      resources.courtGroup,
      resources.racketGroup,
      resources.ballGroup,
      resources.ballShadow,
      resources.orbitalRing,
    );
    scene.add(heroGroup);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pre-allocated state & scratch vectors for zero-GC render loop
    const goalPos = new THREE.Vector3(5.6, 3.95, 6.85);
    const goalTarget = new THREE.Vector3(0, 1.05, 0);
    let transitioning = false;
    let pointerX = 0;
    let pointerY = 0;
    let smoothPointerX = 0;
    let smoothPointerY = 0;

    const triggerPreset = (presetId: CameraPresetId) => {
      const found = CAMERA_PRESETS.find((item) => item.id === presetId);
      if (!found) return;
      goalPos.set(found.position[0], found.position[1], found.position[2]);
      goalTarget.set(found.target[0], found.target[1], found.target[2]);
      transitioning = true;
    };
    transitionFnRef.current = triggerPreset;

    const handleControlStart = () => {
      transitioning = false;
    };
    controls.addEventListener('start', handleControlStart);

    const handlePointerMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerY = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const handlePointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };
    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(Math.round(entry.contentRect.width), 1);
      const h = Math.max(Math.round(entry.contentRect.height), 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    const glCtx = isSoftwareGl ? renderer.getContext() : null;
    const isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' &&
      glCtx instanceof WebGL2RenderingContext;

    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let lastTime = performance.now();
    let simTime = 0;

    const afterDraw = (next: () => void) => {
      if (disposed) return;
      if (isSoftwareGl && isWebGL2) {
        const gl2 = glCtx as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (disposed) {
              gl2.deleteSync(sync);
              return;
            }
            const status = gl2.clientWaitSync(sync, 0, 0);
            if (status === gl2.TIMEOUT_EXPIRED) {
              timerId = setTimeout(poll, 16);
              return;
            }
            gl2.deleteSync(sync);
            timerId = setTimeout(next, 80);
          };
          timerId = setTimeout(poll, 16);
          return;
        }
        timerId = setTimeout(next, 80);
        return;
      }
      rafId = requestAnimationFrame(next);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.15);
      lastTime = now;

      if (!pausedRef.current) {
        simTime += delta;
      }

      // Smooth pointer parallax on hero elements (never fights OrbitControls camera)
      smoothPointerX = THREE.MathUtils.damp(smoothPointerX, pointerX, 5.5, delta);
      smoothPointerY = THREE.MathUtils.damp(smoothPointerY, pointerY, 5.5, delta);

      // Lively 3D showcase levitation & dynamic wrist-swing poise on the racket
      resources.racketGroup.position.x = -0.62 + Math.sin(simTime * 0.85) * 0.18;
      resources.racketGroup.position.y = 1.72 + Math.sin(simTime * 1.65) * 0.14;
      resources.racketGroup.rotation.x = -0.22 + Math.sin(simTime * 1.1) * 0.12 + smoothPointerY * 0.06;
      resources.racketGroup.rotation.y = 0.46 + Math.sin(simTime * 0.95) * 0.32 + smoothPointerX * 0.1;
      resources.racketGroup.rotation.z = 0.24 + Math.cos(simTime * 1.15) * 0.14;

      // Cross-court 3D rally trajectory soaring over the net with crisp court bounces
      const rallyPhase = (simTime * 0.48) % 2;
      const shotProgress = rallyPhase % 1;
      const courtSpan = rallyPhase < 1 ? shotProgress : 1 - shotProgress;
      const ballZ = -2.65 + courtSpan * 5.3;
      const ballX = (courtSpan - 0.5) * 1.9 + Math.sin(rallyPhase * Math.PI) * 0.38;

      const groundContactY = 0.535;
      const hitHeight = 1.15;
      const bounceU = 0.78;
      let ballHeight: number;
      if (shotProgress <= bounceU) {
        const tA = shotProgress / bounceU;
        ballHeight =
          groundContactY +
          (1 - tA) * (hitHeight - groundContactY) +
          4 * tA * (1 - tA) * 0.72;
      } else {
        const tB = (shotProgress - bounceU) / (1 - bounceU);
        const reboundEase = 1 - (1 - tB) * (1 - tB);
        ballHeight = groundContactY + reboundEase * (hitHeight - groundContactY);
      }

      resources.ballGroup.position.set(ballX, ballHeight, ballZ);
      resources.ballGroup.rotation.x = simTime * 3.4;
      resources.ballGroup.rotation.z = simTime * 2.1;

      // Squash/stretch crisply at court bounce impact
      const impactDist = Math.abs(shotProgress - bounceU);
      const impactProximity = Math.max(0, 1 - impactDist / 0.06);
      const squashY = 1 - impactProximity * 0.12;
      const stretchXZ = 1 + impactProximity * 0.065;
      resources.ballGroup.scale.set(stretchXZ, squashY, stretchXZ);

      // Sync contact shadow position, size & opacity across the court
      resources.ballShadow.position.x = ballX;
      resources.ballShadow.position.z = ballZ;
      const normalizedElevation = Math.min(1, Math.max(0, (ballHeight - groundContactY) / 1.1));
      const shadowScale = 0.5 + (1 - normalizedElevation) * 0.6;
      resources.ballShadow.scale.setScalar(shadowScale);
      const shadowMat = resources.ballShadow.material as THREE.MeshBasicMaterial;
      shadowMat.opacity = 0.15 + (1 - normalizedElevation) * 0.48;

      // Visible architectural orbital ring rotation & breathing tilt
      resources.orbitalRing.rotation.z = simTime * 0.36;
      resources.orbitalRing.rotation.x =
        Math.PI / 2.25 + Math.sin(simTime * 0.7) * 0.08 + smoothPointerY * 0.05;

      // Smooth damped camera preset transition (cancels on arrival or user drag)
      if (transitioning) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, goalPos.x, 5.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, goalPos.y, 5.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, goalPos.z, 5.5, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, goalTarget.x, 5.5, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, goalTarget.y, 5.5, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, goalTarget.z, 5.5, delta);
        if (
          camera.position.distanceTo(goalPos) < 0.015 &&
          controls.target.distanceTo(goalTarget) < 0.015
        ) {
          camera.position.copy(goalPos);
          controls.target.copy(goalTarget);
          transitioning = false;
        }
      }

      controls.autoRotate = !pausedRef.current && !transitioning && presetRef.current === 'overview';
      controls.update(delta);
      renderer.render(scene, camera);
      afterDraw(tick);
    };

    tick();

    return () => {
      disposed = true;
      transitionFnRef.current = null;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      controls.dispose();
      for (const item of resources.disposables) {
        item.dispose();
      }
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleSelectPreset = (id: CameraPresetId) => {
    setActivePreset(id);
    transitionFnRef.current?.(id);
  };

  return (
    <>
      <div
        ref={mountRef}
        className="access-canvas"
        aria-hidden="true"
        data-webgl={webglReady ? 'ready' : 'fallback'}
      />
      <div className="access-scene-badge">
        <strong>باشگاه تنیس سام</strong>
        <p>سامانهٔ مدیریت باشگاه</p>
      </div>
      <div className="access-scene-controls" dir="rtl">
        <button
          type="button"
          className="access-scene-toggle"
          aria-expanded={dockOpen}
          onClick={() => setDockOpen((open) => !open)}
        >
          {dockOpen ? 'بستن نمایه' : 'نمای سه‌بعدی'}
        </button>
        {dockOpen ? (
          <div className="access-scene-dock" role="toolbar" aria-label="کنترل نمای سه‌بعدی">
            {CAMERA_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={
                  activePreset === preset.id
                    ? 'access-scene-btn is-active'
                    : 'access-scene-btn'
                }
                aria-pressed={activePreset === preset.id}
                onClick={() => handleSelectPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
            <span className="access-scene-divider" aria-hidden="true" />
            <button
              type="button"
              className="access-scene-btn"
              aria-pressed={isPaused}
              onClick={() => setIsPaused((prev) => !prev)}
            >
              {isPaused ? 'پخش' : 'توقف'}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
