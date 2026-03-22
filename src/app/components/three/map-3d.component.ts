// map-3d.component.ts
import {
  AfterViewInit, Component, ElementRef, inject, NgZone, OnDestroy, ViewChild, effect
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GameStateService } from '../../services/game-state.service';
import { Cell } from '../../models/map.model';

const TILE   = 1;
const RADIUS = 20;

@Component({
  selector: 'app-map-3d',
  standalone: true,
  template: `
    <canvas #canvas class="canvas3d"></canvas>
    <div class="hud">
      <div class="compass" title="Cap du navire" aria-hidden="true">
        <span class="rose-n">N</span>
        <div class="needle" #compassNeedle></div>
        <div class="compass-ring"></div>
      </div>
      <div class="hud-top-left">
        <div class="daynight" role="group" aria-label="Éclairage jour et nuit">
          <span class="dn-label">Temps</span>
          <button type="button" class="dn-btn" (click)="setDayNightMode('cycle')">Cycle auto</button>
          <button type="button" class="dn-btn" (click)="setDayNightMode('day')">Jour</button>
          <button type="button" class="dn-btn dn-btn-night" (click)="setDayNightMode('night')">Nuit + lampe</button>
        </div>
      </div>
      <div class="hud-badge" aria-hidden="true">
        <span class="hud-title">3026</span>
        <span class="hud-sub">Navigation tactique · Mer ouverte</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block; width: 720px; height: 528px; position: relative;
      background: linear-gradient(165deg, #0d2840 0%, #1a4a6e 40%, #0a1a28 100%);
      border-radius: 6px;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
    }
    .canvas3d { width: 100%; height: 100%; display: block; border-radius: 4px; vertical-align: middle; }
    .hud {
      position: absolute; inset: 0; pointer-events: none;
      display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between;
      padding: 12px 14px;
    }
    .hud-top-left {
      position: absolute; top: 12px; left: 14px; pointer-events: auto;
    }
    .daynight {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      padding: 8px 10px; border-radius: 10px;
      background: rgba(8, 20, 40, 0.72);
      border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(8px);
      max-width: min(100%, 280px);
    }
    .dn-label {
      width: 100%; font: 600 10px/1.2 ui-sans-serif, system-ui, sans-serif;
      color: rgba(200, 230, 255, .75); text-transform: uppercase; letter-spacing: .08em;
    }
    .dn-btn {
      cursor: pointer; border: 1px solid rgba(255,255,255,.2);
      background: rgba(255,255,255,.08); color: rgba(240, 248, 255, .92);
      font: 500 12px/1 ui-sans-serif, system-ui, sans-serif;
      padding: 6px 10px; border-radius: 8px;
      transition: background .15s, border-color .15s;
    }
    .dn-btn:hover { background: rgba(255,255,255,.16); border-color: rgba(255,255,255,.35); }
    .dn-btn-night { border-color: rgba(255, 200, 120, .35); color: #ffe8c8; }
    .dn-btn-night:hover { background: rgba(255, 180, 80, .15); }
    .compass {
      position: relative; width: 72px; height: 72px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.12), rgba(10,30,50,.85));
      border: 2px solid rgba(255,255,255,.25);
      box-shadow: 0 4px 24px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.15);
    }
    .compass-ring {
      position: absolute; inset: 6px; border-radius: 50%;
      border: 1px dashed rgba(255,255,255,.12);
    }
    .rose-n {
      position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
      font: 600 11px/1 system-ui, sans-serif; color: rgba(255,200,120,.95);
      text-shadow: 0 1px 2px rgba(0,0,0,.6);
    }
    .needle {
      position: absolute; left: 50%; top: 50%; width: 4px; height: 26px;
      margin: -26px -2px 0; transform-origin: 50% 100%;
      background: linear-gradient(180deg, #ff4d4d 0%, #b00000 55%, #1a1a1a 55%, #1a1a1a 100%);
      border-radius: 2px 2px 0 0;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.5));
    }
    .hud-badge {
      text-align: right; color: rgba(230,240,255,.88);
      text-shadow: 0 1px 4px rgba(0,0,0,.55);
    }
    .hud-title {
      display: block; font: 700 22px/1.1 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0.12em;
      color: #7dd3fc;
    }
    .hud-sub {
      display: block; margin-top: 4px; font: 500 11px/1.3 ui-sans-serif, system-ui, sans-serif;
      opacity: .75; max-width: 220px;
    }
  `],
})
export class Map3dComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('compassNeedle') private compassNeedleRef?: ElementRef<HTMLDivElement>;

  private readonly game      = inject(GameStateService);
  private readonly zone      = inject(NgZone);

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private animId = 0;

  private sandMesh?: THREE.InstancedMesh;
  private boatGroup?: THREE.Group;
  private readonly islandsRoot = new THREE.Group();
  private waterMesh?: THREE.Mesh;
  private waterMat?: THREE.ShaderMaterial;

  private sky?: Sky;
  private sunDirection = new THREE.Vector3();
  private pmremGenerator?: THREE.PMREMGenerator;
  private envRenderTarget?: THREE.WebGLRenderTarget;

  private currentBoatX = 0;
  private currentBoatY = 0;
  private lastShipGridX?: number;
  private lastShipGridY?: number;
  /**
   * Cap (rad) autour de Y : la coque est modélisée le long de +X local.
   * Grille jeu : +x = E, +y grille = S (voir game-map lastMoveDir). Monde 3D : (x, z) = (grille.x, grille.y).
   * On veut +X bateau // (dx, dz), ce qui donne θ = atan2(-dz, dx) avec la matrice Ry de Three.js.
   */
  private boatHeadingTarget = 0;
  private boatYawSmooth = 0;
  /** Impulsions après un déplacement (tangage / gîte) */
  private moveSurge = 0;
  private turnBankImpulse = 0;

  private readonly fishRoot = new THREE.Group();
  private fishPool: Array<{
    group: THREE.Group;
    phase: number;
    radius: number;
    ang: number;
    cycle: number;
    tailFork?: THREE.Group;
  }> = [];

  private readonly seagullsRoot = new THREE.Group();
  private gulls: Array<{
    root: THREE.Group;
    wingL: THREE.Object3D;
    wingR: THREE.Object3D;
    head?: THREE.Object3D;
    phase: number;
    radius: number;
    height: number;
    speed: number;
  }> = [];

  private captainRoot?: THREE.Group;
  private captainHead?: THREE.Group;

  private readonly buoysRoot = new THREE.Group();
  private buoys: THREE.Group[] = [];

  private bowSpray?: THREE.Points;

  private hemiLight!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private cabinLamp?: THREE.SpotLight;
  private lampGlow?: THREE.Mesh;
  private stars?: THREE.Points;

  /** 0 = plein jour, 1 = nuit (lissé) */
  private dayNightPhase = 0;
  /** null = cycle automatique sinusoïdal ; true/false = forcé */
  private dayNightMode: 'cycle' | 'day' | 'night' = 'cycle';

  private readonly colDayFog = new THREE.Color(0xb8d4f0);
  private readonly colNightFog = new THREE.Color(0x050a18);
  private readonly colDayClear = new THREE.Color(0x3d6f9a);
  private readonly colNightClear = new THREE.Color(0x020510);
  private readonly colHemiSkyDay = new THREE.Color(0xc8e8ff);
  private readonly colHemiSkyNight = new THREE.Color(0x1c2840);
  private readonly colHemiGrdDay = new THREE.Color(0x4a3c28);
  private readonly colHemiGrdNight = new THREE.Color(0x0a0806);

  // Three.js n'est prêt qu'après ngAfterViewInit
  private threeReady = false;

  /** UI : cycle auto, jour forcé, ou nuit (+ lampe bateau) */
  setDayNightMode(mode: 'cycle' | 'day' | 'night'): void {
    this.dayNightMode = mode;
  }

  constructor() {
    // effect() DOIT être dans le constructeur (injection context)
    effect(() => {
      const cells = this.game.knownCells();
      const ship  = this.game.ship();
      if (!this.threeReady) return; // attendre l'init Three.js
      this.zone.runOutsideAngular(() => this.rebuild(cells, ship));
    });
  }

  ngAfterViewInit(): void {
    this.initRenderer();
    this.initScene();
    this.startLoop();
    // Three.js prêt — l'effect réagira aux prochains changements de signals
    this.threeReady = true;
    // Premier rendu immédiat avec l'état courant
    this.zone.runOutsideAngular(() =>
      this.rebuild(this.game.knownCells(), this.game.ship())
    );
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.animId);
    this.controls?.dispose();
    if (this.scene) this.scene.environment = null;
    this.envRenderTarget?.dispose();
    this.pmremGenerator?.dispose();
    this.renderer?.dispose();
    this.disposeScene();
  }

  // ── Renderer / Camera ──────────────────────────────────────────────────

  private initRenderer(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const pr = Math.min(devicePixelRatio, 2.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x3d6f9a, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
  }

  private initScene(): void {
    this.scene = new THREE.Scene();

    const canvas = this.canvasRef.nativeElement;
    this.camera = new THREE.PerspectiveCamera(48, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
    this.camera.position.set(0, 10.5, 12.5);

    // Soleil (élévation ~32°, azimut sud-ouest)
    const elevation = THREE.MathUtils.degToRad(32);
    const azimuth = THREE.MathUtils.degToRad(-42);
    this.sunDirection.set(
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation)
    ).normalize();

    // Ciel atmosphérique (Preetham)
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    const skyU = this.sky.material.uniforms;
    skyU['turbidity'].value = 6;
    skyU['rayleigh'].value = 2.2;
    skyU['mieCoefficient'].value = 0.0045;
    skyU['mieDirectionalG'].value = 0.76;
    skyU['sunPosition'].value.copy(this.sunDirection);
    this.scene.add(this.sky);

    this.scene.fog = new THREE.FogExp2(0xb8d4f0, 0.0105);

    this.hemiLight = new THREE.HemisphereLight(0xc8e8ff, 0x4a3c28, 0.42);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4e6, 3.2);
    this.dirLight.position.copy(this.sunDirection).multiplyScalar(120);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(3072, 3072);
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 220;
    this.dirLight.shadow.camera.left = -36;
    this.dirLight.shadow.camera.right = 36;
    this.dirLight.shadow.camera.top = 36;
    this.dirLight.shadow.camera.bottom = -36;
    this.dirLight.shadow.bias = -0.00022;
    this.dirLight.shadow.normalBias = 0.028;
    this.dirLight.shadow.radius = 3;
    this.scene.add(this.dirLight);

    this.bakeEnvironmentMap();

    this.createWaterSurface();
    this.createStarfield();

    this.islandsRoot.name = 'islands';
    this.scene.add(this.islandsRoot);

    this.createFishSchool();
    this.createMarineAmbience();

    // Contrôles
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 42;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** Carte d'environnement (reflets eau / coque) à partir du même modèle de ciel */
  private bakeEnvironmentMap(): void {
    const envScene = new THREE.Scene();
    const skyEnv = new Sky();
    skyEnv.scale.setScalar(450000);
    const u = skyEnv.material.uniforms;
    u['turbidity'].value = 6;
    u['rayleigh'].value = 2.2;
    u['mieCoefficient'].value = 0.0045;
    u['mieDirectionalG'].value = 0.76;
    u['sunPosition'].value.copy(this.sunDirection);
    envScene.add(skyEnv);

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget?.dispose();
    this.envRenderTarget = this.pmremGenerator.fromScene(envScene, 0, 0.1, 1e6);
    this.scene.environment = this.envRenderTarget.texture;

    skyEnv.traverse(obj => {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(mm => mm.dispose());
    });
  }

  /** Océan continu (plus de tuiles séparées / traits blancs) */
  private createWaterSurface(): void {
    const extent = (RADIUS * 2 + 14) * TILE;
    const geo = new THREE.PlaneGeometry(extent, extent, 168, 168);
    const fog = this.scene.fog as THREE.FogExp2;
    const fogCol = new THREE.Color(fog?.color ?? 0xb8d4f0);

    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 0 },
        uSunDir: { value: this.sunDirection.clone() },
        uCam: { value: new THREE.Vector3() },
        uFogCol: { value: new THREE.Vector3(fogCol.r, fogCol.g, fogCol.b) },
        uFogD: { value: fog?.density ?? 0.011 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWp;
        varying vec3 vN;
        varying float vFm;
        void main() {
          vec3 p = position;
          float wx = p.x;
          float wy = p.y;
          float t = uTime;
          float w = sin(wx * 1.12 + t * 1.65) * cos(wy * 0.82 + t * 0.52) * 0.062;
          w += sin(wx * 2.25 - wy * 1.18 + t * 2.0) * 0.036;
          w += sin((wx + wy) * 0.68 + t * 1.05) * 0.022;
          vec3 dp = p + normal * w;
          float cr = sin(wx * 1.12 + t * 1.65) * cos(wy * 0.82 + t * 0.52);
          vFm = smoothstep(0.72, 0.98, cr * 0.5 + 0.5) * 0.42;
          vFm += smoothstep(0.08, 0.28, abs(w)) * 0.22;
          vec4 wpos = modelMatrix * vec4(dp, 1.0);
          vWp = wpos.xyz;
          vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(dp, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform float uNight;
        uniform vec3 uSunDir;
        uniform vec3 uCam;
        uniform vec3 uFogCol;
        uniform float uFogD;
        varying vec3 vWp;
        varying vec3 vN;
        varying float vFm;
        void main() {
          vec3 vd = normalize(uCam - vWp);
          vec3 n = normalize(vN);
          float ndv = max(dot(n, vd), 0.001);
          float fr = pow(1.0 - ndv, 2.35);
          vec3 deep = mix(vec3(0.015, 0.11, 0.30), vec3(0.002, 0.04, 0.12), uNight);
          vec3 mid  = mix(vec3(0.04, 0.36, 0.52), vec3(0.02, 0.12, 0.22), uNight);
          vec3 shal = mix(vec3(0.16, 0.58, 0.68), vec3(0.04, 0.18, 0.28), uNight);
          vec3 c = mix(deep, mid, fr * 0.62 + 0.14);
          c = mix(c, shal, fr * fr * 0.38);
          vec3 sun = normalize(uSunDir);
          vec3 h = normalize(sun + vd);
          float daySpec = mix(1.0, 0.08, uNight);
          float sp = pow(max(dot(n, h), 0.0), 96.0) * 0.58 * daySpec;
          c += vec3(1.0, 0.95, 0.88) * sp;
          float glint = pow(max(dot(n, sun), 0.0), 220.0);
          float tw = sin(vWp.x * 5.0 + vWp.z * 3.0 + uTime * 2.8) * 0.5 + 0.5;
          c += vec3(1.0, 0.98, 0.92) * glint * 0.22 * (0.35 + 0.65 * tw) * (0.4 + 0.6 * fr) * daySpec;
          c += vec3(0.28, 0.72, 0.88) * fr * 0.22 * mix(1.0, 0.35, uNight);
          c = mix(c, vec3(0.93, 0.97, 1.0), clamp(vFm, 0.0, 1.0) * (1.0 - uNight * 0.55));
          float d = length(uCam - vWp);
          float fg = 1.0 - exp(-uFogD * d * d * 0.000018);
          c = mix(c, uFogCol, clamp(fg, 0.0, 0.78));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });

    this.waterMesh = new THREE.Mesh(geo, this.waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = -0.07;
    this.waterMesh.receiveShadow = false;
    this.waterMesh.renderOrder = -2;
    this.scene.add(this.waterMesh);
  }

  /** Voûte étoilée (visible la nuit, points doux anti-alias perception) */
  private createStarfield(): void {
    const n = 320;
    const pos = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const th = Math.acos(1 - 2 * u) * 0.48;
      const ph = v * Math.PI * 2;
      const r = 620 + Math.random() * 180;
      pos[i * 3] = r * Math.sin(th) * Math.cos(ph);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(th)) + 80;
      pos[i * 3 + 2] = r * Math.sin(th) * Math.sin(ph);
      sizes[i] = 0.35 + Math.random() * 0.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNight: { value: 0 }, uPixelRatio: { value: Math.min(devicePixelRatio, 2.5) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aScale;
        uniform float uPixelRatio;
        varying float vA;
        void main() {
          vA = 1.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aScale * uPixelRatio * (300.0 / max(-mv.z, 1.0)), 1.0, 64.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uNight;
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float d = length(q);
          float a = smoothstep(1.0, 0.2, d) * uNight * 0.85;
          gl_FragColor = vec4(mix(vec3(0.85, 0.92, 1.0), vec3(0.7, 0.85, 1.0), d), a);
        }
      `,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.name = 'stars';
    this.scene.add(this.stars);
  }

  /**
   * Poisson « type maquereau » : fuselage fuselé, tête, yeux, nageoires pectorales,
   * dorsale, queue fourchue — matériaux PBR différenciés.
   */
  private buildLifeLikeFish(variant: number): { group: THREE.Group; tailFork: THREE.Group } {
    const g = new THREE.Group();
    const hue = 0.52 + (variant % 4) * 0.028;
    const matBack = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(hue, 0.42, 0.38),
      roughness: 0.18,
      metalness: 0.07,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.05,
    });
    const matBelly = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(hue, 0.12, 0.74),
      roughness: 0.32,
      metalness: 0.02,
      envMapIntensity: 0.72,
    });
    const matFin = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(hue, 0.38, 0.32),
      roughness: 0.28,
      metalness: 0.04,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
      envMapIntensity: 0.65,
    });

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.024, 0.24, 16, 3, false),
      matBack
    );
    trunk.rotation.z = Math.PI / 2;
    trunk.position.x = 0.02;
    trunk.scale.set(1, 0.78, 1);
    trunk.castShadow = true;
    g.add(trunk);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      matBelly
    );
    belly.rotation.z = Math.PI / 2;
    belly.position.set(0.02, -0.032, 0);
    belly.scale.set(1.15, 0.55, 1.05);
    g.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), matBack);
    head.position.set(0.14, 0.008, 0);
    head.scale.set(1.1, 0.88, 0.92);
    head.castShadow = true;
    g.add(head);

    const eyeW = new THREE.MeshStandardMaterial({ color: 0xf8fcff, roughness: 0.12, metalness: 0.05 });
    const eyeB = new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.2 });
    for (const z of [-0.022, 0.022]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), eyeW);
      ew.position.set(0.152, 0.018, z);
      g.add(ew);
      const eb = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), eyeB);
      eb.position.set(0.162, 0.018, z * 1.05);
      g.add(eb);
    }

    const dorsal = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.045, 0.012, 2, 2, 1),
      matFin
    );
    dorsal.position.set(-0.02, 0.065, 0);
    dorsal.rotation.z = -0.15;
    g.add(dorsal);

    const pecL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.05, 2, 1, 2), matFin);
    pecL.position.set(0.04, -0.02, 0.06);
    pecL.rotation.set(0.25, 0, 0.35);
    g.add(pecL);
    const pecR = pecL.clone();
    pecR.position.z = -0.06;
    pecR.rotation.x = -0.25;
    pecR.rotation.z = -0.35;
    g.add(pecR);

    const tailFork = new THREE.Group();
    tailFork.position.set(-0.14, 0, 0);
    const lobeL = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.11, 8), matFin);
    lobeL.rotation.set(0, 0, Math.PI / 2 + 0.35);
    lobeL.position.set(-0.05, 0, 0.035);
    tailFork.add(lobeL);
    const lobeR = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.11, 8), matFin);
    lobeR.rotation.set(0, 0, Math.PI / 2 - 0.35);
    lobeR.position.set(-0.05, 0, -0.035);
    tailFork.add(lobeR);
    g.add(tailFork);

    g.scale.setScalar(1.18 + (variant % 3) * 0.06);
    return { group: g, tailFork };
  }

  private createFishSchool(): void {
    for (let i = 0; i < 8; i++) {
      const { group: g, tailFork } = this.buildLifeLikeFish(i);
      g.visible = false;
      this.fishRoot.add(g);
      this.fishPool.push({
        group: g,
        phase: i * 1.23 + 0.41,
        radius: 3.2 + (i % 5) * 1.15,
        ang: (i / 8) * Math.PI * 2,
        cycle: 5.1 + (i % 4) * 1.5,
        tailFork,
      });
    }
    this.fishRoot.name = 'fish';
    this.scene.add(this.fishRoot);
  }

  /**
   * Mouette : corps profilé, cou, tête, bec, yeux, ailes épaisses, queue, pattes.
   */
  private buildLifeLikeGull(seed: number): {
    root: THREE.Group;
    wingL: THREE.Object3D;
    wingR: THREE.Object3D;
    head: THREE.Group;
  } {
    const root = new THREE.Group();
    const plum = new THREE.MeshPhysicalMaterial({
      color: 0xece8e0,
      roughness: 0.38,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color(0xffffff),
      envMapIntensity: 0.62,
    });
    const wingM = new THREE.MeshPhysicalMaterial({
      color: 0xd9d3c8,
      roughness: 0.42,
      metalness: 0,
      side: THREE.DoubleSide,
      sheen: 0.35,
      sheenRoughness: 0.65,
      envMapIntensity: 0.5,
    });
    const beakMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.4,
      envMapIntensity: 0.45,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.35 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.082, 18, 14), plum);
    body.scale.set(1.08, 0.68, 1.42);
    body.position.x = 0.015;
    body.castShadow = true;
    root.add(body);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.046, 0.09, 12, 2), plum);
    neck.rotation.z = Math.PI / 2.25;
    neck.position.set(0.095, 0.038, 0);
    root.add(neck);

    const head = new THREE.Group();
    head.position.set(0.168, 0.065, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 12), plum);
    skull.castShadow = true;
    head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.058, 10), beakMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.042, -0.006, 0);
    head.add(beak);
    for (const z of [-0.024, 0.024]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), dark);
      eye.position.set(0.024, 0.014, z);
      head.add(eye);
    }
    root.add(head);

    const wingL = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.022, 0.15, 4, 1, 3),
      wingM
    );
    wingL.position.set(-0.015, 0.048, 0.15);
    wingL.rotation.set(0.32, 0.08, 0.12);
    wingL.castShadow = true;
    root.add(wingL);
    const wingR = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.022, 0.15, 4, 1, 3),
      wingM
    );
    wingR.position.set(-0.015, 0.048, -0.15);
    wingR.rotation.set(-0.32, -0.08, -0.12);
    wingR.castShadow = true;
    root.add(wingR);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 6), wingM);
    tail.rotation.x = Math.PI / 2;
    tail.rotation.z = Math.PI;
    tail.position.set(-0.12, 0.02, 0);
    root.add(tail);

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.055, 6, 1), dark);
    legL.position.set(-0.02, -0.055, 0.04);
    root.add(legL);
    const legR = legL.clone();
    legR.position.z = -0.04;
    root.add(legR);

    root.scale.multiplyScalar(0.98 + (seed % 3) * 0.04);
    return { root, wingL, wingR, head };
  }

  /** Mouettes, bouées de balisage — ambiance « démo premium » */
  private createMarineAmbience(): void {
    for (let i = 0; i < 8; i++) {
      const { root, wingL, wingR, head } = this.buildLifeLikeGull(i);
      this.seagullsRoot.add(root);
      this.gulls.push({
        root,
        wingL,
        wingR,
        head,
        phase: i * 0.91,
        radius: 10.5 + (i % 5) * 1.35,
        height: 5.0 + (i % 4) * 0.55,
        speed: 0.22 + (i % 6) * 0.016,
      });
    }
    this.seagullsRoot.name = 'seagulls';
    this.scene.add(this.seagullsRoot);

    const red = new THREE.MeshStandardMaterial({
      color: 0xc41e3a,
      roughness: 0.48,
      metalness: 0.12,
      envMapIntensity: 0.35,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.42,
      envMapIntensity: 0.3,
    });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.34, 10), red);
      stem.position.y = 0.1;
      stem.castShadow = true;
      b.add(stem);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 20), white);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.22;
      b.add(ring);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white);
      top.position.y = 0.3;
      top.castShadow = true;
      b.add(top);
      const ang = (i / 6) * Math.PI * 2 + 0.35;
      b.position.set(Math.cos(ang) * 15.8, 0.1, Math.sin(ang) * 15.8);
      b.userData['bob'] = i * 1.17;
      this.buoysRoot.add(b);
      this.buoys.push(b);
    }
    this.buoysRoot.name = 'buoys';
    this.scene.add(this.buoysRoot);
  }

  /**
   * Capitaine : veste de pont bleu nuit, col blanc, boutons dorés, képi, barbe,
   * posture vers la barre, mains près du timon (léger balancement synchronisé à la mer).
   */
  private attachCaptainFigure(boat: THREE.Group): void {
    const cap = new THREE.Group();
    cap.position.set(-0.318, 0.198, 0.055);
    cap.rotation.y = 1.02;

    const coat = new THREE.MeshPhysicalMaterial({
      color: 0x132a45,
      roughness: 0.52,
      metalness: 0.06,
      envMapIntensity: 0.58,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xc7906e,
      roughness: 0.58,
      envMapIntensity: 0.42,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.9,
      roughness: 0.26,
      envMapIntensity: 0.85,
    });
    const linen = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.48,
      envMapIntensity: 0.35,
    });
    const boot = new THREE.MeshStandardMaterial({
      color: 0x151820,
      roughness: 0.42,
      metalness: 0.15,
      envMapIntensity: 0.35,
    });
    const hat = new THREE.MeshStandardMaterial({
      color: 0x0f1a28,
      roughness: 0.48,
      envMapIntensity: 0.4,
    });

    for (const z of [-0.042, 0.042]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.039, 0.1, 12, 1), coat);
      leg.position.set(0.02, 0.06, z);
      leg.castShadow = true;
      cap.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.075, 2, 1, 2), boot);
      foot.position.set(0.03, 0.012, z);
      foot.castShadow = true;
      cap.add(foot);
    }

    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.17, 0.1, 4, 0.018), coat);
    torso.position.set(0.02, 0.185, 0);
    torso.castShadow = true;
    cap.add(torso);

    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), gold);
      btn.position.set(0.068, 0.14 + i * 0.034, 0);
      cap.add(btn);
    }

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.028, 0.11, 2, 1, 2), linen);
    collar.position.set(0.045, 0.252, 0);
    cap.add(collar);

    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), coat);
    shoulderL.position.set(0.01, 0.255, 0.058);
    cap.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.z = -0.058;
    cap.add(shoulderR);
    const epuL = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12), gold);
    epuL.rotation.y = Math.PI / 2;
    epuL.position.set(0.01, 0.268, 0.058);
    cap.add(epuL);
    const epuR = epuL.clone();
    epuR.position.z = -0.058;
    cap.add(epuR);

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.13, 10, 1), coat);
    armL.position.set(0.04, 0.21, 0.095);
    armL.rotation.set(-0.55, 0, -0.55);
    armL.castShadow = true;
    cap.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.13, 10, 1), coat);
    armR.position.set(0.04, 0.21, -0.095);
    armR.rotation.set(0.55, 0, -0.55);
    armR.castShadow = true;
    cap.add(armR);

    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), skin);
    handL.position.set(-0.055, 0.2, 0.118);
    cap.add(handL);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), skin);
    handR.position.set(-0.055, 0.2, -0.118);
    cap.add(handR);

    const headG = new THREE.Group();
    headG.position.set(0.055, 0.288, 0);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.054, 20, 16), skin);
    face.castShadow = true;
    headG.add(face);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), skin);
    nose.position.set(0.048, -0.006, 0);
    headG.add(nose);

    const eyeW = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2 });
    const eyeP = new THREE.MeshStandardMaterial({ color: 0x151820, roughness: 0.25 });
    for (const z of [-0.02, 0.02]) {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), eyeW);
      ew.position.set(0.042, 0.016, z);
      headG.add(ew);
      const ep = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 6, 6), eyeP);
      ep.position.set(0.05, 0.016, z * 1.05);
      headG.add(ep);
    }

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.009, 0.038), boot);
    brow.position.set(0.045, 0.032, 0);
    headG.add(brow);

    const beard = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.82 })
    );
    beard.position.set(0.012, -0.042, 0);
    beard.scale.set(1.15, 0.75, 1.05);
    headG.add(beard);

    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.014, 20, 1), hat);
    hatBrim.position.y = 0.052;
    headG.add(hatBrim);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.05, 18, 1), hat);
    hatTop.position.y = 0.078;
    headG.add(hatTop);
    const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.007, 6, 20), gold);
    hatBand.rotation.x = Math.PI / 2;
    hatBand.position.y = 0.06;
    headG.add(hatBand);

    cap.add(headG);

    this.captainRoot = cap;
    this.captainHead = headG;
    boat.add(cap);
  }

  /** Embruns à l’étrave (particules additives, suit le navire) */
  private attachBowSpray(boat: THREE.Group): void {
    const n = 96;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb8e8ff,
      size: 0.072,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.bowSpray = new THREE.Points(geo, mat);
    this.bowSpray.position.set(0.58, 0.1, 0);
    this.bowSpray.name = 'bowSpray';
    boat.add(this.bowSpray);
  }

  // ── Rebuild des tuiles à chaque changement ────────────────────────────

  private rebuild(cellsMap: Map<string, Cell>, ship: { currentPosition?: Cell } | null): void {
    // Déterminer la position du bateau
    const bx = ship?.currentPosition?.x ?? this.currentBoatX;
    const by = ship?.currentPosition?.y ?? this.currentBoatY;

    if (
      this.lastShipGridX !== undefined &&
      this.lastShipGridY !== undefined &&
      (bx !== this.lastShipGridX || by !== this.lastShipGridY)
    ) {
      const dx = bx - this.lastShipGridX;
      const dz = by - this.lastShipGridY;
      if (dx !== 0 || dz !== 0) {
        const newH = Math.atan2(-dz, dx);
        let dAng = newH - this.boatHeadingTarget;
        while (dAng > Math.PI) dAng -= Math.PI * 2;
        while (dAng < -Math.PI) dAng += Math.PI * 2;
        this.turnBankImpulse = THREE.MathUtils.clamp(dAng * 0.52, -0.44, 0.44);
        this.boatHeadingTarget = newH;
        this.moveSurge = THREE.MathUtils.clamp(this.moveSurge + 0.95, 0, 1);
      }
    }
    this.lastShipGridX = bx;
    this.lastShipGridY = by;
    this.currentBoatX = bx;
    this.currentBoatY = by;

    const playerCell = ship?.currentPosition;
    const playerOnIslandBeach =
      playerCell?.type === 'SAND' && playerCell?.island != null;

    // Filtrer les cellules dans le rayon
    const allCells = Array.from(cellsMap.values());
    const visible = allCells.filter(c => {
      const dx = c.x - bx;
      const dy = c.y - by;
      return Math.abs(dx) <= RADIUS && Math.abs(dy) <= RADIUS;
    });

    // Supprimer les anciennes tuiles
    this.clearTiles();

    const sand = visible.filter(c => c.type === 'SAND');

    // Sable uniquement : tuiles légèrement chevauchées = plus de « traits blancs » entre cases
    const geo = new THREE.BoxGeometry(TILE * 1.004, 0.2, TILE * 1.004);

    if (sand.length > 0) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0,
        envMapIntensity: 0.45,
        vertexColors: true,
      });
      this.sandMesh = this.createInstanced(geo, mat, sand, bx, by, 0.11, 'sand');
      this.scene.add(this.sandMesh);
    }

    // Îles : relief + végétation (+ mise en avant si le joueur est sur cette case)
    for (const c of sand) {
      if (!c.island) continue;
      const hero =
        playerOnIslandBeach && c.x === bx && c.y === by;
      const g = this.buildIslandDecoration(c, bx, by, hero);
      this.islandsRoot.add(g);
    }

    // Construire ou déplacer le bateau
    this.updateBoat(0, 0); // le bateau est toujours au centre en relatif

    // Recentrer la caméra
    this.controls.target.set(0, 0, 0);
  }

  private createInstanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    cells: Cell[],
    originX: number,
    originY: number,
    yOffset: number,
    colorVariation?: 'sand'
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.receiveShadow = true;
    mesh.castShadow = false;

    const colors = new Float32Array(cells.length * 3);
    if (colorVariation === 'sand') {
      for (let i = 0; i < cells.length; i++) {
        const t = 0.9 + Math.random() * 0.1;
        colors[i * 3] = 0.93 * t;
        colors[i * 3 + 1] = 0.82 * t;
        colors[i * 3 + 2] = 0.58 * t;
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    }

    const dummy = new THREE.Object3D();
    cells.forEach((c, i) => {
      dummy.position.set((c.x - originX) * TILE, yOffset, (c.y - originY) * TILE);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ── Bateau 3D ─────────────────────────────────────────────────────────

  private updateBoat(rx: number, rz: number): void {
    if (!this.boatGroup) {
      this.boatGroup = this.createBoatModel();
      this.scene.add(this.boatGroup);
    }
    this.boatGroup.position.set(rx, 0.24, rz);
  }

  /** Voilier type cotre : coque arrondie, pont, dunette, haubans simplifiés, voile incurvée */
  private createBoatModel(): THREE.Group {
    const group = new THREE.Group();

    const wood = new THREE.MeshPhysicalMaterial({
      color: 0x5c3828,
      roughness: 0.58,
      metalness: 0.03,
      envMapIntensity: 0.62,
      clearcoat: 0.18,
      clearcoatRoughness: 0.42,
    });
    const woodDark = new THREE.MeshPhysicalMaterial({
      color: 0x3d2618,
      roughness: 0.72,
      envMapIntensity: 0.4,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xc9a06c,
      roughness: 0.45,
      metalness: 0.15,
      envMapIntensity: 0.55,
    });

    // Coque principale (pont arrondi)
    const hull = new THREE.Mesh(
      new RoundedBoxGeometry(0.78, 0.26, 0.38, 6, 0.09),
      wood
    );
    hull.position.set(-0.04, 0.08, 0);
    hull.scale.set(1, 0.85, 1);
    hull.castShadow = true;
    hull.receiveShadow = true;
    group.add(hull);

    // Étrave
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 20), wood);
    bow.rotation.z = -Math.PI / 2;
    bow.position.set(0.44, 0.08, 0);
    bow.castShadow = true;
    group.add(bow);

    // Bouchain / liste
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.014, 8, 32, Math.PI * 0.92),
      trim
    );
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = -Math.PI / 2 + 0.08;
    rail.position.set(-0.02, 0.2, 0);
    rail.castShadow = true;
    group.add(rail);

    // Pont apparent
    const deck = new THREE.Mesh(
      new RoundedBoxGeometry(0.62, 0.04, 0.32, 2, 0.02),
      woodDark
    );
    deck.position.set(-0.05, 0.2, 0);
    deck.receiveShadow = true;
    deck.castShadow = true;
    group.add(deck);

    // Dunette / cabine
    const cabin = new THREE.Mesh(
      new RoundedBoxGeometry(0.22, 0.14, 0.24, 2, 0.04),
      woodDark
    );
    cabin.position.set(-0.22, 0.28, 0);
    cabin.castShadow = true;
    group.add(cabin);
    const cabinRoof = new THREE.Mesh(
      new RoundedBoxGeometry(0.24, 0.03, 0.26, 2, 0.015),
      trim
    );
    cabinRoof.position.set(-0.22, 0.36, 0);
    cabinRoof.castShadow = true;
    group.add(cabinRoof);

    const lampBracket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.028, 0.045, 12, 1),
      new THREE.MeshStandardMaterial({ color: 0x2c2218, roughness: 0.55, metalness: 0.25 })
    );
    lampBracket.position.set(-0.22, 0.388, 0);
    group.add(lampBracket);

    this.lampGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff5e6,
        emissive: 0xff9a3c,
        emissiveIntensity: 0,
        toneMapped: false,
        roughness: 0.22,
        metalness: 0.05,
      })
    );
    this.lampGlow.position.set(-0.22, 0.412, 0);
    group.add(this.lampGlow);

    this.cabinLamp = new THREE.SpotLight(0xffd4a8, 0, 26, Math.PI / 5.2, 0.42, 1.35);
    this.cabinLamp.position.set(-0.22, 0.4, 0);
    this.cabinLamp.target.position.set(0.85, -0.05, 0);
    this.cabinLamp.castShadow = true;
    this.cabinLamp.shadow.mapSize.set(768, 768);
    this.cabinLamp.shadow.bias = -0.0001;
    this.cabinLamp.visible = false;
    group.add(this.cabinLamp);
    group.add(this.cabinLamp.target);

    // Barre (timon)
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.008, 8, 16),
      trim
    );
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-0.38, 0.26, 0);
    group.add(wheel);

    this.attachCaptainFigure(group);

    // Safran
    const rudder = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.18, 0.12),
      woodDark
    );
    rudder.position.set(-0.48, 0.06, 0);
    rudder.rotation.y = 0.12;
    rudder.castShadow = true;
    group.add(rudder);

    // Mât
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.026, 0.78, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.78, envMapIntensity: 0.35 })
    );
    mast.position.set(0.06, 0.52, 0);
    mast.castShadow = true;
    group.add(mast);

    // Haubans (câbles)
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 });
    for (let s = -1; s <= 1; s += 2) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.52, 6), ropeMat);
      cable.position.set(0.06, 0.38, s * 0.16);
      cable.rotation.z = s * 0.35;
      group.add(cable);
    }

    // Bôme
    const boom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.42, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.75 })
    );
    boom.rotation.z = Math.PI / 2;
    boom.position.set(-0.08, 0.38, 0.12);
    group.add(boom);

    // Voile (grand voile)
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.quadraticCurveTo(0.18, 0.22, 0.02, 0.52);
    sailShape.lineTo(-0.02, 0.52);
    sailShape.quadraticCurveTo(-0.12, 0.22, 0, 0);
    const sailGeo = new THREE.ShapeGeometry(sailShape);
    const sailMat = new THREE.MeshPhysicalMaterial({
      color: 0xf2eadc,
      side: THREE.DoubleSide,
      roughness: 0.86,
      metalness: 0,
      envMapIntensity: 0.28,
      sheen: 0.4,
      sheenRoughness: 0.82,
      sheenColor: new THREE.Color(0xffffff),
    });
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0.1, 0.22, 0.02);
    sail.rotation.y = Math.PI / 2;
    sail.castShadow = true;
    group.add(sail);

    // Misaine (petit triangle avant)
    const jib = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.28),
      new THREE.MeshPhysicalMaterial({
        color: 0xe8dfd0,
        side: THREE.DoubleSide,
        roughness: 0.88,
        envMapIntensity: 0.22,
        sheen: 0.25,
        sheenRoughness: 0.9,
        sheenColor: new THREE.Color(0xffffff),
      })
    );
    jib.position.set(0.32, 0.25, 0);
    jib.rotation.y = Math.PI / 2;
    jib.rotation.z = -0.25;
    jib.castShadow = true;
    group.add(jib);

    // Beaupré
    const sprit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.012, 0.35, 6),
      woodDark
    );
    sprit.rotation.z = Math.PI / 2.4;
    sprit.position.set(0.42, 0.2, 0);
    group.add(sprit);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.09),
      new THREE.MeshStandardMaterial({
        color: 0x3db892,
        side: THREE.DoubleSide,
        roughness: 0.5,
        envMapIntensity: 0.55,
      })
    );
    flag.position.set(0.06, 0.88, 0.04);
    flag.castShadow = true;
    group.add(flag);

    const wake = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      })
    );
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(-0.54, -0.09, 0);
    group.add(wake);

    group.rotation.y = 0;
    group.scale.setScalar(1.78);
    this.attachBowSpray(group);
    return group;
  }

  // ── Animation ─────────────────────────────────────────────────────────

  private time = 0;

  /** Cycle jour / nuit, ciel, brouillard, lampe dunette, étoiles */
  private updateDayNightAndLighting(): void {
    let target = 0;
    if (this.dayNightMode === 'night') target = 1;
    else if (this.dayNightMode === 'day') target = 0;
    else target = Math.sin(this.time * 0.0135) * 0.5 + 0.5;

    this.dayNightPhase += (target - this.dayNightPhase) * 0.026;
    const p = this.dayNightPhase;

    const elevDeg = THREE.MathUtils.lerp(36, -18, p);
    const elev = THREE.MathUtils.degToRad(elevDeg);
    const azimuth = THREE.MathUtils.degToRad(-42);
    this.sunDirection.set(
      Math.cos(azimuth) * Math.cos(elev),
      Math.sin(elev),
      Math.sin(azimuth) * Math.cos(elev)
    ).normalize();

    if (this.sky) {
      const u = this.sky.material.uniforms;
      u['turbidity'].value = THREE.MathUtils.lerp(5, 0.8, p);
      u['rayleigh'].value = THREE.MathUtils.lerp(2.0, 0.35, p);
      u['mieCoefficient'].value = THREE.MathUtils.lerp(0.0042, 0.002, p);
      u['mieDirectionalG'].value = THREE.MathUtils.lerp(0.76, 0.82, p);
      u['sunPosition'].value.copy(this.sunDirection);
    }

    this.dirLight.intensity = THREE.MathUtils.lerp(3.2, 0.07, p);
    this.dirLight.color.setRGB(
      THREE.MathUtils.lerp(1, 0.48, p),
      THREE.MathUtils.lerp(0.95, 0.55, p),
      THREE.MathUtils.lerp(0.88, 0.92, p)
    );
    this.dirLight.position.copy(this.sunDirection).multiplyScalar(125);

    this.hemiLight.color.copy(this.colHemiSkyDay).lerp(this.colHemiSkyNight, p);
    this.hemiLight.groundColor.copy(this.colHemiGrdDay).lerp(this.colHemiGrdNight, p);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.44, 0.065, p);

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.colDayFog).lerp(this.colNightFog, p);
    fog.density = THREE.MathUtils.lerp(0.0105, 0.0195, p);

    const clear = this.colDayClear.clone().lerp(this.colNightClear, p);
    this.renderer.setClearColor(clear);

    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.92, 0.32, Math.pow(p, 0.82));

    this.scene.environmentIntensity = THREE.MathUtils.lerp(1, 0.16, p);

    if (this.waterMat) {
      this.waterMat.uniforms['uSunDir'].value.copy(this.sunDirection);
      this.waterMat.uniforms['uFogCol'].value.set(fog.color.r, fog.color.g, fog.color.b);
      this.waterMat.uniforms['uFogD'].value = fog.density;
      this.waterMat.uniforms['uNight'].value = p;
    }

    if (this.stars) {
      const sm = this.stars.material as THREE.ShaderMaterial;
      sm.uniforms['uNight'].value = p;
    }

    const lampCurve = p * p * (3 - 2 * p);
    if (this.cabinLamp && this.lampGlow) {
      this.cabinLamp.intensity = lampCurve * 7.5;
      this.cabinLamp.visible = lampCurve > 0.04;
      (this.lampGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = lampCurve * 3.8;
    }

    this.seagullsRoot.visible = p < 0.42;
  }

  private startLoop(): void {
    const loop = () => {
      this.animId = requestAnimationFrame(loop);
      this.time += 0.016;

      this.updateDayNightAndLighting();

      if (this.waterMat) {
        this.waterMat.uniforms['uTime'].value = this.time;
        this.waterMat.uniforms['uCam'].value.copy(this.camera.position);
      }

      // Mouettes : orbite, virage léger, battement d’ailes désynchronisé, tête qui scrute l’horizon
      for (const gu of this.gulls) {
        const ang = this.time * gu.speed + gu.phase;
        const x = Math.cos(ang) * gu.radius;
        const z = Math.sin(ang) * gu.radius;
        const y = gu.height + Math.sin(this.time * 1.9 + gu.phase) * 0.45;
        gu.root.position.set(x, y, z);
        gu.root.rotation.y = ang + Math.PI / 2;
        const flap = Math.sin(this.time * 15.5 + gu.phase * 2.7);
        const asym = Math.sin(this.time * 15.5 + gu.phase * 2.7 + 0.55) * 0.14;
        gu.wingL.rotation.x = 0.32 + flap * 0.58 + asym;
        gu.wingR.rotation.x = -0.32 - flap * 0.58 + asym * 0.72;
        gu.root.rotation.x = Math.sin(this.time * 2.2 + gu.phase) * 0.075;
        gu.root.rotation.z = Math.cos(this.time * 1.6 + gu.phase * 1.3) * 0.06;
        if (gu.head) {
          gu.head.rotation.y = Math.sin(this.time * 1.12 + gu.phase) * 0.12;
          gu.head.rotation.x = Math.sin(this.time * 0.88 + gu.phase * 0.7) * 0.055;
        }
      }

      // Bouées : gîte sur la houle
      for (let i = 0; i < this.buoys.length; i++) {
        const b = this.buoys[i];
        const ph = (b.userData['bob'] as number) ?? 0;
        const bob = Math.sin(this.time * 1.35 + ph) * 0.14;
        b.position.y = 0.1 + bob;
        b.rotation.z = Math.sin(this.time * 1.1 + ph) * 0.06;
      }

      // Embruns étrave
      if (this.bowSpray) {
        const attr = this.bowSpray.geometry.attributes['position'] as THREE.BufferAttribute;
        const n = attr.count;
        for (let i = 0; i < n; i++) {
          const s = i * 0.27 + this.time * 4.2;
          const j = i * 0.618034;
          attr.setXYZ(
            i,
            0.08 + Math.sin(s) * 0.32 + (j % 0.13),
            (Math.sin(s * 1.6) * 0.5 + 0.5) * 0.22,
            Math.sin(j * 11.7 + this.time * 2) * 0.14
          );
        }
        attr.needsUpdate = true;
      }

      // Poissons : sauts en arc, orientation tangente (tête dans le sens du saut)
      for (const fp of this.fishPool) {
        fp.ang += 0.00028;
        const localT = this.time + fp.phase;
        const u = (localT % fp.cycle) / fp.cycle;
        const jumpStart = 0.66;
        const xa = fp.radius * Math.cos(fp.ang);
        const za = fp.radius * Math.sin(fp.ang);
        if (u > jumpStart) {
          const t = (u - jumpStart) / (1 - jumpStart);
          const arc = Math.sin(t * Math.PI);
          const h = arc * 0.62;
          const leap = Math.sin(t * Math.PI) * 0.38;
          fp.group.position.set(xa + leap, -0.06 + h, za + Math.cos(t * Math.PI) * 0.12);
          const tdx = -Math.sin(fp.ang);
          const tdz = Math.cos(fp.ang);
          fp.group.rotation.y = Math.atan2(-tdz, tdx);
          fp.group.rotation.x = -arc * 0.62;
          fp.group.rotation.z = Math.sin(t * Math.PI * 2) * 0.12;
          fp.group.visible = true;
          if (fp.tailFork) {
            fp.tailFork.rotation.y = Math.sin(this.time * 20 + fp.phase * 3) * 0.52;
            fp.tailFork.rotation.x = Math.sin(this.time * 26 + fp.phase) * 0.1;
          }
        } else {
          fp.group.visible = false;
        }
      }

      // Bateau : cap lissé + houle + réponse au déplacement (tangage / gîte / enfoncement)
      if (this.boatGroup) {
        let dYaw = this.boatHeadingTarget - this.boatYawSmooth;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        this.boatYawSmooth += dYaw * Math.min(1, 0.22);

        this.turnBankImpulse *= 0.89;
        this.moveSurge *= 0.9;

        const waveZ = Math.sin(this.time * 1.32) * 0.034;
        const waveX = Math.sin(this.time * 1.02 + 0.5) * 0.028;
        const surge = this.moveSurge * 0.14 * Math.sin(this.time * 4.2);
        const heave = Math.sin(this.time * 1.82) * 0.026;

        this.boatGroup.rotation.y = this.boatYawSmooth;
        this.boatGroup.rotation.z = waveZ + this.turnBankImpulse * 0.85;
        this.boatGroup.rotation.x = waveX - surge;
        this.boatGroup.position.y = 0.24 + heave + this.moveSurge * 0.055;
      }

      if (this.captainRoot && this.captainHead) {
        this.captainRoot.rotation.z = Math.sin(this.time * 0.88) * 0.038;
        this.captainHead.rotation.y = Math.sin(this.time * 0.41) * 0.12;
        this.captainHead.rotation.x = Math.sin(this.time * 0.29) * 0.048;
      }

      const needle = this.compassNeedleRef?.nativeElement;
      if (needle) {
        needle.style.transform = `rotate(${Math.PI / 2 - this.boatYawSmooth}rad)`;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.zone.runOutsideAngular(loop);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  private clearTiles(): void {
    this.clearIslandProps();
    if (this.sandMesh) {
      this.scene.remove(this.sandMesh);
      this.sandMesh.dispose();
      this.sandMesh = undefined;
    }
  }

  private clearIslandProps(): void {
    while (this.islandsRoot.children.length) {
      const ch = this.islandsRoot.children[0];
      this.islandsRoot.remove(ch);
      ch.traverse(obj => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(mm => mm.dispose());
      });
    }
  }

  /** Bruit déterministe par tuile (palmiers / rochers) */
  private hash2d(x: number, y: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    return ((h >>> 0) % 10000) / 10000;
  }

  /** Îlot : plage, relief, palmiers, rochers ; version « héros » si le joueur est sur cette case */
  private buildIslandDecoration(cell: Cell, ox: number, oy: number, hero: boolean): THREE.Group {
    const root = new THREE.Group();
    const wx = (cell.x - ox) * TILE;
    const wz = (cell.y - oy) * TILE;
    root.position.set(wx, 0.11, wz);

    const h = this.hash2d(cell.x, cell.y);
    const scale = hero ? 1.55 : 0.92;

    const beach = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 * scale, 0.47 * scale, 0.055, 32),
      new THREE.MeshStandardMaterial({
        color: 0xead5b0,
        roughness: 0.95,
        envMapIntensity: 0.38,
      })
    );
    beach.position.y = 0.028;
    beach.receiveShadow = true;
    beach.castShadow = true;
    root.add(beach);

    const hill = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34 * scale, 1),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.29 + h * 0.05, 0.5, 0.26 + h * 0.1),
        roughness: 0.9,
        envMapIntensity: 0.2,
      })
    );
    hill.position.set(
      (h - 0.5) * 0.1,
      0.2 * scale,
      (this.hash2d(cell.y, cell.x) - 0.5) * 0.1
    );
    hill.scale.set(1.12, 0.52 + h * 0.12, 1.08);
    hill.castShadow = true;
    hill.receiveShadow = true;
    root.add(hill);

    const nRocks = hero ? 6 : 3;
    for (let i = 0; i < nRocks; i++) {
      const hh = this.hash2d(cell.x + i * 17, cell.y + i * 31);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.055 + hh * 0.05, 0),
        new THREE.MeshStandardMaterial({ color: 0x5c5c62, roughness: 0.93, flatShading: true })
      );
      const ang = (i / nRocks) * Math.PI * 2 + h * 3;
      rock.position.set(
        Math.cos(ang) * 0.31 * scale,
        0.04 + hh * 0.05,
        Math.sin(ang) * 0.31 * scale
      );
      rock.scale.setScalar(0.75 + hh * 0.45);
      rock.rotation.set(hh * 2, hh * 3, hh);
      rock.castShadow = true;
      root.add(rock);
    }

    const palmCount = hero ? 8 : 4;
    for (let i = 0; i < palmCount; i++) {
      const t = this.hash2d(cell.x + i * 101, cell.y + i * 17);
      const ang = t * Math.PI * 2;
      const rad = (0.16 + this.hash2d(cell.y, cell.x + i) * 0.24) * scale;
      root.add(
        this.buildPalm(
          Math.cos(ang) * rad,
          0.02,
          Math.sin(ang) * rad,
          0.32 + t * 0.18,
          0.48 + t * 0.22
        )
      );
    }

    if (hero) {
      root.add(this.buildIslandHut(-0.02, 0.12, -0.12));
    }

    root.rotation.y = (h - 0.5) * 0.4;
    return root;
  }

  private buildPalm(x: number, baseY: number, z: number, trunkH: number, leafS: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.032, trunkH, 8),
      new THREE.MeshStandardMaterial({ color: 0x3d2814, roughness: 0.88, envMapIntensity: 0.2 })
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    g.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2a6b3c,
      roughness: 0.78,
      side: THREE.DoubleSide,
      envMapIntensity: 0.15,
    });
    const topY = trunkH - 0.02;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.11 * leafS, 0.36 * leafS, 5), leafMat);
      leaf.position.set(Math.cos(a) * 0.05, topY, Math.sin(a) * 0.05);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = a;
      leaf.rotation.x = 0.55;
      leaf.rotation.z = Math.PI / 2.15;
      leaf.castShadow = true;
      g.add(leaf);
    }
    return g;
  }

  /** Petite cabane de pêcheur (vue « joueur sur l’île ») */
  private buildIslandHut(x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.11, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xb89968, roughness: 0.9, envMapIntensity: 0.25 })
    );
    walls.position.y = 0.06;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.13, 4),
      new THREE.MeshStandardMaterial({ color: 0x3d2e22, roughness: 0.84 })
    );
    roof.position.y = 0.14;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.95, side: THREE.DoubleSide })
    );
    door.position.set(0, 0.05, 0.101);
    g.add(door);
    return g;
  }

  private disposeScene(): void {
    this.scene?.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(mm => mm?.dispose?.());
    });
  }

  private onResize = (): void => {
    const c = this.renderer.domElement;
    const w = c.clientWidth, h = c.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    const pr = Math.min(devicePixelRatio, 2.5);
    this.renderer.setPixelRatio(pr);
    if (this.stars) {
      (this.stars.material as THREE.ShaderMaterial).uniforms['uPixelRatio'].value = pr;
    }
  };
}
