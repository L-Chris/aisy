import { Page, Searcher } from './searcher';
import { Browser } from './browser';
import { LLM } from './llm';
import { getErrorMessage, getUUID } from './utils';
import { PROMPT } from './prompts';
import fs from 'fs';
import path from 'path';

class SearchGraph {
    private nodes: Map<string, Node>;
    private edges: Map<string, Edge[]>;
    private llm: LLM
    private proxy?: string
    private i: number
    private logDir: string;

    constructor(options: { proxy?: string } = {}) {
        this.nodes = new Map();
        this.edges = new Map();
        this.llm = new LLM()
        this.proxy = options.proxy
        this.i = 0
        this.logDir = path.join(process.cwd(), 'logs');
        // 确保日志目录存在
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    private logAndSave(type: string, data: any) {
        const timestamp = new Date().getTime();
        const logFile = path.join(this.logDir, `${type}_${timestamp}.json`);
        fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
        console.log(`[${type}] Saved to ${logFile}`);
    }

    async plan(content: string) {
        console.log('\n[Plan] Starting with question:', content);
        try {
            const res = await this.llm.generate(
                `${PROMPT.PLAN}\n## 问题\n${content}\n`, 'json_object'
            )
            console.log('[Plan] LLM Response:', res);
            this.logAndSave('plan_llm_response', { question: content, response: res });
            
            const qs = JSON.parse(res)
            const nodes = Array.isArray(qs?.nodes) ? qs.nodes as RawNode[] : []
            console.log('[Plan] Parsed nodes structure:', JSON.stringify(nodes, null, 2));
            
            const root = this.addRootNode(content)
            console.log('[Plan] Root node created:', root.id);
            
            await this.processNodes(nodes, root.id)
            console.log('[Plan] All nodes processed');
            
            await this.processRootNode(root.id)
            console.log('[Plan] Root node processed');
            
            // 保存最终的搜索图结构
            this.logAndSave('final_search_graph', {
                nodes: Array.from(this.nodes.entries()),
                edges: Array.from(this.edges.entries())
            });
            
            return {
                nodes: this.nodes,
                edges: this.edges,
                answer: root.answer || ''
            }
        } catch (error) {
            console.error(`[Plan] Error:`, error);
            this.logAndSave('plan_error', {
                error: getErrorMessage(error),
                question: content
            });
            return {
                nodes: new Map(),
                edges: new Map(),
                answer: ''
            }
        } finally {
            // 确保关闭浏览器实例
            await Browser.close()
        }
    }

    private async processNodes(nodes: RawNode[], parentId: string) {
        console.log(`\n[ProcessNodes] Processing ${nodes.length} nodes for parent:`, parentId);
        
        const promises = nodes.map(async (node) => {
            console.log(`[ProcessNodes] Creating node for content:`, node.content);
            const newNode = this.addNode(node.content, parentId)
            
            if (Array.isArray(node.children) && node.children.length > 0) {
                console.log(`[ProcessNodes] Node ${newNode.id} has ${node.children.length} children`);
                await this.processNodes(node.children, newNode.id)
            }
            
            console.log(`[ProcessNodes] Executing node ${newNode.id}`);
            await this.executeNodeWithChildren(newNode.id)
            
            return newNode
        })

        await Promise.all(promises)
        console.log(`[ProcessNodes] Completed all nodes for parent:`, parentId);
    }

    private addNode(nodeContent: string, parentId: string): Node {
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

    private async executeNodeWithChildren(nodeId: string) {
        console.log(`\n[ExecuteNode] Starting execution for node:`, nodeId);
        const node = this.nodes.get(nodeId)
        if (!node) {
            console.error(`[ExecuteNode] Node ${nodeId} not found`);
            return;
        }

        const childrenIds = this.getChildren(nodeId)
        console.log(`[ExecuteNode] Node ${nodeId} has ${childrenIds.length} children`);
        
        const children = childrenIds
            .map(id => this.nodes.get(id))
            .filter((node): node is Node => !!node)

        const allFinished = children.every(node => 
            node.state === NODE_STATE.FINISHED || 
            node.state === NODE_STATE.ERROR
        )

        if (!allFinished) {
            console.error(`[ExecuteNode] Node ${nodeId}: Some child nodes are not finished`);
            this.logAndSave(`node_${nodeId}_children_error`, {
                nodeId,
                children: children.map(c => ({
                    id: c.id,
                    state: c.state,
                    content: c.content
                }))
            });
            return;
        }

        const childResponses = children
            .filter(node => node.answer)
            .map(node => ({
                content: node.content,
                answer: node.answer || ''
            }))

        console.log(`[ExecuteNode] Executing search for node ${nodeId}`);
        node.state = NODE_STATE.RUNNING
        
        try {
            const searcher = new Searcher({ proxy: this.proxy });
            const response = await searcher.run(node.content, childResponses)
            node.answer = response.answer
            node.pages = response.pages
            node.state = NODE_STATE.FINISHED
            
            console.log(`[ExecuteNode] Node ${nodeId} completed successfully`);
            this.logAndSave(`node_${nodeId}_result`, {
                nodeId,
                content: node.content,
                answer: node.answer,
                pages: node.pages
            });
        } catch (error) {
            console.error(`[ExecuteNode] Error for node ${nodeId}:`, error);
            node.state = NODE_STATE.ERROR
            this.logAndSave(`node_${nodeId}_error`, {
                nodeId,
                error: getErrorMessage(error),
                content: node.content
            });
        }
    }

    private async processRootNode(rootId: string) {
        console.log('\n[ProcessRoot] Starting root node processing');
        const root = this.nodes.get(rootId)
        if (!root) return

        const childrenIds = this.getChildren(rootId)
        const children = childrenIds
            .map(id => this.nodes.get(id))
            .filter((node): node is Node => !!node)

        const allFinished = children.every(node => 
            node.state === NODE_STATE.FINISHED || 
            node.state === NODE_STATE.ERROR
        )

        if (!allFinished) {
            console.error('[ProcessRoot] Some child nodes are not finished');
            this.logAndSave('root_node_error', {
                children: children.map(c => ({
                    id: c.id,
                    state: c.state,
                    content: c.content
                }))
            });
            return;
        }

        const responses = children
            .filter(node => node.answer)
            .map(node => ({
                content: node.content,
                answer: node.answer || ''
            }))

        const finalAnswer = await this.llm.generate(
            `${PROMPT.SUMMARY}\n## 原始问题\n${root.content}\n## 子问题回答\n${responses.map((r, i) => `[${i}] 问题：${r.content}\n回答：${r.answer}`).join('\n---\n')}`
        )

        root.answer = finalAnswer
        root.state = NODE_STATE.FINISHED
        console.log('[ProcessRoot] Root node processing completed');
        this.logAndSave('root_node_result', {
            answer: finalAnswer,
            childResponses: responses
        });
    }

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

    getNode(nodeName: string): Node | undefined {
        return this.nodes.get(nodeName);
    }

    getChildren(nodeName: string): string[] {
        const edges = this.edges.get(nodeName) || [];
        return edges.map(edge => edge.name);
    }

    getParents(nodeName: string): string[] {
        const parents: string[] = [];
        this.edges.forEach((edges, startNode) => {
            if (edges.some(edge => edge.name === nodeName)) {
                parents.push(startNode);
            }
        });
        return parents;
    }

    reset(): void {
        this.nodes.clear();
        this.edges.clear();
    }
}

type NodeType = 'root' | 'searcher';

interface Node {
    id: string;
    type: NodeType;
    content: string;
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