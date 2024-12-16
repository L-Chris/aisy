import crypto from 'crypto';
import { Page, QuestionAnswer, Searcher } from './searcher';

class SearchGraph {
    private nodes: Map<string, Node>;
    private edges: Map<string, Edge[]>;

    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    /**
     * 执行搜索
     */
    async executeSearch(nodeName: string, nodeContent: string, parentResponses: QuestionAnswer[]): Promise<Node | undefined> {
        // 搜索结果
        const node = this.nodes.get(nodeName);
        if (!node) return;
        try {
            const searcher = new Searcher();
            const response = await searcher.run(nodeContent, parentResponses)
            node.answer = response.answer
            node.pages = response.pages
            node.state = NODE_STATE.FINISHED
        } catch (error) {
            console.error(`[executeSearch] error ${error}`);
            node.state = NODE_STATE.ERROR
        }

        return node
    }

    /**
     * 添加根节点
     */
    addRootNode(nodeContent: string, nodeName: string = 'root'): void {
        this.nodes.set(nodeName, {
            id: 'root',
            content: nodeContent,
            type: 'root',
            state: NODE_STATE.NOT_STARTED
        });
        this.edges.set(nodeName, []);
    }

    addNode(nodeName: string, nodeContent: string): void {
        this.nodes.set(nodeName, {
            id: crypto.randomUUID(),
            content: nodeContent,
            type: 'searcher',
            state: NODE_STATE.NOT_STARTED
        });
        this.edges.set(nodeName, []);

        // 获取父节点的历史信息
        const parentNodes: Node[] = [];
        this.edges.forEach((group, startNode) => {
            group.forEach(edge => {
                if (edge.name === nodeName 
                    && this.nodes.has(startNode) 
                    && this.nodes.get(startNode)?.answer) {
                    const node = this.nodes.get(startNode);
                    if (node) parentNodes.push(node);
                }
            });
        });

        // 格式化父节点历史信息
        const parentResponses = parentNodes.map(node => ({
            content: node.content,
            answer: node.answer || ''
        }));

        // 执行搜索
        this.executeSearch(nodeName, nodeContent, parentResponses);
    }

    /**
     * 添加边（建立父子关系）
     */
    addEdge(startNode: string, endNode: string) {
        const edges = this.edges.get(startNode) || [];
        const edge = {
            id: crypto.randomUUID(), // 生成唯一ID
            name: endNode
        }
        edges.push(edge);
        this.edges.set(startNode, edges);
        return edge
    }

    /**
     * 获取节点信息
     */
    getNode(nodeName: string): Node | undefined {
        return this.nodes.get(nodeName);
    }

    /**
     * 获取子节点列表
     */
    getChildren(nodeName: string): string[] {
        const edges = this.edges.get(nodeName) || [];
        return edges.map(edge => edge.name);
    }

    /**
     * 获取父节点列表
     */
    getParents(nodeName: string): string[] {
        const parents: string[] = [];
        this.edges.forEach((edges, startNode) => {
            if (edges.some(edge => edge.name === nodeName)) {
                parents.push(startNode);
            }
        });
        return parents;
    }

    /**
     * 重置图
     */
    reset(): void {
        this.nodes.clear();
        this.edges.clear();
    }
}

// 定义类型
type NodeType = 'root' | 'searcher';

interface Node {
    id: string;
    type: NodeType; // 节点类型
    content: string; // 节点对应的问题
    answer?: string;
    pages?: Page[];
    state: NODE_STATE;
}

interface Edge {
    id: string;
    name: string;
}

enum NODE_STATE {
    NOT_STARTED = 1,
    RUNNING = 2,
    FINISHED = 3,
    ERROR = 4
}

export {
    SearchGraph
}