import * as CANNON from 'cannon-es';

export class PhysicsWorld {
    // This class sets up additional logic if we want a separate Physics module wrapper.
    // However, in main.js we created the core CANNON.World. 
    // This file can serve as a place to declare our Physics Materials and contact logic.

    static initMaterials(world) {
        // Define physical properties
        this.grassMaterial = new CANNON.Material('grass');
        this.sandMaterial = new CANNON.Material('sand');
        this.waterMaterial = new CANNON.Material('water');
        this.wallMaterial = new CANNON.Material('wall');
        this.ballMaterial = new CANNON.Material('ball');

        // Bounciness of ball on grass
        const ballGrassContact = new CANNON.ContactMaterial(
            this.grassMaterial, this.ballMaterial, {
                friction: 0.5,
                restitution: 0.4
            }
        );
        world.addContactMaterial(ballGrassContact);

        // Bouncy walls
        const ballWallContact = new CANNON.ContactMaterial(
            this.wallMaterial, this.ballMaterial, {
                friction: 0.1,
                restitution: 0.7
            }
        );
        world.addContactMaterial(ballWallContact);

        // Sand (High friction, low bounciness and we will add linear damping dynamically)
        const ballSandContact = new CANNON.ContactMaterial(
            this.sandMaterial, this.ballMaterial, {
                friction: 0.9,
                restitution: 0.0
            }
        );
        world.addContactMaterial(ballSandContact);
        
        // Add a collision event listener directly inside the world for water skipping logic
        world.addEventListener('beginContact', (event) => {
            const bodyA = event.bodyA;
            const bodyB = event.bodyB;
            
            // We tag bodies when we create them in LevelGenerator & PlayerManager
            // to check if it's a "water" collision
            const isWater = (b) => b.material === this.waterMaterial;
            const isBall = (b) => b.material === this.ballMaterial;

            if ((isWater(bodyA) && isBall(bodyB)) || (isWater(bodyB) && isBall(bodyA))) {
                const ball = isBall(bodyA) ? bodyA : bodyB;
                
                // Sink / Drown penalty natively stopping entirely (handled eventually by sink managers)
                ball.velocity.set(0, 0, 0); // Stops dead in water
                ball.isDrowned = true;
            }
        });
    }
}
