import * as bitECS from 'bitecs';
import { LaserBeam, LightningChain } from '../domain/components';
import { ITEMS_DB } from '../data/registry';

export class VfxSystem {
    private laserQuery = bitECS.defineQuery([LaserBeam]);
    private lightningQuery = bitECS.defineQuery([LightningChain]);

    update(world: bitECS.IWorld, onLightningCreated?: (points: Array<{x: number, y: number}>, life: number) => void) {
        // Update Lasers
        const lasers = this.laserQuery(world);
        for (let i = 0; i < lasers.length; i++) {
            const eid = lasers[i];
            LaserBeam.life[eid]--;
            if (LaserBeam.life[eid] <= 0) {
                bitECS.removeEntity(world, eid);
            }
        }

        // Update Lightnings
        const lightnings = this.lightningQuery(world);
        for (let i = 0; i < lightnings.length; i++) {
            const eid = lightnings[i];
            
            // If it's the first frame, trigger the visual effect via callback
            if (LightningChain.life[eid] === LightningChain.maxLife[eid] && onLightningCreated) {
                const points = [];
                const count = LightningChain.count[eid];
                for (let j = 0; j < count; j++) {
                    points.push({
                        x: LightningChain.pointsX[eid][j],
                        y: LightningChain.pointsY[eid][j]
                    });
                }
                onLightningCreated(points, LightningChain.life[eid]);
            }

            LightningChain.life[eid]--;
            if (LightningChain.life[eid] <= 0) {
                bitECS.removeEntity(world, eid);
            }
        }
    }

    updateLootGlow(droppedItems: any[], particles: any, frameCount: number) {
        if (frameCount % 5 !== 0) return; // Optimize: spawn particles every 5 frames

        for (const item of droppedItems) {
            const itemData = ITEMS_DB[item.itemId];
            if (!itemData) continue;

            const rarity = itemData.rarity;
            let color = '#fff';
            if (rarity === 'magic') color = '#6bf';
            if (rarity === 'rare') color = '#fe6';
            if (rarity === 'unique') color = '#c6f';

            particles.spawn(
                item.x + (Math.random() - 0.5) * 10,
                item.y + (Math.random() - 0.5) * 10,
                1,
                color
            );
        }
    }
}
