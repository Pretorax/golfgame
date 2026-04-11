import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PhysicsWorld } from './PhysicsWorld.js';

// Collision Layers Definition
const CG_ENVIRONMENT = 1;
const CG_ACTIVE_BALL = 2;
const CG_GHOST_BALL  = 4;

export class PlayerManager {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.players = new Map(); 
        this.activeSplashes = [];
    }

    clearPlayers() {
        this.players.forEach(p => this.removePlayer(p.username));
        this.players.clear();
    }

    triggerSplash(pos) {
        const geo = new THREE.SphereGeometry(0.06, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true });
        for (let i = 0; i < 5; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            mesh.position.y += 0.1; 
            this.scene.add(mesh);
            const vel = new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 2.5 + 1.5, (Math.random() - 0.5) * 2.5);
            this.activeSplashes.push({ mesh, vel, life: 1.0 });
        }
    }

    getPlayerCount() {
        return this.players.size;
    }

    removePlayer(username) {
        const p = this.players.get(username);
        if (p) {
            this.scene.remove(p.mesh);
            this.scene.remove(p.nameTag);
            this.physicsWorld.removeBody(p.body);
            this.players.delete(username);
        }
    }

    resetForNextHole(startPos) {
        this.players.forEach(p => {
            p.state = 'idle';
            p.holeShots = 0;
            
            p.body.position.set(startPos.x, startPos.y + 0.5, startPos.z);
            p.body.velocity.set(0, 0, 0);
            p.body.angularVelocity.set(0, 0, 0);
            
            p.lastIdlePos.set(startPos.x, startPos.y + 0.5, startPos.z);
            
            p.mesh.position.copy(p.body.position);
            p.mesh.quaternion.copy(p.body.quaternion);
            p.nameTag.position.copy(p.body.position);
            p.nameTag.position.y += 0.8;
            
            p.mesh.visible = true;
            if (p.nameTag) p.nameTag.visible = true;

            // Reset to Ghost Configuration
            p.body.collisionFilterGroup = CG_GHOST_BALL;
            p.body.collisionFilterMask = CG_ENVIRONMENT; 
        });
    }

    createNameLabel(username, colorHex) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256; canvas.height = 64;
    }

    addPlayer(username, colorHex, startPos, initialShots = 0) {
        if (this.players.has(username)) return;

        const radius = 0.15;
        const geometry = new THREE.SphereGeometry(radius, 8, 8);
        const material = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 100 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(startPos);
        mesh.position.y += 0.5;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const div = document.createElement('div');
        div.className = 'player-name-tag';
        div.innerText = username;
        
        const nameTag = new CSS2DObject(div);
        nameTag.position.set(startPos.x, startPos.y + radius + 0.8, startPos.z); 
        this.scene.add(nameTag);

        const shape = new CANNON.Sphere(radius);
        const body = new CANNON.Body({
            mass: 1, 
            shape: shape,
            position: new CANNON.Vec3(startPos.x, startPos.y + 0.5, startPos.z),
            material: PhysicsWorld.ballMaterial,
            linearDamping: 0.65, 
            angularDamping: 0.65,
            collisionFilterGroup: CG_GHOST_BALL, // Start as ghost
            collisionFilterMask: CG_ENVIRONMENT
        });
        
        body.material = PhysicsWorld.ballMaterial;
        this.physicsWorld.addBody(body);

        const playerObj = {
            username: username,
            colorHex: colorHex,
            mesh: mesh,
            body: body,
            nameTag: nameTag,
            state: 'idle', 
            shots: initialShots,
            holeShots: 0,
            hasBoosted: false,
            isBoosting: false,
            boostTimer: 0,
            lastAngle: null,
            lastPower: null,
            lastIdlePos: new CANNON.Vec3(startPos.x, startPos.y + 0.5, startPos.z)
        };
        this.players.set(username, playerObj);
    }

    shoot(username, angleDeg, powerLevel, maxShotLimit) {
        console.log(`[SYS] Received shoot command from ${username}. Angle: ${angleDeg}, Power: ${powerLevel}`);
        const p = this.players.get(username);
        
        if (!p) {
            console.warn(`[SYS] Swing rejected: Player object for ${username} does not exist in Map!`);
            return;
        }
        
        if (p.state !== 'idle') {
            console.warn(`[SYS] Swing rejected: ${username} state is [${p.state}], not [idle]!`);
            return;
        }

        if (maxShotLimit !== undefined && p.holeShots >= maxShotLimit) {
            if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`🚫 @${username} has reached the Shot Limit for this hole and cannot swing!`);
            return;
        }

        console.log(`${username} shoots! Angle: ${angleDeg}, Power: ${powerLevel}`);

        p.shots++;
        p.holeShots++;
        p.state = 'moving';

        // Escalate to active!
        p.body.collisionFilterGroup = CG_ACTIVE_BALL;
        p.body.collisionFilterMask = CG_ENVIRONMENT | CG_ACTIVE_BALL;

        const power = Math.max(1, Math.min(10, powerLevel));
        // Power scaling increased by 50%
        const forceMult = power * 1.95; 
        const rad = angleDeg * (Math.PI / 180);
        const dirX = Math.sin(rad);
        const dirZ = -Math.cos(rad);
        
        p.body.wakeUp();
        
        // Trigger a procedural hit sound scaled natively to the swing power
        if (window.soundManagerGlobal) {
            window.soundManagerGlobal.playHit(power);
        }

        p.body.applyImpulse(
            new CANNON.Vec3(dirX * forceMult, 0, dirZ * forceMult),
            new CANNON.Vec3(0, 0, 0)
        );
        
        p.lastAngle = angleDeg;
        p.lastPower = powerLevel;
    }

    repeatShot(username, maxShotLimit) {
        const p = this.players.get(username);
        if (!p) return;
        if (p.lastAngle === null || p.lastPower === null) {
            if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`🚫 @${username} You haven't taken a shot yet to repeat!`);
            return;
        }
        this.shoot(username, p.lastAngle, p.lastPower, maxShotLimit);
    }

    triggerExplosion(pos) {
        const geo = new THREE.SphereGeometry(0.1, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true });
        for (let i = 0; i < 15; i++) {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(pos);
            mesh.position.y += 0.2; 
            this.scene.add(mesh);
            const vel = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5 + 2, (Math.random() - 0.5) * 8);
            this.activeSplashes.push({ mesh, vel, life: 1.0 }); // Reuse activeSplashes logic for fading particles
        }
    }

    triggerBoost(username, maxShotLimit) {
        const p = this.players.get(username);
        if (!p) return;
        if (p.hasBoosted) {
            if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`🚫 @${username} has already used their !boost this match!`);
            return;
        }
        if (p.state === 'sunk' || p.state === 'dnf') return;

        p.hasBoosted = true;
        p.isBoosting = true;
        p.boostTimer = 5.0;
        
        if (window.showNotification) window.showNotification(`⚠️ ${username} triggered BOOST!`, p.colorHex);
    }

    update(dt, holePos, sandTiles = [], boosters = [], teleporter = null, mapBoundsX = 100, mapBoundsZ = 100, maxShotLimit = 10) {
        
        for (let i = this.activeSplashes.length - 1; i >= 0; i--) {
            let s = this.activeSplashes[i];
            s.mesh.position.addScaledVector(s.vel, dt);
            s.vel.y -= 9.8 * dt; // Gravity
            s.life -= dt;
            s.mesh.material.opacity = s.life;
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                this.activeSplashes.splice(i, 1);
            }
        }

        this.players.forEach(p => {
            if (p.state === 'sunk' || p.state === 'dnf') return;

            if (p.isBoosting) {
                p.boostTimer -= dt;
                
                if (Math.sin(p.boostTimer * 20) > 0) {
                    p.mesh.material.color.setHex(0xff0000);
                } else {
                    p.mesh.material.color.set(p.colorHex);
                }
                p.nameTag.element.innerText = `[${Math.ceil(p.boostTimer)}] ${p.username}`;

                if (p.boostTimer <= 0) {
                    p.isBoosting = false;
                    this.triggerExplosion(p.body.position);
                    if (window.soundManagerGlobal) window.soundManagerGlobal.playHit(10); 

                    this.players.forEach(otherp => {
                        if (otherp !== p && otherp.state !== 'sunk' && otherp.state !== 'dnf') {
                            const distSq = Math.pow(p.body.position.x - otherp.body.position.x, 2) + Math.pow(p.body.position.z - otherp.body.position.z, 2);
                            if (distSq < 16.0) { 
                                const dx = otherp.body.position.x - p.body.position.x;
                                const dz = otherp.body.position.z - p.body.position.z;
                                const len = Math.sqrt(dx*dx + dz*dz) || 1;
                                const force = (1.0 - (Math.sqrt(distSq) / 4.0)) * 25.0; 

                                otherp.body.wakeUp();
                                otherp.body.collisionFilterGroup = CG_ACTIVE_BALL;
                                otherp.body.collisionFilterMask = CG_ENVIRONMENT | CG_ACTIVE_BALL;
                                otherp.state = 'moving';
                                otherp.body.applyImpulse(
                                    new CANNON.Vec3((dx/len) * force, 5, (dz/len) * force),
                                    new CANNON.Vec3(0,0,0)
                                );
                            }
                        }
                    });

                    p.state = 'dnf';
                    p.shots -= p.holeShots;
                    p.holeShots = maxShotLimit + 2;
                    p.shots += p.holeShots;
                    
                    p.mesh.visible = false;
                    p.nameTag.visible = false;
                    p.nameTag.element.innerText = p.username;
                    
                    if (window.showNotification) window.showNotification(`💥 ${p.username} EXPLODED!`, p.colorHex);
                    if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`💥 @${p.username} self-destructed and DNF'd!`);
                    if (window.updatePlayerCount) window.updatePlayerCount();
                    return; 
                }
            } else {
                p.mesh.material.color.set(p.colorHex);
                p.nameTag.element.innerText = p.username;
            }

            p.body.linearDamping = 0.65;
            p.body.angularDamping = 0.65;

            let inSand = false;
            for(let i=0; i<sandTiles.length; i++) {
                let st = sandTiles[i];
                if (Math.pow(p.body.position.x - st.x, 2) + Math.pow(p.body.position.z - st.z, 2) < 0.15) {
                    inSand = true;
                    break;
                }
            }
            if (inSand) {
                p.body.linearDamping = 0.98;
                p.body.angularDamping = 0.98;
            }

            for(let i=0; i<boosters.length; i++) {
                let b = boosters[i];
                if (Math.pow(p.body.position.x - b.x, 2) + Math.pow(p.body.position.z - b.z, 2) < 0.10) {
                    p.body.wakeUp();
                    let f = 12.0; 
                    if (b.dir === 0) p.body.applyForce(new CANNON.Vec3(0, 0, -f), new CANNON.Vec3(0,0,0));
                    if (b.dir === 1) p.body.applyForce(new CANNON.Vec3(f, 0, 0), new CANNON.Vec3(0,0,0));
                    if (b.dir === 2) p.body.applyForce(new CANNON.Vec3(0, 0, f), new CANNON.Vec3(0,0,0));
                    if (b.dir === 3) p.body.applyForce(new CANNON.Vec3(-f, 0, 0), new CANNON.Vec3(0,0,0));
                }
            }
            
            // Core Teleporter Physical Event Loop
            if (teleporter && teleporter.in && teleporter.out) {
                if (Math.pow(p.body.position.x - teleporter.in.x, 2) + Math.pow(p.body.position.z - teleporter.in.z, 2) < 0.15) {
                    if (!p.teleported) {
                        p.teleported = true;
                        
                        // Physically translate mathematically into Output boundaries!
                        p.body.position.set(teleporter.out.x, teleporter.out.cy, teleporter.out.z);
                        p.body.velocity.set(0, 0, 0);
                        p.body.angularVelocity.set(0, 0, 0);
                        p.body.wakeUp();
                        
                        // Blast Outwards Randomly with Strict Power 3 constraint
                        p.state = 'moving';
                        const randAngle = Math.random() * Math.PI * 2;
                        p.body.applyImpulse(
                            new CANNON.Vec3(Math.cos(randAngle) * 3, 0, Math.sin(randAngle) * 3),
                            new CANNON.Vec3(0, 0, 0)
                        );
                        p.body.linearDamping = 0.4;
                        
                        p.mesh.position.copy(p.body.position);
                        p.mesh.quaternion.copy(p.body.quaternion);
                        this.triggerSplash(p.body.position); // Re-use particle puff to visualize warp effect securely
                        
                        if (window.soundManagerGlobal) window.soundManagerGlobal.playHit(3);
                        if (window.showNotification) window.showNotification(`🌀 ${p.username} Teleported!`, p.colorHex);
                        if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`🌀 @${p.username} got sucked through the Teleporter!`);
                    }
                } else if (p.teleported && Math.pow(p.body.position.x - teleporter.out.x, 2) + Math.pow(p.body.position.z - teleporter.out.z, 2) > 0.4) {
                    // Safe logic threshold preventing immediate re-trigger bouncing mathematically
                    p.teleported = false;
                }
            }

            p.mesh.position.copy(p.body.position);
            p.mesh.quaternion.copy(p.body.quaternion);
            p.nameTag.position.copy(p.body.position);
            p.nameTag.position.y += 0.8;

            // OOB Bounding AND Water Verification
            const isOOB = (p.body.position.x < -1 || p.body.position.x > mapBoundsX + 1 ||
                           p.body.position.z < -1 || p.body.position.z > mapBoundsZ + 1);

            if (p.body.position.y < 0.35 || isOOB || p.body.isDrowned) {
                p.shots++;
                p.holeShots++; // Track natively inside the active Hole bounds
                
                if (window.showNotification) window.showNotification(`💦 Penalty: ${p.username} (+1)`, p.colorHex);
                if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`💦 @${p.username} went Out Of Bounds/Hazard! +1 Penalty shot.`);

                if (p.body.isDrowned || p.body.position.y < 0.35) {
                    this.triggerSplash(p.body.position);
                    if (window.soundManagerGlobal) window.soundManagerGlobal.playSplash();
                }

                p.body.position.copy(p.lastIdlePos);
                p.body.velocity.set(0, 0, 0);
                p.body.angularVelocity.set(0, 0, 0);
                p.body.isDrowned = false; // Reset mechanical physical trigger natively!
                p.state = 'idle';
            }

            // Hole logic!
            if (holePos) {
                const distSq = Math.pow(p.body.position.x - holePos.x, 2) + Math.pow(p.body.position.z - holePos.z, 2);
                if (distSq < 0.0225) { // Strict hole reduction mathematically down to 0.0225 logic boundary (0.15 radius)
                    p.state = 'sunk';
                    p.body.velocity.set(0, 0, 0);
                    p.body.angularVelocity.set(0, 0, 0);
                    
                    p.body.position.set(holePos.x, holePos.y - 0.5, holePos.z);
                    p.mesh.position.copy(p.body.position);
                    p.mesh.visible = false;
                    p.nameTag.visible = false; 
                    
                    if (window.soundManagerGlobal) window.soundManagerGlobal.playSunk();
                    if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`🎉 @${p.username} sank the ball in ${p.shots} shots!`);
                    if (window.showNotification) window.showNotification(`🎉 ${p.username} finished in ${p.shots}!`, p.colorHex);
                    return;
                }
            }

            const speed = p.body.velocity.lengthSquared();
            if (speed < 0.05 && p.state === 'moving' && !inSand) {
                p.body.velocity.set(0, 0, 0);
                p.body.angularVelocity.set(0, 0, 0);
                p.state = 'idle';
                p.lastIdlePos.copy(p.body.position); 
                
                if (window.updatePlayerCount) window.updatePlayerCount(); 
            } else if (speed < 0.01 && p.state === 'moving' && inSand) {
                p.body.velocity.set(0, 0, 0);
                p.body.angularVelocity.set(0, 0, 0);
                p.state = 'idle';
                p.lastIdlePos.copy(p.body.position);
                if (window.updatePlayerCount) window.updatePlayerCount();
            }

            // Centralized DNF Evaluation securely after all physics transitions
            if (p.state === 'idle' && p.holeShots >= maxShotLimit) {
                p.state = 'dnf';
                p.shots -= p.holeShots;
                p.holeShots = maxShotLimit + 2;
                p.shots += p.holeShots;
                
                p.mesh.visible = false;
                p.nameTag.visible = false;
                
                if (window.showNotification) window.showNotification(`❌ ${p.username} reached shot limit!`, p.colorHex);
                if (window.twitchManagerGlobal) window.twitchManagerGlobal.say(`❌ @${p.username} DNF! Reached stroke limit.`);
                if (window.updatePlayerCount) window.updatePlayerCount();
            }
        });
    }

}
