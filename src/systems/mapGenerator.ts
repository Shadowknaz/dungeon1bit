import { GAME_WIDTH, GAME_HEIGHT } from '../core/constants';
import { NodeType, GlobalMapNode, GlobalMap } from '../data/typeNode';

export type { NodeType, GlobalMapNode, GlobalMap };

export function generateGlobalMap(rng: { getUniform: () => number }): GlobalMap {
    const layersCount = 6;
    let idCounter = 0;
    const globalMap: GlobalMap = { nodes: {}, layers: [] };

    for (let i = 0; i < layersCount; i++) {
        const layerNodes: GlobalMapNode[] = [];
        const numNodes = (i === 0 || i === layersCount - 1) ? 1 : 2 + Math.floor(rng.getUniform() * 3);
        const layerY = GAME_HEIGHT - 100 - (i * (GAME_HEIGHT - 200) / (layersCount - 1));

        for (let j = 0; j < numNodes; j++) {
            const spacing = GAME_WIDTH / (numNodes + 1);
            const nodeX = spacing * (j + 1) + (rng.getUniform() - 0.5) * 60;
            const node: GlobalMapNode = {
                id: idCounter++,
                layer: i,
                x: nodeX,
                y: layerY,
                type: 'simple',
                next: [],
                status: i === 0 ? 'available' : 'locked'
            };
            layerNodes.push(node);
            globalMap.nodes[node.id] = node;
        }
        globalMap.layers.push(layerNodes);
    }

    // Connect layers
    for (let i = 0; i < layersCount - 1; i++) {
        const currLayer = globalMap.layers[i];
        const nextLayer = globalMap.layers[i + 1];

        currLayer.forEach(cNode => {
            const target = nextLayer[Math.floor(rng.getUniform() * nextLayer.length)];
            if (!cNode.next.includes(target.id)) cNode.next.push(target.id);
        });

        nextLayer.forEach(nNode => {
            const hasIncoming = currLayer.some(c => c.next.includes(nNode.id));
            if (!hasIncoming) {
                const source = currLayer[Math.floor(rng.getUniform() * currLayer.length)];
                if (!source.next.includes(nNode.id)) source.next.push(nNode.id);
            }
        });
    }

    // Assign special types
    const l2 = globalMap.layers[2];
    if (l2 && l2.length > 0) l2[Math.floor(rng.getUniform() * l2.length)].type = 'merchant';

    const l4 = globalMap.layers[4];
    if (l4 && l4.length > 0) l4[Math.floor(rng.getUniform() * l4.length)].type = 'shrine';

    // Boss on the last layer (layer 5, before final exit)
    const l5 = globalMap.layers[5];
    if (l5 && l5.length > 0) {
        l5[Math.floor(rng.getUniform() * l5.length)].type = 'boss';
    }

    return globalMap;
}
