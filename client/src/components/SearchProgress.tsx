import React from 'react'
import { Progress } from './Progress'

interface SearchProgressProps {
  progress: Array<{
    nodeId: string
    status: 'running' | 'finished' | 'error'
    content: string
    answer?: string
    pages?: any[]
    timing?: any
    children?: string[]
  }>
}

export function SearchProgress({ progress }: SearchProgressProps) {
  return (
    <div className="space-y-4">
      {progress.map(node => (
        <div 
          key={node.nodeId}
          className="border rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">{node.content}</h3>
            <Progress status={node.status} />
          </div>

          {node.pages && node.pages.length > 0 && (
            <div className="mt-2">
              <h4 className="text-sm font-medium mb-1">搜索结果</h4>
              <div className="space-y-2">
                {node.pages.map((page, i) => (
                  <div 
                    key={i}
                    className="text-sm text-gray-600"
                  >
                    <a 
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      {page.title}
                    </a>
                    {page.relevance && (
                      <span className="ml-2 text-xs">
                        相关度: {page.relevance}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {node.answer && (
            <div className="mt-2">
              <h4 className="text-sm font-medium mb-1">回答</h4>
              <p className="text-sm text-gray-600">{node.answer}</p>
            </div>
          )}

          {node.timing && (
            <div className="mt-2 text-xs text-gray-500">
              耗时: {Object.entries(node.timing).map(([key, value]) => (
                <span key={key} className="mr-2">
                  {key}: {(value as any).duration}ms
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
} 