import React from 'react'

interface SearchTimelineProps {
  progress: Array<{
    nodeId: string
    status: 'running' | 'finished' | 'error'
    content: string
    timing?: any
  }>
}

export function SearchTimeline({ progress }: SearchTimelineProps) {
  return (
    <div className="mt-8">
      <div className="relative">
        {progress.map((node, index) => (
          <div key={node.nodeId} className="mb-4 flex items-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white">
              {index + 1}
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">{node.content}</p>
              {node.timing && (
                <p className="text-xs text-gray-500 mt-1">
                  {Object.entries(node.timing).map(([key, value]) => (
                    <span key={key} className="mr-2">
                      {key}: {(value as any).duration}ms
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 