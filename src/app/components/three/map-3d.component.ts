// map-3d.component.ts
import {
  AfterViewInit, Component, ElementRef, inject, NgZone, OnDestroy, ViewChild, effect
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GameStateService } from '../../services/game-state.service';
import { Cell } from '../../models/map.model';

const TILE   = 1;
const RADIUS = 20;

@Component({
  selector: 'app-map-3d',
  standalone: true,
  template: `<canvas #canvas class="canvas3d"></canvas>`,
  styles: [`
    :host { display: block; width: 720px; height: 528px; position: relative; }
    .canvas3d { width: 100%; height: 100%; display: block; border-radius: 4px; }
  `],
})
export class Map3dComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly game      = inject(GameStateService);
  private readonly zone      = inject(NgZone);

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private animId = 0;

  private seaMesh?: THREE.InstancedMesh;
  private sandMesh?: THREE.InstancedMesh;
  private boatGroup?: THREE.Group;

  private currentBoatX = 0;
  private currentBoatY = 0;

  // Three.js n'est prêt qu'après ngAfterViewInit
  private threeReady = false;

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
    this.renderer?.dispose();
    this.disposeScene();
  }

  // ── Renderer / Camera ──────────────────────────────────────────────────

  private initRenderer(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
  }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1628);
    this.scene.fog = new THREE.Fog(0x0a1628, 15, 35);

    const canvas = this.canvasRef.nativeElement;
    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
    this.camera.position.set(0, 14, 14);

    // Lumières
    const amb = new THREE.AmbientLight(0x4488cc, 0.6);
    this.scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 15, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    this.scene.add(dir);

    // Contrôles
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 40;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // ── Rebuild des tuiles à chaque changement ────────────────────────────

  private rebuild(cellsMap: Map<string, Cell>, ship: any): void {
    // Déterminer la position du bateau
    const bx = ship?.currentPosition?.x ?? this.currentBoatX;
    const by = ship?.currentPosition?.y ?? this.currentBoatY;
    this.currentBoatX = bx;
    this.currentBoatY = by;

    // Filtrer les cellules dans le rayon
    const allCells = Array.from(cellsMap.values());
    const visible = allCells.filter(c => {
      const dx = c.x - bx;
      const dy = c.y - by;
      return Math.abs(dx) <= RADIUS && Math.abs(dy) <= RADIUS;
    });

    // Supprimer les anciennes tuiles
    this.clearTiles();

    // Séparer SEA / SAND
    const sea  = visible.filter(c => c.type === 'SEA');
    const sand = visible.filter(c => c.type === 'SAND');

    // Créer les InstancedMesh
    const geo = new THREE.BoxGeometry(TILE * 0.98, 0.2, TILE * 0.98);

    if (sea.length > 0) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x1565C0, roughness: 0.3, metalness: 0.1 });
      this.seaMesh = this.createInstanced(geo, mat, sea, bx, by, 0);
      this.scene.add(this.seaMesh);
    }

    if (sand.length > 0) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xC8A96E, roughness: 0.8 });
      this.sandMesh = this.createInstanced(geo, mat, sand, bx, by, 0.08);
      this.scene.add(this.sandMesh);
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
    yOffset: number
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.receiveShadow = true;
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
    this.boatGroup.position.set(rx, 0.25, rz);
  }

  private createBoatModel(): THREE.Group {
    const group = new THREE.Group();

    // Coque
    const hullGeo = new THREE.BoxGeometry(0.6, 0.25, 0.3);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    group.add(hull);

    // Proue (triangle avant)
    const prowGeo = new THREE.ConeGeometry(0.18, 0.3, 4);
    const prow = new THREE.Mesh(prowGeo, hullMat);
    prow.rotation.z = -Math.PI / 2;
    prow.position.set(0.42, 0, 0);
    prow.castShadow = true;
    group.add(prow);

    // Mât
    const mastGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.6, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x5C3317 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(0, 0.42, 0);
    group.add(mast);

    // Voile
    const sailGeo = new THREE.PlaneGeometry(0.35, 0.4);
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xFAF0E6,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0.08, 0.45, 0);
    sail.rotation.y = Math.PI / 2;
    group.add(sail);

    // Drapeau
    const flagGeo = new THREE.PlaneGeometry(0.12, 0.08);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0x4ECCA3,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0, 0.72, 0.06);
    group.add(flag);

    return group;
  }

  // ── Animation ─────────────────────────────────────────────────────────

  private time = 0;

  private startLoop(): void {
    const loop = () => {
      this.animId = requestAnimationFrame(loop);
      this.time += 0.016;

      // Animation douce du bateau (tangage)
      if (this.boatGroup) {
        this.boatGroup.rotation.z = Math.sin(this.time * 1.5) * 0.04;
        this.boatGroup.rotation.x = Math.sin(this.time * 1.2 + 0.5) * 0.03;
        this.boatGroup.position.y = 0.25 + Math.sin(this.time * 2) * 0.03;
      }

      // Animation des vagues (déplace légèrement les tuiles SEA en Y)
      if (this.seaMesh) {
        const dummy = new THREE.Object3D();
        const count = this.seaMesh.count;
        const m = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
          this.seaMesh.getMatrixAt(i, m);
          const pos = new THREE.Vector3();
          pos.setFromMatrixPosition(m);
          pos.y = Math.sin(this.time * 2 + pos.x * 0.5 + pos.z * 0.3) * 0.04;
          dummy.position.copy(pos);
          dummy.updateMatrix();
          this.seaMesh.setMatrixAt(i, dummy.matrix);
        }
        this.seaMesh.instanceMatrix.needsUpdate = true;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.zone.runOutsideAngular(loop);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  private clearTiles(): void {
    if (this.seaMesh) { this.scene.remove(this.seaMesh); this.seaMesh.dispose(); this.seaMesh = undefined; }
    if (this.sandMesh) { this.scene.remove(this.sandMesh); this.sandMesh.dispose(); this.sandMesh = undefined; }
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
  };
}
