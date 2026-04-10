import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import * as CANNON from 'cannon-es';
import { LevelGenerator } from './game/LevelGenerator.js';
import { PlayerManager } from './game/PlayerManager.js';
import { PhysicsWorld } from './game/PhysicsWorld.js';
import { TwitchManager } from './TwitchManager.js';

let scene, camera, renderer, labelRenderer, controls;
let physicsWorld;
let levelGenerator, playerManager, twitchManager;

const clock = new THREE.Clock();

// Game State Machine
let gameState = 'setup'; // 'setup', 'lobby', 'playing', 'transition'
let currentHole = 1;
let maxHoles = 3;

let lobbyTimer = 0;
let roundTimer = 0;
let maxLobbyTimer = 20;
let maxRoundTimer = 180;
let maxShotLimit = 10;

init();
animate();

function init() {
    // Setup ThreeJS
    const container = document.getElementById('game-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Isometric-ish Top Down Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: false }); // False for retro feel
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // CSS 2D Renderer for Floating Div Overlays
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.left = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    // Basic orbit controls for streamer (optional to use)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't allow going under the ground

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20); // Mathematically taller trajectory perfectly catching sharp slope angles
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -40;
    scene.add(dirLight);

    // Physics
    physicsWorld = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    PhysicsWorld.initMaterials(physicsWorld);

    // Managers
    levelGenerator = new LevelGenerator(scene, physicsWorld);
    playerManager = new PlayerManager(scene, physicsWorld);
    twitchManager = new TwitchManager(handleTwitchCommand);
    
    // Mount it globally so PlayerManager can trigger responses when players sink holes
    window.twitchManagerGlobal = twitchManager;

    // Link UI
    document.getElementById('start-game-btn').addEventListener('click', startGame);
    document.getElementById('btn-end-round').addEventListener('click', endRoundEarly);
    document.getElementById('btn-quit-setup').addEventListener('click', quitToSetup);

    window.addEventListener('resize', onWindowResize, false);
}

function startGame() {
    // Read Setup Config
    const channelName = document.getElementById('channel-name').value;
    maxHoles = parseInt(document.getElementById('holes-limit').value) || 3;
    maxLobbyTimer = parseInt(document.getElementById('lobby-timer').value) || 20;
    maxRoundTimer = parseInt(document.getElementById('round-timer').value) || 180;
    maxShotLimit = parseInt(document.getElementById('shot-limit').value) || 10;
    
    // Hide Setup, Show Game HUD
    document.getElementById('setup-ui').style.display = 'none';
    document.getElementById('hud-ui').style.display = 'block';
    
    document.getElementById('hud-holes-total').innerText = maxHoles;

    // Connect to Twitch
    twitchManager.connect(channelName);

    // Initial Level Generation
    loadHole(1);
}

function loadHole(holeNum) {
    currentHole = holeNum;
    document.getElementById('hud-hole').innerText = currentHole;
    
    // Check mode
    const mode = document.querySelector('input[name="level-mode"]:checked').value;
    
    levelGenerator.clearLevel();
    
    // Only wipe the massive active lobby if we are literally starting a fresh MATCH
    if (holeNum === 1) {
        playerManager.clearPlayers();
    }

    if (mode === 'procedural') {
        const config = {
            scale: parseInt(document.getElementById('freq-scale') ? document.getElementById('freq-scale').value : 5),
            water: parseInt(document.getElementById('freq-water') ? document.getElementById('freq-water').value : 5),
            sand: parseInt(document.getElementById('freq-sand') ? document.getElementById('freq-sand').value : 5),
            hills: parseInt(document.getElementById('freq-hills') ? document.getElementById('freq-hills').value : 5),
            objects: parseInt(document.getElementById('freq-objects') ? document.getElementById('freq-objects').value : 5),
            boosters: parseInt(document.getElementById('freq-boosters') ? document.getElementById('freq-boosters').value : 5),
            chaos: parseInt(document.getElementById('freq-chaos') ? document.getElementById('freq-chaos').value : 1)
        };
        levelGenerator.generateProcedural(config); 
    } else {
        const code = document.getElementById('custom-level-code').value;
        levelGenerator.generateFromCode(code);
    }
    
    // Teleport any existing players gracefully to the newly generated starting pad
    if (holeNum > 1) {
        playerManager.resetForNextHole(levelGenerator.getStartPos());
    }
    
    window.updatePlayerCount(); // refresh UI

    // Align camera natively onto true physical geometry coordinates (not abstract array bounds)
    const w = (levelGenerator.width || 20) * levelGenerator.tileSize;
    const h = (levelGenerator.height || 10) * levelGenerator.tileSize;
    const centerX = w / 2;
    const centerZ = h / 2;
    
    // Auto-Scale vertically spanning completely above the massive array extents mathematically!
    const distanceY = Math.max(w * 1.0, h * 1.5, 20);
    const distanceZ = Math.max(w * 0.5, h * 0.8, 15);
    
    camera.position.set(centerX, distanceY, centerZ + distanceZ);
    camera.lookAt(centerX, 0, centerZ);

    if (controls) {
        controls.target.set(centerX, 0, centerZ);
        controls.update();
    }

    // Setup the Lobby Phase!
    gameState = 'lobby';
    lobbyTimer = maxLobbyTimer;
    document.getElementById('hud-timer-overlay').style.display = 'block';
    
    // Pure log fallback since bot replies are completely removed securely
    if (twitchManager.ws && twitchManager.ws.readyState === WebSocket.OPEN) {
        console.log(`Hole ${currentHole} generating. Lobby open!`);
    }
}

