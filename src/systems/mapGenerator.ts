import { GAME_WIDTH, GAME_HEIGHT } from '../core/constants';
import { NodeType, GlobalMapNode, GlobalMap } from '../data/typeNode';

export type { NodeType, GlobalMapNode, GlobalMap };

export function generateGlobalMap(rng: { getUniform: () => number }): GlobalMap {
    const layersCount = 8;
    let idCounter = 0;
    const globalMap: GlobalMap = { nodes: {}, layers: [] };

    for (let i = 0; i < layersCount; i++) {
        const layerNodes: GlobalMapNode[] = [];
        // Первый и последний слои - 1 узел, промежуточные - от 3 до 4
        const numNodes = (i === 0 || i === layersCount - 1) ? 1 : 3 + Math.floor(rng.getUniform() * 2);
        
        // Добавляем отступы сверху и снизу (150px)
        const layerY = GAME_HEIGHT - 150 - (i * (GAME_HEIGHT - 300) / (layersCount - 1));

        for (let j = 0; j < numNodes; j++) {
            // Центрируем узлы по горизонтали с отступами 20%
            const margin = GAME_WIDTH * 0.2;
            const spacing = (GAME_WIDTH - margin * 2) / (numNodes + 1);
            const nodeX = margin + spacing * (j + 1) + (rng.getUniform() - 0.5) * 50;
            
            const node: GlobalMapNode = {
                id: idCounter++,
                layer: i,
                x: nodeX,
                y: layerY,
                type: 'simple',
                biomeId: 'dungeon',
                next: [],
                status: i === 0 ? 'available' : 'locked'
            };
            layerNodes.push(node);
            globalMap.nodes[node.id] = node;
        }
        
        // Сортируем узлы в слое по X для предсказуемых связей
        layerNodes.sort((a, b) => a.x - b.x);
        globalMap.layers.push(layerNodes);
    }

    // Соединяем слои (упорядоченно)
    for (let i = 0; i < layersCount - 1; i++) {
        const currLayer = globalMap.layers[i];
        const nextLayer = globalMap.layers[i + 1];

        currLayer.forEach((cNode, cIdx) => {
            // Пытаемся соединить с узлами в следующем слое, которые близки по индексу
            // Это минимизирует переплетение линий
            const ratio = nextLayer.length / currLayer.length;
            const targetIdx = Math.floor(cIdx * ratio);
            
            // Основная связь
            const mainTarget = nextLayer[targetIdx];
            if (!cNode.next.includes(mainTarget.id)) cNode.next.push(mainTarget.id);

            // Шанс на дополнительную соседнюю связь (для ветвления)
            if (nextLayer.length > 1) {
                if (rng.getUniform() > 0.6 && targetIdx + 1 < nextLayer.length) {
                    const altTarget = nextLayer[targetIdx + 1];
                    if (!cNode.next.includes(altTarget.id)) cNode.next.push(altTarget.id);
                }
                if (rng.getUniform() > 0.6 && targetIdx - 1 >= 0) {
                    const altTarget = nextLayer[targetIdx - 1];
                    if (!cNode.next.includes(altTarget.id)) cNode.next.push(altTarget.id);
                }
            }
        });

        // Гарантируем, что у каждого узла в следующем слое есть хотя бы один входящий путь
        nextLayer.forEach((nNode, nIdx) => {
            const hasIncoming = currLayer.some(c => c.next.includes(nNode.id));
            if (!hasIncoming) {
                const ratio = currLayer.length / nextLayer.length;
                const sourceIdx = Math.floor(nIdx * ratio);
                const source = currLayer[sourceIdx];
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
