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
            
            // 递归处理所有节点并等待所有子节点完成
            await this.processNodes(nodes, root.id)
            
            // 处理根节点
            await this.processRootNode(root.id)
            
            return {
                nodes: this.nodes,
                edges: this.edges,
                answer: root.answer || ''
            }
        } catch (error) {
            console.error(`[plan] error ${getErrorMessage(error)}`)
            return {
                nodes: new Map(),
                edges: new Map(),
                answer: ''
            }
        }
    }

    // 递归处理节点
    private async processNodes(nodes: RawNode[], parentId: string) {
        // 并行处理同层节点
        const promises = nodes.map(async (node) => {
            // 先创建节点，但不执行搜索
            const newNode = this.createNode(node.content, parentId)
            
            // 如果有子节点，先处理所有子节点
            if (Array.isArray(node.children) && node.children.length > 0) {
                await this.processNodes(node.children, newNode.id)
            }
            
            // 等待所有子节点处理完成后，再执行当前节点的搜索
            await this.executeNodeWithChildren(newNode.id)
            
            return newNode
        })

        // 等待所有同层节点处理完成
        await Promise.all(promises)
    }

    // 创建节点但不执行搜索
    private createNode(nodeContent: string, parentId: string): Node {
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
        return node
    }

    // 执行节点搜索，包括处理其子节点的答案
    private async executeNodeWithChildren(nodeId: string) {
        const node = this.nodes.get(nodeId)
        if (!node) return

        // 获取所有子节点
        const childrenIds = this.getChildren(nodeId)
        const children = childrenIds
            .map(id => this.nodes.get(id))
            .filter((node): node is Node => !!node)

        // 确保所有子节点都已完成
        const allFinished = children.every(node => 
            node.state === NODE_STATE.FINISHED || 
            node.state === NODE_STATE.ERROR
        )

        if (!allFinished) {
            console.error(`Node ${nodeId}: Some child nodes are not finished`)
            return
        }

        // 收集所有子节点的答案作为上下文
        const childResponses: QuestionAnswer[] = children
            .filter(node => node.answer)
            .map(node => ({
                content: node.content,
                answer: node.answer || ''
            }))

        // 执行当前节点的搜索
        node.state = NODE_STATE.RUNNING
        try {
            const searcher = new Searcher({ proxy: this.proxy });
            const response = await searcher.run(node.content, childResponses)
            node.answer = response.answer
            node.pages = response.pages
            node.state = NODE_STATE.FINISHED
        } catch (error) {
            console.error(`[executeNodeWithChildren] error for node ${nodeId}: ${error}`);
            node.state = NODE_STATE.ERROR
        }
    }

    // 处理根节点
    private async processRootNode(rootId: string) {
        const root = this.nodes.get(rootId)
        if (!root) return

        // 获取所有直接子节点
        const childrenIds = this.getChildren(rootId)
        const children = childrenIds
            .map(id => this.nodes.get(id))
            .filter((node): node is Node => !!node)

        // 确保所有子节点都已完成
        const allFinished = children.every(node => 
            node.state === NODE_STATE.FINISHED || 
            node.state === NODE_STATE.ERROR
        )

        if (!allFinished) {
            console.error('Root node: Some child nodes are not finished')
            return
        }

        // 收集所有子节点的答案
        const responses: QuestionAnswer[] = children
            .filter(node => node.answer)
            .map(node => ({
                content: node.content,
                answer: node.answer || ''
            }))

        // 生成最终答案
        const finalAnswer = await this.llm.generate(
            `${PROMPT.SUMMARY}
## 原始问题
${root.content}
## 子问题回答
${responses.map((r, i) => `[${i}] 问题：${r.content}\n回答：${r.answer}`).join('\n---\n')}
`
        )

        root.answer = finalAnswer
        root.state = NODE_STATE.FINISHED
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