function startPlayingPhase() {
    gameState = 'playing';
    roundTimer = maxRoundTimer;
    console.log(`The hole has started! No more players can join.`);
}

function endRoundEarly() {
    gameState = 'transition';
    document.getElementById('hud-timer-overlay').style.display = 'none';

    // Penalize players who didn't reach the hole inside the time limit or shot limit
    playerManager.players.forEach(p => {
        if (p.state !== 'sunk') {
            // Strip out whatever strokes they took this hole, and apply the hard cap penalty + 2
            p.shots -= (p.holeShots || 0);
            p.shots += (maxShotLimit + 2);
            p.holeShots = (maxShotLimit + 2);
            
            // Only strictly enforce math structurally without crashing chat broadcast!
            if (window.twitchManagerGlobal) {
                console.log(`Oof! @${p.username} failed to finish.`);
            }
        }
    });

    window.updatePlayerCount(); // Update the scorecard before moving on!
    
    // Check if next hole, or finish match
    if (currentHole < maxHoles) {
        console.log(`Hole Complete! Moving to Hole ${currentHole + 1}!`);
        loadHole(currentHole + 1);
    } else {
        console.log(`Match Complete! Check the final scorecard!`);
        gameState = 'transition'; // Stay dead here so stream can see scorecard
        showFinalScorecard();
    }
}

function showFinalScorecard() {
    document.getElementById('match-complete-ui').style.display = 'block';
    
    const playersArr = Array.from(playerManager.players.values());
    playersArr.sort((a, b) => a.shots - b.shots);
    
    const listEl = document.getElementById('final-scorecard-list');
    listEl.innerHTML = '';
    
    playersArr.forEach(p => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'scorecard-name';
        nameSpan.style.color = p.colorHex || 'white';
        nameSpan.innerText = p.username;
        
        const scoreSpan = document.createElement('span');
        scoreSpan.innerText = p.state === 'sunk' ? `${p.shots} ✅` : p.shots;
        
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        listEl.appendChild(li);
    });
}

function quitToSetup() {
    gameState = 'setup';
    document.getElementById('setup-ui').style.display = 'block';
    document.getElementById('hud-ui').style.display = 'none';
    document.getElementById('match-complete-ui').style.display = 'none';
    
    levelGenerator.clearLevel();
    playerManager.clearPlayers();
    window.updatePlayerCount(); // clears scorecard
    
    if (twitchManager.ws) {
        twitchManager.ws.close();
        twitchManager.ws = null;
    }
}

// Hook Quit Button Native Call
document.getElementById('btn-final-quit').addEventListener('click', quitToSetup);

