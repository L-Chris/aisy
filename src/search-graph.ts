
import { Page, QuestionAnswer, Searcher } from './searcher';
import { LLM } from './llm';
import { getErrorMessage, getUUID } from './utils';
import { PROMPT } from './prompts';

class SearchGraph {
    private nodes: Map<string, Node>;
    private edges: Map<string, Edge[]>;
    private llm: LLM
    private proxy?: string
    private i: number

    constructor(options: { proxy?: string } = {}) {
        this.nodes = new Map();
        this.edges = new Map();
        this.llm = new LLM()
        this.proxy = options.proxy
        this.i = 0
    }

    async plan(content: string) {
        const res = await this.llm.generate(
`${PROMPT.PLAN}
## 问题
${content}
`
        )
        try {
            const qs = JSON.parse(res)
            const nodes = Array.isArray(qs?.nodes) ? qs.nodes as RawNode[] : []
            const root = this.addRootNode(content)
            for (const node of nodes) {
                this.addNode(node.content, root.id)
            }

          } catch (error) {
            console.error(`[plan] error ${getErrorMessage(error)}`)
            return []
        }
    }

    /**
     * 执行搜索
     */
    async executeSearch(nodeId: string, nodeContent: string, parentResponses: QuestionAnswer[]): Promise<Node | undefined> {
        // 搜索结果
        const node = this.nodes.get(nodeId);
        if (!node) return;
        try {
            const searcher = new Searcher({ proxy: this.proxy });
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
    addRootNode(nodeContent: string) {
        const node: Node = {
            id: 'root',
            content: nodeContent,
            type: 'root',
            state: NODE_STATE.NOT_STARTED,
            answer: '',
            pages: []
        }
        this.nodes.set(node.id, node);
        this.edges.set(node.id, []);
        return node
    }

    async addNode(nodeContent: string, parentId: string) {
        const node: Node = {
            id: getUUID(),
            content: nodeContent,
            type: 'searcher',
            state: NODE_STATE.NOT_STARTED,
            answer: '',
            pages: []
        }
        this.nodes.set(node.id, node);
        this.addEdge(parentId, node.id);

        // 获取父节点的历史信息
        const parentNodes: Node[] = [];
        this.edges.forEach((group, startNode) => {
            group.forEach(edge => {
                if (edge.name === parentId 
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
        return this.executeSearch(node.id, nodeContent, parentResponses);
    }

    /**
     * 添加边（建立父子关系）
     */
    addEdge(startNode: string, endNode: string) {
        const edges = this.edges.get(startNode) || [];
        const edge = {
            id: getUUID(),
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

interface RawNode {
    content: string;
    children: RawNode[];
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