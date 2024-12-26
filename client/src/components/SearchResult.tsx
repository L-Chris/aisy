import React from 'react'

interface SearchResultProps {
  result: {
    answer: string
    pages: Array<{
      title: string
      url: string
      content?: string
      relevance?: number
    }>
  }
}

export function SearchResult({ result }: SearchResultProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-medium mb-4">最终答案</h3>
        <p className="text-gray-700 whitespace-pre-wrap">
          {result.answer}
        </p>
      </div>

      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-medium mb-4">参考来源</h3>
        <div className="space-y-4">
          {result.pages.map((page, i) => (
            <div key={i} className="border-b pb-4 last:border-0">
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline font-medium"
              >
                {page.title}
              </a>
              {page.relevance && (
                <span className="ml-2 text-sm text-gray-500">
                  相关度: {page.relevance}
                </span>
              )}
              {page.content && (
                <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                  {page.content}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 