function handleTwitchCommand(user, command, args, hexColor) {
    if (gameState === 'setup' || gameState === 'transition') return;

    if (command === 'play') {
        if (gameState !== 'lobby') return; // Cannot join if game has started

        // Only announce if they weren't already playing
        if (!playerManager.players.has(user)) {
            const catchupShots = (currentHole - 1) * maxShotLimit;
            playerManager.addPlayer(user, hexColor, levelGenerator.getStartPos(), catchupShots);
            window.updatePlayerCount();
            
            if (catchupShots > 0) {
                console.log(`Welcome @${user}! You've joined late and start with ${catchupShots} strokes for missed holes.`);
            } else {
                console.log(`Welcome to the course, @${user}! Wait for the timer to finish before shooting!`);
            }
            window.showNotification(`+ ${user} joined`, hexColor);
        }
    } else if (command === 'shoot') {
        if (gameState !== 'playing') return; // Cannot shoot in lobby

        if (args.length >= 2) {
            const angle = parseFloat(args[0]);
            const power = parseFloat(args[1]);
            playerManager.shoot(user, angle, power, maxShotLimit);
        } else {
            // Optional: Twitch chat usage instructions
            // twitchManager.say(`@${user} Usage: !shoot [angle] [power]. Example: !shoot 45 10`);
        }
    }
}

window.updatePlayerCount = function() {
    document.getElementById('hud-players').innerText = playerManager.players.size;
    
    // Update Scorecard
    if (playerManager.players.size > 0) {
        document.getElementById('hud-scorecard').style.display = 'block';
    } else {
        document.getElementById('hud-scorecard').style.display = 'none';
    }
    
    const playersArr = Array.from(playerManager.players.values());
    playersArr.sort((a, b) => a.shots - b.shots);
    
    const top5 = playersArr.slice(0, 5);
    const listEl = document.getElementById('scorecard-list');
    listEl.innerHTML = '';
    
    // Also update the Title
    document.querySelector('#hud-scorecard h3').innerText = 'Top 5';
    
    top5.forEach(p => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'scorecard-name';
        nameSpan.style.color = p.colorHex || 'white';
        nameSpan.innerText = p.username;
        
        const scoreSpan = document.createElement('span');
        scoreSpan.innerText = p.state === 'sunk' ? `${p.shots} ✅` : p.shots;
        
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        listEl.appendChild(li);
    });
}

function updateTimerUI(secondsLeft, label) {
    if (secondsLeft < 0) secondsLeft = 0;
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
    const s = Math.floor(secondsLeft % 60).toString().padStart(2, '0');
    document.getElementById('hud-timer-text').innerText = `${m}:${s}`;
    document.getElementById('hud-timer-label').innerText = label;
}

function animate() {
    requestAnimationFrame(animate);
    
    const dt = Math.min(clock.getDelta(), 0.1);

    // State Machine Clock Handlers
    if (gameState === 'lobby') {
        lobbyTimer -= dt;
        updateTimerUI(lobbyTimer, 'LOBBY PHASE (Type !play)');
        if (lobbyTimer <= 0) {
            startPlayingPhase();
        }
    } else if (gameState === 'playing') {
        roundTimer -= dt;
        updateTimerUI(roundTimer, 'ROUND TIMER (Type !shoot)');
        if (roundTimer <= 0) {
            endRoundEarly();
        }
    }

    if (gameState !== 'setup') {
        if (gameState === 'playing' || gameState === 'lobby') {
            // Physics step
            physicsWorld.step(1 / 60, dt, 3);
            
            // Let player manager update hazards, sinks, AND advanced array-checks (sand thickness, boosters)
            const holeParams = levelGenerator ? levelGenerator.holePos : null;
            const sandParams = levelGenerator ? levelGenerator.sandTiles : [];
            const boosterParams = levelGenerator ? levelGenerator.boosters : [];
            const mapX = levelGenerator ? levelGenerator.width * levelGenerator.tileSize : 100;
            const mapZ = levelGenerator ? levelGenerator.height * levelGenerator.tileSize : 100;
            
            playerManager.update(dt, holeParams, sandParams, boosterParams, mapX, mapZ);
            
            // Sync dynamic obstacle visuals mathematically
            if (levelGenerator && levelGenerator.objects) {
                levelGenerator.objects.forEach(obj => {
                    if (obj.body && obj.body.mass > 0) {
                        obj.mesh.position.copy(obj.body.position);
                        obj.mesh.quaternion.copy(obj.body.quaternion);
                    }
                });
            }
        }

        // Check universal win condition: if all players are sunk or mathematically DNF, skip the rest of the round automatically
        if (gameState === 'playing' && playerManager.players.size > 0) {
            const allFinished = Array.from(playerManager.players.values()).every(p => {
                return p.state === 'sunk' || (p.holeShots >= maxShotLimit && p.state === 'idle');
            });
            if (allFinished) {
                endRoundEarly();
            }
        }
    }

    if (levelGenerator && levelGenerator.animateBoosters) {
        levelGenerator.animateBoosters(dt);
    }

    updateDynamicCamera(dt);

    if (controls) controls.update(); // Update damping for zoom
    renderer.render(scene, camera);
    if (labelRenderer) labelRenderer.render(scene, camera);
}

