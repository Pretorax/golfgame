import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from './PhysicsWorld.js';
import { PremiumHoleData } from './PremiumHoleData.js';

export class LevelGenerator {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.objects = [];
        this.gridData = []; 
        this.startPos = new THREE.Vector3(0, 1, 0);
        this.startAreaBounds = { xMin: 0, xMax: 0, zMin: 0, zMax: 0 };
        this.tileSize = 0.5;
        this.holePos = new THREE.Vector3(0, 1, 0);
        this.boosters = [];
        this.sandTiles = [];
        this.teleporter = null;
        
        this.matGrassDark = new THREE.MeshLambertMaterial({ map: this.createNoiseTexture('#3c7a34', '#387430') });
        this.matGrassLight = new THREE.MeshLambertMaterial({ map: this.createNoiseTexture('#4c9642', '#468c3d') });
        this.matPutting = new THREE.MeshLambertMaterial({ map: this.createNoiseTexture('#62c256', '#5db852') });
        this.matWall = new THREE.MeshLambertMaterial({ color: 0xffffff }); 
        this.matRamp = new THREE.MeshLambertMaterial({ map: this.createArrowTexture() }); // Structurally distinct patterned grass with directional chevron arrows natively!
        this.matSand = new THREE.MeshLambertMaterial({ map: this.createNoiseTexture('#e3c16f', '#d1ae5c') });
        this.waterTex = this.createWaveTexture();
        this.matWater = new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: false, opacity: 1.0 });
        this.timeAccumulator = 0; // Absolute time physics tracker
        this.matFlag = new THREE.MeshLambertMaterial({ color: 0xe62222, side: THREE.DoubleSide });
        this.matHole = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        this.matObstacleRed = new THREE.MeshLambertMaterial({ color: 0xdd3333 });
        this.matObstacleBlue = new THREE.MeshLambertMaterial({ color: 0x3333dd });
        this.matObstacleWood = new THREE.MeshLambertMaterial({ color: 0xc29b62 });
        
        this.boosterCanvas = document.createElement('canvas');
        this.boosterCanvas.width = 64; this.boosterCanvas.height = 64;
        this.boosterCtx = this.boosterCanvas.getContext('2d');
        this.boosterTex = new THREE.CanvasTexture(this.boosterCanvas);
        this.boosterTex.minFilter = THREE.NearestFilter;
        this.boosterTex.magFilter = THREE.NearestFilter;
        this.boosterTex.colorSpace = THREE.SRGBColorSpace;
        this.matBooster = new THREE.MeshLambertMaterial({ map: this.boosterTex });

        this.boosterOffset = 0;

        const portalVertShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        const portalFragShader = `
            uniform float time;
            uniform vec3 color;
            uniform float dir;
            varying vec2 vUv;
            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                float d = max(abs(uv.x), abs(uv.y)); 
                float pulse = mod((1.0 - d) * 2.5 - (time * 2.0 * dir), 1.0);
                float intensity = smoothstep(0.5, 1.0, pulse) + (1.0 - smoothstep(0.0, 0.3, d)); 
                gl_FragColor = vec4(color * intensity * 1.5, 0.9);
            }
        `;
        
        this.portalUniformsIn = { time: { value: 0 }, color: { value: new THREE.Color(0xff8800) }, dir: { value: 1.0 } };
        this.matTeleporterIn = new THREE.ShaderMaterial({
            uniforms: this.portalUniformsIn,
            vertexShader: portalVertShader,
            fragmentShader: portalFragShader,
            transparent: true,
            depthWrite: false
        });

        this.portalUniformsOut = { time: { value: 0 }, color: { value: new THREE.Color(0x00a8ff) }, dir: { value: -1.0 } };
        this.matTeleporterOut = new THREE.ShaderMaterial({
            uniforms: this.portalUniformsOut,
            vertexShader: portalVertShader,
            fragmentShader: portalFragShader,
            transparent: true,
            depthWrite: false
        });

        PhysicsWorld.initMaterials(this.physicsWorld);
    }

    createNoiseTexture(baseColorHex, altColorHex, density = 400) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = baseColorHex;
        ctx.fillRect(0,0,64,64);
        ctx.fillStyle = altColorHex;
        for(let i=0; i<density; i++) {
            ctx.fillRect(Math.floor(Math.random()*64), Math.floor(Math.random()*64), 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }
    
    createArrowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#6bc1ab'; // Structurally distinct pastel teal
        ctx.fillRect(0,0,128,128);
        ctx.fillStyle = '#5bac98'; 
        for(let i=0; i<800; i++) {
            ctx.fillRect(Math.floor(Math.random()*128), Math.floor(Math.random()*128), 2, 2);
        }
        
        ctx.lineWidth = 24; // Doubled thickness structurally
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineJoin = 'miter';
        
        for(let y=0; y<128; y+=128) { // Singular massive chevron seamlessly spanning each block structurally
            ctx.beginPath();
            ctx.moveTo(16, y + 104);
            ctx.lineTo(64, y + 24);
            ctx.lineTo(112, y + 104);
            ctx.stroke();
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearFilter; 
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    createWaveTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#246b9c'; // Underlying base blue
        ctx.fillRect(0,0,128,128);
        
        ctx.strokeStyle = '#3ca4e8'; // Wavy crests
        ctx.lineWidth = 4;
        for(let y=16; y<128; y+=32) {
            ctx.beginPath();
            for(let x=0; x<=128; x+=8) {
                let waveY = y + Math.sin(x * 0.1) * 8;
                if(x===0) ctx.moveTo(x, waveY);
                else ctx.lineTo(x, waveY);
            }
            ctx.stroke();
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    animateBoosters(dt) {
        if (this.waterTex) {
            this.waterTex.offset.x -= dt * 0.4;
            this.waterTex.offset.y += dt * 0.2;
        }
        this.timeAccumulator += dt;
        
        if (this.portalUniformsIn) this.portalUniformsIn.time.value = this.timeAccumulator;
        if (this.portalUniformsOut) this.portalUniformsOut.time.value = this.timeAccumulator;
        
        if (this.globalFlagMesh) {
            const positions = this.globalFlagMesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                const distFromPole = x + 0.3; // Geometrically scaling amplitude based natively on distance from anchored origin
                const z = Math.sin(this.timeAccumulator * 8 - x * 20) * distFromPole * 0.08; // Vastly smoother physical flutter amplitude
                positions.setZ(i, z);
            }
            positions.needsUpdate = true;
            this.globalFlagMesh.geometry.computeVertexNormals(); // Refresh lighting cleanly!
        }
        this.boosterOffset += dt * 30; 
        if (this.boosterOffset > 64) this.boosterOffset -= 64;
        const ctx = this.boosterCtx;
        ctx.fillStyle = '#ffbd00';
        ctx.fillRect(0,0,64,64);
        ctx.fillStyle = '#ff3300';
        for(let x=-64; x<128; x+=32) {
            let cx = x + this.boosterOffset;
            ctx.beginPath();
            ctx.moveTo(cx, 16); ctx.lineTo(cx + 16, 32); ctx.lineTo(cx, 48);
            ctx.lineTo(cx - 8, 48); ctx.lineTo(cx + 8, 32); ctx.lineTo(cx - 8, 16);
            ctx.fill();
        }
        this.boosterTex.needsUpdate = true;
    }

    clearLevel() {
        this.objects.forEach(obj => {
            if (obj.mesh) this.scene.remove(obj.mesh);
            if (obj.body) this.physicsWorld.removeBody(obj.body);
        });
        this.objects = [];
        this.boosters = [];
        this.sandTiles = [];
        this.gridData = [];
        this.teleporter = null;
        this.globalFlagMesh = null; // Clean up safely
    }

    getStartPos() {
        const xSpan = (this.startAreaBounds.xMax - this.startAreaBounds.xMin) * this.tileSize;
        const zSpan = (this.startAreaBounds.zMax - this.startAreaBounds.zMin) * this.tileSize;
        const randX = this.startAreaBounds.xMin * this.tileSize + (Math.random() * xSpan);
        const randZ = this.startAreaBounds.zMin * this.tileSize + (Math.random() * zSpan);
        return new THREE.Vector3(randX, 1.0, randZ); 
    }

    isInBounds(x, z) {
        return x >= 0 && x < this.width && z >= 0 && z < this.height;
    }

    generateProcedural(config = { scale: 5, water: 5, sand: 5, hills: 5, objects: 5, boosters: 5 }) {
        // Build map bounds based linearly on the slider (1-10) with innate variety
        const baseW = 16 + (config.scale * 4); // Scale 5 -> 36. Scale 10 -> 56. Scale 1 -> 20.
        const baseH = 16 + (config.scale * 4);
        const sizes = [ 
            { w: baseW - 4, h: baseH - 4 }, 
            { w: baseW, h: baseH }, 
            { w: baseW + 4, h: baseH + 4 } 
        ];
        const chosenSize = sizes[Math.floor(Math.random() * sizes.length)];
        let w = chosenSize.w;
        let h = chosenSize.h;
        this.width = w;
        this.height = h;

        this.gridData = [];
        for (let x = 0; x < w; x++) {
            this.gridData[x] = [];
            for (let z = 0; z < h; z++) {
                this.gridData[x][z] = { active: false, type: 'grass', dir: null, elevationAbs: 0, rampClimb: 0, isGolden: false };
            }
        }

        // Rectilinear Path Generator Algorithm
        // Increase structural segment boundaries relative to the new massive map constraints array
        let minSegments = 2;
        let maxSegments = 4;
        if (w >= 64) {
             minSegments = 3;
             maxSegments = 5;
        }
        const numSegments = Math.floor(Math.random() * (maxSegments - minSegments + 1)) + minSegments;
        
        let cx = Math.floor(w / 2);
        let cz = 3; 
        let curDir = 2; // North(-Z)=0, East(+X)=1, South(+Z)=2, West(-X)=3
        
        let startZone = { x: cx, z: cz }; // Base offset correctly inside bounds
        let endZone = { x: cx, z: cz };
        
        let curElevation = 0; // Globally flat, completely zeroes out the base map tracking
        let initialDir = curDir;
        
        // Randomize the initial starting block fairway natively
        let currentPathWidth = Math.floor(Math.random() * 5) + 4; // Between 4 and 8

        for (let i = 0; i < numSegments; i++) {
            // Pre-calculate the impending elbow turn width to seamlessly map overlapping corners natively!
            let nextPathWidth = Math.floor(Math.random() * 5) + 4; 
            // Scale segments proportionally to the bounds
            let baseLen = Math.floor(w / 3);
            let segLength = Math.floor(Math.random() * 10) + baseLen;
            
            let dX = 0; let dZ = 0;
            if (curDir === 0) dZ = -1;
            if (curDir === 1) dX = 1;
            if (curDir === 2) dZ = 1;
            if (curDir === 3) dX = -1;

            let actualSteps = 0;
            for (let step = 0; step < segLength; step++) {
                let px = cx + (dX * step);
                let pz = cz + (dZ * step);
                
                // Safe encapsulation clamp absolutely physically halting fairway mapping securely within bounds!
                if (px < 3 || px > w-4 || pz < 3 || pz > h-4) {
                    break; 
                }
                actualSteps++;
                
                let hw = Math.floor(currentPathWidth / 2);
                for(let side = -hw; side <= hw; side++) {
                    let rx = px; let rz = pz;
                    if (curDir === 0 || curDir === 2) rx += side; // Vertical drawing
                    if (curDir === 1 || curDir === 3) rz += side; // Horizontal drawing
                    
                    if (this.isInBounds(rx, rz)) {
                        this.gridData[rx][rz].active = true;
                        this.gridData[rx][rz].elevationAbs = curElevation;
                        this.gridData[rx][rz].dir = curDir; // Store primary directional axis dynamically natively
                        
                        // Golden path is physically 2 wide perfectly in the centroid 
                        if (Math.abs(side) <= 1) {
                            this.gridData[rx][rz].isGolden = true; 
                        }
                    }
                }
            }
            
            // Push terminal node precisely to exactly the valid constrained length bounds
            cx = cx + (dX * Math.max(0, actualSteps - 1));
            cz = cz + (dZ * Math.max(0, actualSteps - 1));
            
            // Fill completely the entire elbow corner rigorously avoiding chopped boundary gaps using widest branch natively!
            let cornerHw = Math.floor(Math.max(currentPathWidth, nextPathWidth) / 2);
            for (let xx = -cornerHw; xx <= cornerHw; xx++) {
                for (let zz = -cornerHw; zz <= cornerHw; zz++) {
                    let rx = cx + xx;
                    let rz = cz + zz;
                    if (this.isInBounds(rx, rz)) {
                        this.gridData[rx][rz].active = true;
                        this.gridData[rx][rz].elevationAbs = curElevation;
                        // Preserve the native golden safe zone dynamically blending the turn seamlessly
                        if (Math.abs(xx) <= 1 && Math.abs(zz) <= 1) {
                            this.gridData[rx][rz].isGolden = true;
                        }
                    }
                }
            }
            
            if (i < numSegments - 1) {
                // Determine valid 90 deg elbow avoiding looping U-shapes structurally!
                let turnPool = [];
                if (curDir === 0 || curDir === 2) { turnPool = [1, 3]; }
                else { turnPool = [0, 2]; }
                
                // Pure mathematical logic strictly filtering any turns pointing backwards towards initial pipeline mapping!
                if (i > 0) {
                    const oppositeInitial = (initialDir + 2) % 4;
                    turnPool = turnPool.filter(dir => dir !== oppositeInitial);
                }
                
                curDir = turnPool[Math.floor(Math.random() * turnPool.length)];
            } else {
                endZone = { x: cx, z: cz }; // Hole precisely at safely clamped termination coordinate!
            }
            
            // Shift pipeline scalar logically ready for the next geometric sweep!
            currentPathWidth = nextPathWidth;
        }

        // Secure absolute Hole Height
        this.holePos = new THREE.Vector3(endZone.x * this.tileSize, 1 + curElevation, endZone.z * this.tileSize);

        // Map perfectly rigid 3x3 Start Box independently forcing grid expansions if missing
        this.startAreaBounds.xMin = startZone.x - 1;
        this.startAreaBounds.xMax = startZone.x + 1;
        this.startAreaBounds.zMin = startZone.z - 1;
        this.startAreaBounds.zMax = startZone.z + 1;
        for(let dx=-1; dx<=1; dx++) {
            for(let dz=-1; dz<=1; dz++) {
                let px = startZone.x + dx;
                let pz = startZone.z + dz;
                if(this.isInBounds(px, pz)) {
                    this.gridData[px][pz].active = true;
                    this.gridData[px][pz].type = 'start_zone';
                    this.gridData[px][pz].elevationAbs = 0; // Flat Floor
                    this.gridData[px][pz].isGolden = true; 
                    this.gridData[px][pz].dir = initialDir; 
                }
            }
        }

        // Green Zone Clearance exactly mirroring 3x3 Tee start pad dynamically
        for(let dx=-1; dx<=1; dx++) {
            for(let dz=-1; dz<=1; dz++) {
                let checkX = endZone.x + dx;
                let checkZ = endZone.z + dz;
                if(this.isInBounds(checkX, checkZ)) {
                    this.gridData[checkX][checkZ].active = true;
                    this.gridData[checkX][checkZ].type = 'putting_green';
                    this.gridData[checkX][checkZ].elevationAbs = 0;
                    this.gridData[checkX][checkZ].isGolden = true; // Extensively protective
                }
            }
        }

        this.generateHills(w, h, config.hills);
        this.generateSimplerHazards(w, h, config.sand, config.water);
        this.addDynamicTiles(w, h, config.boosters); 
        this.generateTeleporters(w, h);

        // WIDESCREEN TRANSPOSITION: Measure utilized bounds to mathematically guarantee lateral widescreen flow safely!
        let minX = w, maxX = -1, minZ = h, maxZ = -1;
        for (let x = 0; x < w; x++) {
            for (let z = 0; z < h; z++) {
                if (this.gridData[x][z].active) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                }
            }
        }
        let usedW = maxX - minX;
        let usedH = maxZ - minZ;

        if (usedH > usedW) {
            let newGrid = [];
            for (let nx = 0; nx < h; nx++) {
                newGrid[nx] = [];
                for (let nz = 0; nz < w; nz++) {
                    let oldX = nz;
                    let oldZ = h - 1 - nx;
                    let cell = this.gridData[oldX][oldZ] || { active: false, type: 'grass', dir: null, elevationAbs: 0, isGolden: false };
                    
                    let newCell = { ...cell };
                    // Geometrically mathematically mapping Directional vectors organically 90deg CW natively!
                    if (newCell.dir !== null && newCell.dir !== undefined) {
                        newCell.dir = (newCell.dir + 1) % 4;
                    }
                    newGrid[nx][nz] = newCell;
                }
            }
            this.gridData = newGrid;
            this.width = h;
            this.height = w;
            
            // Remap strictly structural anchors dynamically
            let oldMinX = this.startAreaBounds.xMin; let oldMaxX = this.startAreaBounds.xMax;
            let oldMinZ = this.startAreaBounds.zMin; let oldMaxZ = this.startAreaBounds.zMax;

            this.startAreaBounds.xMin = h - 1 - oldMaxZ;
            this.startAreaBounds.xMax = h - 1 - oldMinZ;
            this.startAreaBounds.zMin = oldMinX;
            this.startAreaBounds.zMax = oldMaxX;
            
            let hx = this.holePos.x / this.tileSize;
            let hz = this.holePos.z / this.tileSize;
            this.holePos.x = (h - 1 - hz) * this.tileSize;
            this.holePos.z = hx * this.tileSize;
            
            w = this.width;
            h = this.height;
        }

        this.buildFromGridData(w, h);
        this.spawnFreeObstacles(w, h, config.objects, config.chaos); // Scatter surface props!
    }

    generatePremiumHole(holeNum) {
        // Cycle natively mathematically sequentially across library sizes (but picking them at random from main.js array generator index)
        const premiumIndex = (holeNum - 1) % PremiumHoleData.length;
        const blueprint = PremiumHoleData[premiumIndex];
        
        const h = blueprint.length;
        let w = 0;
        blueprint.forEach(row => { if(row.length > w) w = row.length; });
        
        this.width = w;
        this.height = h;

        this.gridData = [];
        for (let x = 0; x < w; x++) {
            this.gridData[x] = [];
            for (let z = 0; z < h; z++) {
                // We default isGolden to true here so it safely entirely ignores injecting random dynamic obstacles on classic holes.
                this.gridData[x][z] = { active: false, type: 'grass', dir: null, elevation: 0, isGolden: true }; 
            }
        }
        
        let pendingObstacles = [];
        
        for (let z = 0; z < h; z++) {
            const row = blueprint[z];
            for (let x = 0; x < row.length; x++) {
                const char = row[x];
                if (char === ' ') continue;
                
                this.gridData[x][z].active = true;
                
                if (char === 'S') {
                    this.gridData[x][z].type = 'start_zone';
                    this.startAreaBounds.xMin = x - 1;
                    this.startAreaBounds.xMax = x + 1;
                    this.startAreaBounds.zMin = z - 1;
                    this.startAreaBounds.zMax = z + 1;
                    
                    for(let dx=-1; dx<=1; dx++){
                        for(let dz=-1; dz<=1; dz++) {
                             if (this.isInBounds(x+dx, z+dz)) {
                                  this.gridData[x+dx][z+dz].active = true;
                                  this.gridData[x+dx][z+dz].type = 'start_zone';
                             }
                        }
                    }
                } else if (char === 'H') {
                    this.gridData[x][z].type = 'putting_green';
                    this.holePos = new THREE.Vector3(x * this.tileSize, 1.0, z * this.tileSize);
                    
                    for(let dx=-2; dx<=2; dx++){
                        for(let dz=-2; dz<=2; dz++) {
                             if (this.isInBounds(x+dx, z+dz)) {
                                  this.gridData[x+dx][z+dz].active = true;
                                  this.gridData[x+dx][z+dz].type = 'putting_green';
                             }
                        }
                    }
                } else if (char === 'R') {
                    pendingObstacles.push({ x, z, type: 1 }); // Diamond
                } else if (char === 'B') {
                    pendingObstacles.push({ x, z, type: 0 }); // Cylinder
                } else if (char === 'W') {
                    pendingObstacles.push({ x, z, type: 2, rot: 0 }); // Horiz Wall
                } else if (char === 'w') {
                    pendingObstacles.push({ x, z, type: 2, rot: Math.PI / 2 }); // Vertical Wall
                }
            }
        }
        
        this.buildFromGridData(w, h);
        
        // Push precise blueprint obstacles structurally overriding spatial scatter
        pendingObstacles.forEach(ob => {
            let cx = ob.x * this.tileSize;
            let cz = ob.z * this.tileSize;
            let cy = 1.0 + 0.3; 
            
            if (ob.type === 0) { 
                let r = 0.15; let ht = 0.6; // Reduced scale vertically strictly
                const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ht, 16), this.matObstacleBlue);
                mesh.position.set(cx, cy, cz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                
                const shape = new CANNON.Cylinder(r, r, ht, 16);
                const body = new CANNON.Body({ mass: 1.2, shape: shape, material: PhysicsWorld.wallMaterial, linearDamping: 0.8, angularDamping: 0.8 });
                body.position.set(cx, cy, cz);
                const quat = new CANNON.Quaternion();
                quat.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
                body.quaternion.copy(quat);
                
                body.angularFactor.set(0, 1, 0); // Lock rotational limits mathematically to the upright World Y axis preventing tipping
                body.updateMassProperties(); // Secure the physics constraint implicitly
                
                this.physicsWorld.addBody(body);
                this.objects.push({ mesh, body });
            } else if (ob.type === 1) { 
                let s = 0.25; let ht = 0.6;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, ht, s), this.matObstacleRed);
                mesh.position.set(cx, cy, cz);
                mesh.rotation.y = Math.PI / 4; 
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                
                const shape = new CANNON.Box(new CANNON.Vec3(s/2, ht/2, s/2));
                const body = new CANNON.Body({ mass: 1.2, shape: shape, material: PhysicsWorld.wallMaterial, linearDamping: 0.8, angularDamping: 0.8 });
                body.position.set(cx, cy, cz);
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI/4);
                
                this.physicsWorld.addBody(body);
                this.objects.push({ mesh, body });
            } else if (ob.type === 2) { 
                let wt = 0.8; let thick = 0.1; let ht = 0.6;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(wt, ht, thick), this.matObstacleWood);
                mesh.position.set(cx, cy, cz);
                mesh.rotation.y = ob.rot;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                
                const shape = new CANNON.Box(new CANNON.Vec3(wt/2, ht/2, thick/2));
                const body = new CANNON.Body({ mass: 1.2, shape: shape, material: PhysicsWorld.wallMaterial, linearDamping: 0.8, angularDamping: 0.8 });
                body.position.set(cx, cy, cz);
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), ob.rot);
                
                this.physicsWorld.addBody(body);
                this.objects.push({ mesh, body });
            }
        });
    }

    generateSimplerHazards(w, h, sandFreq, waterFreq) {
        // Sand traps configurable directly by parameters
        let resolvedSand = Math.floor((sandFreq / 10) * 8); // Scaled
        for(let i=0; i<resolvedSand; i++) {
            let cx = Math.floor(Math.random() * w);
            let cz = Math.floor(Math.random() * h);
            let rw = Math.floor(Math.random() * 2) + 1; // 1 to 2 wide slices
            let rh = Math.floor(Math.random() * 2) + 1; 
            for(let dx=-rw; dx<=rw; dx++) {
                for(let dz=-rh; dz<=rh; dz++) {
                    let px = cx + dx;
                    let pz = cz + dz;
                    if (this.isInBounds(px, pz) && this.gridData[px][pz].active) {
                        if (!this.gridData[px][pz].isGolden && this.gridData[px][pz].type === 'grass' && this.gridData[px][pz].elevationAbs === 0) {
                            this.gridData[px][pz].type = 'sand';
                        }
                    }
                }
            }
        }

        // Water Pools mapping to pure Radius geometries
        let resolvedWater = Math.floor((waterFreq / 10) * 12); // Greatly boosted target target map volume
        for(let i=0; i<resolvedWater; i++) {
            let cx = Math.floor(Math.random() * w);
            let cz = Math.floor(Math.random() * h);
            let radius = Math.floor(Math.random() * 1) + 2; // tight uniform 2 radius
            for(let dx=-radius; dx<=radius; dx++) {
                for(let dz=-radius; dz<=radius; dz++) {
                    let px = cx + dx;
                    let pz = cz + dz;
                    if (Math.sqrt(dx*dx + dz*dz) <= radius) {
                        if (this.isInBounds(px, pz) && this.gridData[px][pz].active) {
                            if (!this.gridData[px][pz].isGolden && this.gridData[px][pz].type === 'grass' && this.gridData[px][pz].elevationAbs === 0) {
                                this.gridData[px][pz].type = 'water';
                            }
                        }
                    }
                }
            }
        }
    }

    generateHills(w, h, hillFreq) {
        if (hillFreq === 0) return;
        const validSpots = [];
        for (let x = 3; x < w - 3; x++) {
            for (let z = 3; z < h - 3; z++) {
                if (this.gridData[x][z].active && this.gridData[x][z].type === 'grass' && this.gridData[x][z].elevationAbs === 0 && this.gridData[x][z].isGolden) {
                    validSpots.push({ x, z });
                }
            }
        }
        validSpots.sort(() => Math.random() - 0.5);
        let built = 0;
        let limit = Math.floor((hillFreq / 10) * 6); // Cut hill frequencies back algorithmically
        
        for (let i = 0; i < validSpots.length && built < limit; i++) {
            let cx = validSpots[i].x;
            let cz = validSpots[i].z;
            let pathDir = this.gridData[cx][cz].dir;
            
            // 60% chance to build a multi-block linear ramp, 40% chance of a massive 4x4 plateau
            let isPlateau = (Math.random() < 0.4);
            
            if (isPlateau) {
                let pSize = 2; // Flat 2x2 natively
                let rampLength = Math.floor(Math.random() * 3) + 1; 
                let plateauElev = 0.25; 
                let climbPerBlock = plateauElev / rampLength;
                
                let success = true;
                for (let dx = -rampLength; dx < pSize + rampLength; dx++) {
                    for (let dz = -rampLength; dz < pSize + rampLength; dz++) {
                        let rx = cx + dx;
                        let rz = cz + dz;
                        // Restrict bounds squarely returning to strict algorithmic fairway pockets!
                        if (!this.isInBounds(rx, rz) || !this.gridData[rx][rz].active || this.gridData[rx][rz].type !== 'grass' || this.gridData[rx][rz].elevationAbs !== 0) {
                            success = false;
                        }
                    }
                }
                
                if (success) {
                    for (let px = 0; px < pSize; px++) {
                        for (let pz = 0; pz < pSize; pz++) {
                            let rx = cx + px; let rz = cz + pz;
                            this.gridData[rx][rz].active = true;
                            this.gridData[rx][rz].type = 'grass';
                            this.gridData[rx][rz].elevationAbs = plateauElev;
                        }
                    }
                    
                    for (let r = 0; r < rampLength; r++) {
                        let topElev = (rampLength - r) * climbPerBlock; 
                        for (let p = 0; p < pSize; p++) {
                            // North side
                            let nX = cx + p; let nZ = cz - 1 - r;
                            this.gridData[nX][nZ].active = true;
                            this.gridData[nX][nZ].type = 'slope';
                            this.gridData[nX][nZ].rampClimb = climbPerBlock;
                            this.gridData[nX][nZ].elevationAbs = topElev;
                            this.gridData[nX][nZ].dir = 2; // Up South
                            
                            // South side
                            let sX = cx + p; let sZ = cz + pSize + r;
                            this.gridData[sX][sZ].active = true;
                            this.gridData[sX][sZ].type = 'slope';
                            this.gridData[sX][sZ].rampClimb = climbPerBlock;
                            this.gridData[sX][sZ].elevationAbs = topElev;
                            this.gridData[sX][sZ].dir = 0; // Up North
                            
                            // West side
                            let wX = cx - 1 - r; let wZ = cz + p;
                            this.gridData[wX][wZ].active = true;
                            this.gridData[wX][wZ].type = 'slope';
                            this.gridData[wX][wZ].rampClimb = climbPerBlock;
                            this.gridData[wX][wZ].elevationAbs = topElev;
                            this.gridData[wX][wZ].dir = 1; // Up East
                            
                            // East side
                            let eX = cx + pSize + r; let eZ = cz + p;
                            this.gridData[eX][eZ].active = true;
                            this.gridData[eX][eZ].type = 'slope';
                            this.gridData[eX][eZ].rampClimb = climbPerBlock;
                            this.gridData[eX][eZ].elevationAbs = topElev;
                            this.gridData[eX][eZ].dir = 3; // Up West
                        }
                    }
                    built++;
                }
            } else {
                let rampLength = Math.floor(Math.random() * 3) + 1; 
                let spanOverX = (pathDir === 0 || pathDir === 2); 
                let summitElev = 0.25;
                let climbPerBlock = summitElev / rampLength;
                let bumpWidth = 3; 
                let totalDepth = rampLength * 2;
                
                let success = true;
                for (let w1 = 0; w1 < bumpWidth; w1++) {
                    for (let d1 = 0; d1 < totalDepth; d1++) {
                        let ow = w1 - 1;
                        let rx = spanOverX ? cx + ow : cx + d1;
                        let rz = spanOverX ? cz + d1 : cz + ow;
                        if (!this.isInBounds(rx, rz) || !this.gridData[rx][rz].active || this.gridData[rx][rz].type !== 'grass' || this.gridData[rx][rz].elevationAbs !== 0) {
                            success = false;
                        }
                    }
                }
                
                if (success) {
                    for (let w1 = 0; w1 < bumpWidth; w1++) {
                        let ow = w1 - 1;
                        for (let r = 0; r < rampLength; r++) {
                            let topElev = (r + 1) * climbPerBlock;
                            let rx = spanOverX ? cx + ow : cx + r;
                            let rz = spanOverX ? cz + r : cz + ow;
                            this.gridData[rx][rz].type = 'slope';
                            this.gridData[rx][rz].rampClimb = climbPerBlock;
                            this.gridData[rx][rz].elevationAbs = topElev;
                            this.gridData[rx][rz].dir = spanOverX ? 2 : 1;
                        }
                        for (let r = 0; r < rampLength; r++) {
                            let topElev = (rampLength - r) * climbPerBlock;
                            let d1 = rampLength + r;
                            let rx = spanOverX ? cx + ow : cx + d1;
                            let rz = spanOverX ? cz + d1 : cz + ow;
                            this.gridData[rx][rz].type = 'slope';
                            this.gridData[rx][rz].rampClimb = climbPerBlock;
                            this.gridData[rx][rz].elevationAbs = topElev;
                            this.gridData[rx][rz].dir = spanOverX ? 0 : 3;
                        }
                    }
                    built++;
                }
            }
        }
    }

    addDynamicTiles(w, h, boosterFreq) {
        let addedBoosters = 0;
        let attempts = 0;
        let limit = Math.floor((boosterFreq / 10) * 5); // 0 to 5 arrays!
        while(addedBoosters < limit && attempts < 80) {
            attempts++;
            let bx = Math.floor(Math.random() * w);
            let bz = Math.floor(Math.random() * h);
            if (this.isInBounds(bx, bz) && this.gridData[bx][bz].active && this.gridData[bx][bz].type === 'grass') {
                const dir = Math.floor(Math.random()*4); 
                
                let stepX = 0; let stepZ = 0;
                if (dir === 0) stepZ = -1; // North
                if (dir === 1) stepX = 1;  // East
                if (dir === 2) stepZ = 1;  // South
                if (dir === 3) stepX = -1; // West
                
                let checkValid = true;
                for(let len=0; len<3; len++) {
                    let rx = bx + (stepX*len);
                    let rz = bz + (stepZ*len);
                    if (!this.isInBounds(rx, rz) || !this.gridData[rx][rz].active || this.gridData[rx][rz].isGolden || this.gridData[rx][rz].type !== 'grass') {
                        checkValid = false;
                        break;
                    }
                }
                
                if (checkValid) {
                    for(let len=0; len<3; len++) {
                        let rx = bx + (stepX*len);
                        let rz = bz + (stepZ*len);
                        this.gridData[rx][rz].type = 'booster';
                        this.gridData[rx][rz].dir = dir;
                    }
                    addedBoosters++;
                }
            }
        }
    }

    generateTeleporters(w, h) {
        if (Math.random() > 0.25) return; // 25% chance of spawning structurally

        let validSpots = [];
        for (let x = 1; x < w - 1; x++) {
            for (let z = 1; z < h - 1; z++) {
                if (this.gridData[x][z].active && this.gridData[x][z].type === 'grass' && this.gridData[x][z].elevationAbs === 0) {
                    validSpots.push({ x, z });
                }
            }
        }
        
        if (validSpots.length > 5) {
            validSpots.sort(() => Math.random() - 0.5);
            let inTile = validSpots[0];
            let outTile = validSpots[1];
            
            this.gridData[inTile.x][inTile.z].type = 'teleporter_in';
            this.gridData[outTile.x][outTile.z].type = 'teleporter_out';
        }
    }

    spawnFreeObstacles(w, h, objFreq, chaos = 1) {
        if (objFreq === 0) return;
        // Find valid off-track grass coordinates strictly decoupled from the Golden Path unless Chaos overrides!
        const validSpots = [];
        for (let x = 3; x < w - 3; x++) {
            for (let z = 3; z < h - 3; z++) {
                if (this.gridData[x][z].active && this.gridData[x][z].type === 'grass' && this.gridData[x][z].elevationAbs === 0) {
                    
                    let isInner = true;
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dz = -1; dz <= 1; dz++) {
                            let rx = x + dx; let rz = z + dz;
                            if (rx < 0 || rx >= w || rz < 0 || rz >= h || !this.gridData[rx][rz].active) {
                                isInner = false;
                            }
                        }
                    }
                    if (!isInner) continue;

                    let isGolden = this.gridData[x][z].isGolden;
                    let bypassGolden = false;
                    if (isGolden) {
                        let bypassChance = (chaos - 1) * 0.11; // up to ~99% bypass chance at 10 natively
                        if (Math.random() < bypassChance) bypassGolden = true;
                    }
                    if (!isGolden || bypassGolden) {
                        validSpots.push({ x, z, el: this.gridData[x][z].elevationAbs });
                    }
                }
            }
        }

        // Randomize spots
        validSpots.sort(() => Math.random() - 0.5);
        
        let numObstacles = Math.floor((objFreq / 10) * 12); 
        for(let i = 0; i < Math.min(numObstacles, validSpots.length); i++) {
            let spot = validSpots[i];
            let type = Math.floor(Math.random() * 3); // 0=Cylinder, 1=Diamond, 2=Wall
            
            // Random fractional positional float natively snapping items 'off-grid' slightly!
            let offsetX = (Math.random() - 0.5) * this.tileSize * 0.5;
            let offsetZ = (Math.random() - 0.5) * this.tileSize * 0.5;
            let cx = (spot.x * this.tileSize) + offsetX;
            let cz = (spot.z * this.tileSize) + offsetZ;
            let cy = 1.0 + (spot.el * 0.25) + 0.3; // Half physical height elevation up so it rests perfectly on the grass
            
            if (type === 0) {
                // Round Deflector Cylinder
                let r = 0.15; let ht = 0.6; 
                const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ht, 16), this.matObstacleBlue);
                mesh.position.set(cx, cy, cz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                
                // Cannon-es geometry enforces cylinders natively along the Z-axis, we must rotate -90 manually around X to stand upright securely!
                const shape = new CANNON.Cylinder(r, r, ht, 16);
                const body = new CANNON.Body({ mass: 1.2, shape: shape, material: PhysicsWorld.wallMaterial, linearDamping: 0.8, angularDamping: 0.8 });
                body.position.set(cx, cy, cz);
                
                const quat = new CANNON.Quaternion();
                quat.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
                body.quaternion.copy(quat);
                
                body.angularFactor.set(0, 1, 0); // Mathematically constraint dynamic cylinder tipping natively locking physics vertically
                body.updateMassProperties();
                
                this.physicsWorld.addBody(body);
                this.objects.push({ mesh, body });
            } 
            else if (type === 1) {
                // Spinning Geometric Diamond (Red)
                let s = 0.25; let ht = 0.6;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, ht, s), this.matObstacleRed);
                mesh.position.set(cx, cy, cz);
                mesh.rotation.y = Math.PI / 4; // mathematical 45 degree native spin
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                
                const shape = new CANNON.Box(new CANNON.Vec3(s/2, ht/2, s/2));
                const body = new CANNON.Body({ mass: 1.2, shape: shape, material: PhysicsWorld.wallMaterial, linearDamping: 0.8, angularDamping: 0.8 });
                body.position.set(cx, cy, cz);
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI/4);
                
                this.physicsWorld.addBody(body);
                this.objects.push({ mesh, body });
            }
            else {
                // Diverter Wood Wall Barrier
                let wt = 0.8; let thick = 0.1; let ht = 0.6;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(wt, ht, thick), this.matObstacleWood);
                mesh.position.set(cx, cy, cz);
                let randRot = Math.random() * Math.PI;
                mesh.rotation.y = randRot;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                
                const shape = new CANNON.Box(new CANNON.Vec3(wt/2, ht/2, thick/2));
                const body = new CANNON.Body({ mass: 1.2, shape: shape, material: PhysicsWorld.wallMaterial, linearDamping: 0.8, angularDamping: 0.8 });
                body.position.set(cx, cy, cz);
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), randRot);
                
                this.physicsWorld.addBody(body);
                this.objects.push({ mesh, body });
            }
        }
    }

    generateFromCode(code) {
        this.generateProcedural(); // Override
    }

    buildFromGridData(w, h) {
        for (let x = 0; x < w; x++) {
            for (let z = 0; z < h; z++) {
                const cell = this.gridData[x][z];
                if (!cell.active) continue;

                const cx = x * this.tileSize;
                const cz = z * this.tileSize;

                let mat = this.matGrassDark;
                if (cell.type === 'grass') {
                    mat = ((x + z) % 2 === 0) ? this.matGrassLight : this.matGrassDark;
                } else if (cell.type === 'start_zone' || cell.type === 'putting_green') {
                    mat = this.matPutting;
                } else if (cell.type === 'sand') {
                    mat = this.matSand;
                    this.sandTiles.push({ x: cx, z: cz }); 
                } else if (cell.type === 'water') {
                    mat = this.matWater;
                } else if (cell.type === 'booster') {
                    mat = this.matBooster;
                } else if (cell.type === 'teleporter_in' || cell.type === 'teleporter_out') {
                    mat = this.matGrassDark; // Base grass block natively beneath
                } else if (cell.type === 'slope') {
                    mat = this.matRamp;
                }
                
                let yHeight = 1;
                let physMat = PhysicsWorld.grassMaterial;
                
                let baseElevation = cell.elevationAbs; 
                // Fix rendering drop-off for Wedge bottoms dynamically
                if (cell.type === 'slope') {
                    baseElevation = cell.elevationAbs - cell.rampClimb; 
                }
                
                let yOffset = baseElevation; 
                if (cell.type === 'water') { 
                    yHeight = 0.9; // Significantly thicker water blocks mathematically
                    yOffset = baseElevation - 0.05; // Rest exactly 0.05 logically below the native 1.0 grass bounds flawlessly
                    physMat = PhysicsWorld.waterMaterial;
                }
                if (cell.type === 'sand') {  physMat = PhysicsWorld.sandMaterial; }
                
                let actualY = (yHeight/2) + yOffset;

                // Standard Rendering
                if (cell.type !== 'slope') {
                    const geometry = new THREE.BoxGeometry(this.tileSize, yHeight, this.tileSize);
                    const mesh = new THREE.Mesh(geometry, mat);
                    mesh.position.set(cx, actualY, cz);
                    
                    if (cell.type === 'booster') {
                        // Strict synchronization with physics propulsion logic directions!
                        // Canvas texture draws pointing to positive X implicitly.
                        if (cell.dir === 0) mesh.rotation.y = Math.PI / 2;     // North
                        if (cell.dir === 1) mesh.rotation.y = 0;               // East
                        if (cell.dir === 2) mesh.rotation.y = -Math.PI / 2;    // South
                        if (cell.dir === 3) mesh.rotation.y = Math.PI;         // West
                        this.boosters.push({ x: cx, z: cz, dir: cell.dir });
                    }
                    
                    if (cell.type === 'teleporter_in' || cell.type === 'teleporter_out') {
                        let isEntrance = (cell.type === 'teleporter_in');
                        
                        // Pulse Plane over Grass
                        const vfxGeo = new THREE.PlaneGeometry(this.tileSize*0.9, this.tileSize*0.9);
                        const vfxMesh = new THREE.Mesh(vfxGeo, isEntrance ? this.matTeleporterIn : this.matTeleporterOut);
                        vfxMesh.rotation.x = -Math.PI / 2;
                        vfxMesh.position.set(cx, actualY + (yHeight/2) + 0.005, cz);
                        this.scene.add(vfxMesh);
                        this.objects.push({ mesh: vfxMesh, body: null });
                        
                        // Explicit Colored Border mathematically anchored
                        const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(this.tileSize*0.92, this.tileSize*0.92));
                        const edgeMat = new THREE.LineBasicMaterial({ color: isEntrance ? 0xffa500 : 0x00a8ff, linewidth: 2 });
                        const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
                        edgeLines.rotation.x = -Math.PI / 2;
                        edgeLines.position.copy(vfxMesh.position);
                        this.scene.add(edgeLines);
                        this.objects.push({ mesh: edgeLines, body: null });
                        
                        if (!this.teleporter) this.teleporter = {};
                        if (isEntrance) this.teleporter.in = { x: cx, z: cz, cy: actualY + yHeight/2 };
                        if (!isEntrance) this.teleporter.out = { x: cx, z: cz, cy: actualY + yHeight/2 };
                    }
                    
                    mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                    
                    const shape = new CANNON.Box(new CANNON.Vec3(this.tileSize/2, yHeight/2, this.tileSize/2));
                    const body = new CANNON.Body({ mass: 0, shape: shape, position: new CANNON.Vec3(cx, actualY, cz), material: physMat });
                    body.isWater = (cell.type === 'water');
                    this.physicsWorld.addBody(body);
                    this.objects.push({ mesh, body });

                } else {
                    // SLOPES WEDGE RENDER MATH (Base mapped pointing East native +X)
                    const shapeGeo = new THREE.Shape();
                    const climb = cell.rampClimb; // natively mapping steepness values securely onto extrusions!
                    shapeGeo.moveTo(-this.tileSize/2, -0.5);
                    shapeGeo.lineTo(this.tileSize/2, -0.5);
                    shapeGeo.lineTo(this.tileSize/2,  -0.5 + 1.0 + climb); // 1.0 is yHeight, climbing base!
                    shapeGeo.lineTo(-this.tileSize/2, 0.5);
                    
                    const extrudeSettings = { depth: this.tileSize, bevelEnabled: false };
                    const slopeGeo = new THREE.ExtrudeGeometry(shapeGeo, extrudeSettings);
                    slopeGeo.translate(0, 0, -this.tileSize/2); 

                    const mesh = new THREE.Mesh(slopeGeo, mat);
                    mesh.position.set(cx, actualY, cz);

                    const verts = [
                        new CANNON.Vec3(-this.tileSize/2, -0.5,  this.tileSize/2),
                        new CANNON.Vec3( this.tileSize/2, -0.5,  this.tileSize/2),
                        new CANNON.Vec3( this.tileSize/2,  0.5 + climb,  this.tileSize/2),
                        new CANNON.Vec3(-this.tileSize/2,  0.5,  this.tileSize/2),
                        
                        new CANNON.Vec3(-this.tileSize/2, -0.5, -this.tileSize/2),
                        new CANNON.Vec3( this.tileSize/2, -0.5, -this.tileSize/2),
                        new CANNON.Vec3( this.tileSize/2,  0.5 + climb, -this.tileSize/2),
                        new CANNON.Vec3(-this.tileSize/2,  0.5, -this.tileSize/2)
                    ];
                    const faces = [
                        [0,1,2,3], 
                        [4,7,6,5], 
                        [0,4,5,1], 
                        [3,2,6,7], 
                        [1,5,6,2], 
                        [0,3,7,4]  
                    ];
                    
                    const polyShape = new CANNON.ConvexPolyhedron({ vertices: verts, faces: faces });
                    const body = new CANNON.Body({ mass: 0, shape: polyShape, position: new CANNON.Vec3(cx, actualY, cz), material: physMat });

                    // Slopes are drawn structurally moving UP the pipe in whatever pathing direction generated it!
                    if (cell.dir === 0) { // Drawing UP towards North (-Z)
                        mesh.rotation.y = Math.PI / 2;
                        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI / 2);
                    } else if (cell.dir === 1) { // Drawing UP towards East (+X) [Native default]
                        mesh.rotation.y = 0; 
                    } else if (cell.dir === 2) { // Drawing UP towards South (+Z)
                        mesh.rotation.y = -Math.PI / 2;
                        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), -Math.PI / 2);
                    } else if (cell.dir === 3) { // Drawing UP towards West (-X)
                        mesh.rotation.y = Math.PI;
                        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), Math.PI);
                    }
                    
                    mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                    this.physicsWorld.addBody(body);
                    this.objects.push({ mesh, body });
                }
            }
        }

        this.buildPerimeterCurbs(w, h);
        this.createFlagPole(this.holePos.x, this.holePos.z);
    }

    buildPerimeterCurbs(w, h) {
        const curbWidth = 0.15;

        const addWallSegment = (cx, cz, rotY, length, elevationLvl) => {
            const dynamicCurbHeight = 1.2 + elevationLvl;
            const halfY = dynamicCurbHeight / 2;
            const geo = new THREE.BoxGeometry(curbWidth, dynamicCurbHeight, length);
            const mesh = new THREE.Mesh(geo, this.matWall);
            mesh.position.set(cx, halfY, cz);
            mesh.rotation.y = rotY;
            this.scene.add(mesh);

            const shape = new CANNON.Box(new CANNON.Vec3(curbWidth/2, dynamicCurbHeight/2, length/2));
            const body = new CANNON.Body({ mass: 0, shape: shape, material: PhysicsWorld.wallMaterial });
            body.position.copy(mesh.position);
            body.quaternion.copy(mesh.quaternion);
            this.physicsWorld.addBody(body);
            this.objects.push({ mesh, body });
        };
        
        let pillarsSpawned = new Set();
        const placePillar = (px, pz, elevationLvl) => {
            let key = `${px.toFixed(2)},${pz.toFixed(2)}`;
            if (pillarsSpawned.has(key)) return;
            pillarsSpawned.add(key);
            
            // Allow for structural corner variation! (Taller or wider geometric caps perfectly plugging any notches natively)
            let isDecorated = Math.random() < 0.25;
            const pillarHeight = isDecorated ? 1.5 + elevationLvl : 1.2 + elevationLvl;
            const pillarThickness = isDecorated ? curbWidth * 1.2 : curbWidth;
            
            const halfY = pillarHeight / 2;
            const geo = new THREE.BoxGeometry(pillarThickness, pillarHeight, pillarThickness);
            const mesh = new THREE.Mesh(geo, this.matWall);
            mesh.position.set(px, halfY, pz);
            this.scene.add(mesh);

            const shape = new CANNON.Box(new CANNON.Vec3(pillarThickness/2, pillarHeight/2, pillarThickness/2));
            const body = new CANNON.Body({ mass: 0, shape: shape, material: PhysicsWorld.wallMaterial });
            body.position.copy(mesh.position);
            this.physicsWorld.addBody(body);
            this.objects.push({ mesh, body });
        };

        for (let x = 0; x < w; x++) {
            for (let z = 0; z < h; z++) {
                if (this.gridData[x][z].active) {
                    const cx = x * this.tileSize;
                    const cz = z * this.tileSize;
                    const ht = this.tileSize/2;
                    const cw = curbWidth/2;
                    const el = this.gridData[x][z].elevationAbs !== undefined ? this.gridData[x][z].elevationAbs : 0;

                    // Strictly check adjacent rules correctly wrapping completely linearly!
                    let wEmpty = (x === 0 || !this.gridData[x-1][z].active);
                    let eEmpty = (x === w-1 || !this.gridData[x+1][z].active);
                    let nEmpty = (z === 0 || !this.gridData[x][z-1].active);
                    let sEmpty = (z === h-1 || !this.gridData[x][z+1].active);
                    
                    if (nEmpty) addWallSegment(cx, cz - ht - cw, Math.PI/2, this.tileSize, el);
                    if (sEmpty) addWallSegment(cx, cz + ht + cw, Math.PI/2, this.tileSize, el);
                    if (wEmpty) addWallSegment(cx - ht - cw, cz, 0, this.tileSize, el);
                    if (eEmpty) addWallSegment(cx + ht + cw, cz, 0, this.tileSize, el);
                    
                    // Cap Outer geometric vertices tightly flushing completely clean!
                    if (nEmpty && wEmpty) placePillar(cx - ht - cw, cz - ht - cw, el);
                    if (nEmpty && eEmpty) placePillar(cx + ht + cw, cz - ht - cw, el);
                    if (sEmpty && wEmpty) placePillar(cx - ht - cw, cz + ht + cw, el);
                    if (sEmpty && eEmpty) placePillar(cx + ht + cw, cz + ht + cw, el);
                    
                    // Cap Inner structural notch gaps mathematically without leaking walls out!
                    let nwEmpty = (!this.isInBounds(x-1, z-1) || !this.gridData[x-1][z-1].active);
                    let neEmpty = (!this.isInBounds(x+1, z-1) || !this.gridData[x+1][z-1].active);
                    let swEmpty = (!this.isInBounds(x-1, z+1) || !this.gridData[x-1][z+1].active);
                    let seEmpty = (!this.isInBounds(x+1, z+1) || !this.gridData[x+1][z+1].active);
                    
                    if (!nEmpty && !wEmpty && nwEmpty) placePillar(cx - ht - cw, cz - ht - cw, el);
                    if (!nEmpty && !eEmpty && neEmpty) placePillar(cx + ht + cw, cz - ht - cw, el);
                    if (!sEmpty && !wEmpty && swEmpty) placePillar(cx - ht - cw, cz + ht + cw, el);
                    if (!sEmpty && !eEmpty && seEmpty) placePillar(cx + ht + cw, cz + ht + cw, el);
                }
            }
        }
    }

    createFlagPole(x, z) {
        const holeGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 32); 
        const holeMesh = new THREE.Mesh(holeGeo, this.matHole);
        holeMesh.position.set(x, this.holePos.y + 0.05, z); 
        this.scene.add(holeMesh);
        this.objects.push({ mesh: holeMesh, body: null });

        const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2, 8);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
        const poleMesh = new THREE.Mesh(poleGeo, poleMat);
        poleMesh.position.set(x, this.holePos.y + 1.0, z); 
        this.scene.add(poleMesh);

        const flagGeo = new THREE.PlaneGeometry(0.6, 0.4, 12, 8); // High density sub-division for smooth physical fabric ripples!
        const flagMat = this.matFlag;
        const flagMesh = new THREE.Mesh(flagGeo, flagMat);
        flagMesh.position.set(x + 0.3, this.holePos.y + 1.7, z);
        flagMesh.castShadow = true; 
        this.scene.add(flagMesh);
        
        this.globalFlagMesh = flagMesh; // Publish structurally to physics engine

        this.objects.push({ mesh: poleMesh, body: null });
        this.objects.push({ mesh: flagMesh, body: null });
    }
}
