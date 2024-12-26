export interface SearchEvent {
  nodeId: string
  status: 'created' | 'running' | 'finished' | 'error'
  content: string
  answer?: string
  pages?: any[]
  timing?: any
  children?: string[]
  error?: string
}

export interface SearchProgress {
  nodeId: string
  status: 'running' | 'finished' | 'error'
  content: string
  answer?: string
  pages?: any[]
  timing?: any
  children?: string[]
} 