window.showNotification = function(msg, hexColor) {
    const list = document.getElementById('notification-list');
    const li = document.createElement('li');
    li.className = 'notif-item';
    li.innerHTML = msg;
    if (hexColor) {
        li.style.borderLeftColor = hexColor;
    }
    list.prepend(li); // Push to top logically
    
    // Auto-cleanup DOM to prevent memory bloat over infinite stream matches natively
    setTimeout(() => {
        if (li.parentElement) li.remove();
    }, 5000); // perfectly mirrors the animation duration cleanly
};

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (labelRenderer) labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

let autoCamTargetCenter = new THREE.Vector3(0, 0, 0);
let autoCamTargetPos = new THREE.Vector3(0, 20, 20);
let autoCamUpdateTimer = 0;

function updateDynamicCamera(dt) {
    const autoCamInput = document.getElementById('auto-cam-toggle');
    if (!autoCamInput || !autoCamInput.checked) return;
    
    if (gameState !== 'lobby' && gameState !== 'playing') return;
    if (!levelGenerator) return;

    autoCamUpdateTimer -= dt;
    if (autoCamUpdateTimer <= 0) {
        autoCamUpdateTimer = 1.0; // Strict 1s locked polling rate

        let box = new THREE.Box3();
        let hasPoints = false;

        if (gameState === 'lobby') {
            const w = levelGenerator.width * levelGenerator.tileSize;
            const h = levelGenerator.height * levelGenerator.tileSize;
            box.expandByPoint(new THREE.Vector3(0, 0, 0));
            box.expandByPoint(new THREE.Vector3(w, 0, h));
            hasPoints = true;
        } else if (gameState === 'playing') {
            const start = levelGenerator.getStartPos();
            const hole = levelGenerator.holePos;
            if (start) { box.expandByPoint(start); hasPoints = true; }
            if (hole) { box.expandByPoint(hole); hasPoints = true; }
            
            playerManager.players.forEach(p => {
                if (p.state !== 'sunk') {
                    box.expandByPoint(new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z));
                    hasPoints = true;
                }
            });
        }

        if (hasPoints) {
            box.getCenter(autoCamTargetCenter);
            let size = new THREE.Vector3();
            box.getSize(size);
            // Fixed angle strictly bounding pitch rigidly mapped roughly 25-degrees from Top-Down
            const pitchDeg = 65;
            const rad = pitchDeg * (Math.PI / 180);
            
            let fov = camera.fov * (Math.PI / 180);
            
            // Correct for Stream Aspect Ratio (e.g. 16:9 widescreen lateral space)
            let distX = (size.x / 2) / (Math.tan(fov / 2) * camera.aspect);
            
            // Project depth and height precisely onto vertical FOV bounds based on the fixed camera pitch
            let projectedHeight = size.z * Math.sin(rad) + size.y * Math.cos(rad);
            let distY = (projectedHeight / 2) / Math.tan(fov / 2);
            let baseDistance = Math.max(distX, distY) * 1.75; // 75% wide margin padding dynamically shielding streaming UI geometry clipping
            if (baseDistance < 10) baseDistance = 10;
            
            let cameraDistance = baseDistance;
            
            autoCamTargetPos.set(
                autoCamTargetCenter.x, 
                autoCamTargetCenter.y + (cameraDistance * Math.sin(rad)), 
                autoCamTargetCenter.z + (cameraDistance * Math.cos(rad))
            );
        }
    }

    // Always lerp extremely smoothly every frame, detached completely from the 1s calculation
    // Slow down lerp heavily for a deeply stiff, organic broadcast panning vibe.
    controls.target.lerp(autoCamTargetCenter, dt * 0.15);
    camera.position.lerp(autoCamTargetPos, dt * 0.15);
}
