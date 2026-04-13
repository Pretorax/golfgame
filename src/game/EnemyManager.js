// src/game/EnemyManager.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class EnemyManager {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.enemies = [];
        this.levelGenerator = null;
    }

    clearEnemies() {
        this.enemies.forEach(e => {
            if (e.mesh) this.scene.remove(e.mesh);
            if (e.body && this.physicsWorld) this.physicsWorld.removeBody(e.body);
        });
        this.enemies = [];
    }

    createBeeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 16;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ffff00'; // Base retro bright yellow
        ctx.fillRect(0, 0, 16, 16);
        
        ctx.fillStyle = '#111111'; 
        ctx.fillRect(4, 0, 3, 16);
        ctx.fillRect(9, 0, 3, 16);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }

    createBeeMesh() {
        const group = new THREE.Group();
        
        // Body (Blocky Cube)
        const bodyGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const bodyMat = new THREE.MeshPhongMaterial({ map: this.createBeeTexture() }); 
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        group.add(body);
        
        // Materials for Cute Face
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const blushMat = new THREE.MeshBasicMaterial({ color: 0xff6666 });
        const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        // Big cute blocky eyes
        const eyeGeo = new THREE.BoxGeometry(0.02, 0.08, 0.06);
        const e1 = new THREE.Mesh(eyeGeo, blackMat); e1.position.set(0.155, 0.04, 0.08); group.add(e1);
        const e2 = new THREE.Mesh(eyeGeo, blackMat); e2.position.set(0.155, 0.04, -0.08); group.add(e2);
        
        // Cute pupil glints
        const glintGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
        const g1 = new THREE.Mesh(glintGeo, whiteMat); g1.position.set(0.16, 0.06, 0.08); group.add(g1);
        const g2 = new THREE.Mesh(glintGeo, whiteMat); g2.position.set(0.16, 0.06, -0.08); group.add(g2);
        
        // Pink Blush cheeks
        const blushGeo = new THREE.BoxGeometry(0.02, 0.04, 0.04);
        const b1 = new THREE.Mesh(blushGeo, blushMat); b1.position.set(0.155, -0.02, 0.12); group.add(b1);
        const b2 = new THREE.Mesh(blushGeo, blushMat); b2.position.set(0.155, -0.02, -0.12); group.add(b2);
        
        // Tiny Stinger on the butt
        const stingGeo = new THREE.ConeGeometry(0.04, 0.15, 3); // Spiky triangle shape
        stingGeo.rotateZ(Math.PI / 2); // Pointing cleanly backwards against +X
        const stinger = new THREE.Mesh(stingGeo, blackMat);
        stinger.position.set(-0.20, -0.05, 0);
        group.add(stinger);
        
        // Boxy Wings
        const wingGeo = new THREE.BoxGeometry(0.15, 0.02, 0.25);
        const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const w1 = new THREE.Mesh(wingGeo, wingMat); w1.position.set(0, 0.16, 0.15); group.add(w1);
        const w2 = new THREE.Mesh(wingGeo, wingMat); w2.position.set(0, 0.16, -0.15); group.add(w2);
        
        group.userData = { w1, w2 };
        return group;
    }

    getValidGrassTiles() {
        let valid = [];
        if (!this.levelGenerator || !this.levelGenerator.gridData) return valid;
        
        const grid = this.levelGenerator.gridData;
        for (let x = 0; x < grid.length; x++) {
            for (let z = 0; z < grid[0].length; z++) {
                if (grid[x][z].active && grid[x][z].type === 'grass') {
                    valid.push({x, z});
                }
            }
        }
        return valid;
    }

    getOrthogonalNeighbors(gx, gz) {
        let neighbors = [];
        if (!this.levelGenerator || !this.levelGenerator.gridData) return neighbors;
        const grid = this.levelGenerator.gridData;
        const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
        
        for (let d of dirs) {
            let nx = gx + d[0];
            let nz = gz + d[1];
            if (nx >= 0 && nx < grid.length && nz >= 0 && nz < grid[0].length) {
                if (grid[nx][nz].active && grid[nx][nz].type === 'grass') {
                    neighbors.push({x: nx, z: nz});
                }
            }
        }
        return neighbors;
    }

    spawnEnemies(amount, levelGenerator) {
        this.clearEnemies();
        this.levelGenerator = levelGenerator;
        
        if (amount === 0) return;
        
        const openTiles = this.getValidGrassTiles();
        if (openTiles.length === 0) return;
        
        for (let i = 0; i < amount; i++) {
            const startTile = openTiles[Math.floor(Math.random() * openTiles.length)];
            const mesh = this.createBeeMesh();
            
            const startX = startTile.x * levelGenerator.tileSize;
            const startZ = startTile.z * levelGenerator.tileSize;
            
            mesh.position.set(startX, 1.25, startZ); // Hard set to hover height over grass
            this.scene.add(mesh);
            
            // Generate Physical Cannon Body
            const shape = new CANNON.Box(new CANNON.Vec3(0.15, 0.15, 0.15));
            const body = new CANNON.Body({
                mass: 5, // Able to push cylinders mechanically
                position: new CANNON.Vec3(startX, 1.25, startZ),
                shape: shape,
                linearDamping: 0.95, // High damping to enforce clean speed limits
                angularDamping: 0.9,
                fixedRotation: true // Prevent tumbling entirely
            });
            
            // Ensure they strictly fly above the grass and don't launch vertically upon impact
            body.linearFactor = new CANNON.Vec3(1, 0, 1);
            
            if (this.physicsWorld) {
                this.physicsWorld.addBody(body);
            }
            
            this.enemies.push({
                mesh: mesh,
                body: body,
                gx: startTile.x,
                gz: startTile.z,
                targetGx: startTile.x,
                targetGz: startTile.z,
                targetWorldX: startX,
                targetWorldZ: startZ,
                speed: 2.1 + Math.random() * 2.1, // Reduced strictly by 30% per user request
                hoverTime: Math.random() * 100,
                baseY: 1.25,
                stuckTimer: 0,
                turnWaitTimer: 0,
                dirX: 0,
                dirZ: 0
            });
        }
    }

    pickNewTarget(e, ts) {
        // Evaluate the neighbor space
        const neighbors = this.getOrthogonalNeighbors(e.gx, e.gz);
        if (neighbors.length > 0) {
            let next = null;
            
            // Look exactly forward down the active heading vector natively
            const forwardNeighbor = neighbors.find(n => n.x === e.gx + e.dirX && n.z === e.gz + e.dirZ);
            
            // 85% algorithmic chance to fiercely commit to zooming straight ahead if the lane remains completely clear
            if (forwardNeighbor && Math.random() < 0.85) {
                next = forwardNeighbor;
            } else {
                next = neighbors[Math.floor(Math.random() * neighbors.length)];
            }
            // Flag if we are drastically changing course
            if (e.dirX !== 0 || e.dirZ !== 0) {
                if (next.x - e.gx !== e.dirX || next.z - e.gz !== e.dirZ) {
                    e.turnWaitTimer = 2.0; // Hard cap on waiting indefinitely, but rotation angle check usually truncates this!
                }
            }
            
            e.targetGx = next.x;
            e.targetGz = next.z;
            e.targetWorldX = e.targetGx * ts;
            e.targetWorldZ = e.targetGz * ts;
            
            // Persist the mathematical direction for the next grid tick
            e.dirX = e.targetGx - e.gx;
            e.dirZ = e.targetGz - e.gz;
        }
    }

    update(dt, playerManager) {
        const ts = this.levelGenerator ? this.levelGenerator.tileSize : 0.5;
        
        this.enemies.forEach(e => {
            e.hoverTime += dt;
            
            // Update current grid location mathematically from active physical body position
            e.gx = Math.floor((e.body.position.x / ts) + 0.5);
            e.gz = Math.floor((e.body.position.z / ts) + 0.5);
            
            // Blocky wing flap snaps!
            if (e.mesh.userData.w1) {
                let flap = Math.floor(e.hoverTime * 15) % 2 === 0; 
                e.mesh.userData.w1.rotation.x = flap ? 0.3 : -0.3;
                e.mesh.userData.w2.rotation.x = flap ? -0.3 : 0.3;
            }

            // Directional physical steering constraint
            const dx = e.targetWorldX - e.body.position.x;
            const dz = e.targetWorldZ - e.body.position.z;
            const distSq = dx*dx + dz*dz;
            
            // Calculate absolute pure cardinal facing direction using explicit heading vectors instead of dynamic drift
            const idealAngle = Math.atan2(e.dirX, e.dirZ) - Math.PI / 2;
            const idealQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), idealAngle);

            // Wait-And-Turn Mechanic
            if (e.turnWaitTimer > 0) {
                e.turnWaitTimer -= dt;
                
                // Natively bleed off movement velocity cleanly
                e.body.velocity.x *= 0.5;
                e.body.velocity.z *= 0.5;
                
                // Rotate mechanically slowly
                e.mesh.quaternion.slerp(idealQ, dt * 2.5);
                
                // If it successfully faces the target orthogonally, brutally truncate the timer!
                if (e.mesh.quaternion.angleTo(idealQ) < 0.05) {
                    e.turnWaitTimer = 0;
                }
            } else {
                // If we physically reached the target grid natively, pick another!
                if (distSq < 0.05) {
                    this.pickNewTarget(e, ts);
                } else {
                    // Apply continuous sliding steering force!
                    const dist = Math.sqrt(distSq);
                    
                    // Aggressive Restorative Spring Force: If sliding down Z axis, brutally force X back to center lane without fighting forward momentum.
                    // This keeps bee travel strictly orthogonal mechanically and fixes drifting/wobbling!
                    const strictCenterForceX = (Math.abs(dx) < Math.abs(dz)) ? (dx * 120) : 0;
                    const strictCenterForceZ = (Math.abs(dz) < Math.abs(dx)) ? (dz * 120) : 0;
                    
                    e.body.applyForce(
                        new CANNON.Vec3( ((dx / dist) * e.speed) + strictCenterForceX, 0, ((dz / dist) * e.speed) + strictCenterForceZ ),
                        e.body.position
                    );
                    
                    // Allow the mesh to smoothly rotate freely reflecting true physical pathing organically!
                    e.mesh.quaternion.slerp(idealQ, dt * 6.0);
                }
            }
            
            // Stuck Prevention AI Routing
            const velMagSq = e.body.velocity.lengthSquared();
            if (velMagSq < 0.1) {
                e.stuckTimer += dt;
                if (e.stuckTimer > 0.8) { // If bogged down against a cylinder/wall for ~1 sec physically
                    e.stuckTimer = 0;
                    this.pickNewTarget(e, ts); // Divert rigidly to a fresh grid path!
                }
            } else {
                e.stuckTimer = 0;
            }
            
            // Sync Mesh strictly to Physics Core Body
            e.mesh.position.copy(e.body.position);
            // Apply lightweight sine floating entirely separated from collision mass natively
            e.mesh.position.y = e.baseY + Math.sin(e.hoverTime * 6) * 0.04;
            
            // Explicit Sting Logic Restored manually!
            if (playerManager) {
                playerManager.players.forEach(p => {
                    if (p.state !== 'sunk' && p.state !== 'dnf' && p.body.collisionFilterGroup !== 4) { 
                        const px = p.body.position.x;
                        const pz = p.body.position.z;
                        const pDist = Math.sqrt(Math.pow(e.body.position.x - px, 2) + Math.pow(e.body.position.z - pz, 2));
                        
                        if (pDist < 0.6) {
                            playerManager.applySting(p.username);
                        }
                    }
                });
            }
        });
    }
}
