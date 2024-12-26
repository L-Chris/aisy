import React from 'react'
import { SearchProgress } from './components/SearchProgress'
import { SearchInput } from './components/SearchInput'
import { SearchResult } from './components/SearchResult'
import { SearchTimeline } from './components/SearchTimeline'
import { useSearch } from './hooks/useSearch'
// import './App.css'

export default function App() {
  const { 
    search, 
    result, 
    progress, 
    loading, 
    error 
  } = useSearch()

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">AISY：Next Generation AI Search Engine</h1>
      
      <SearchInput 
        onSearch={search}
        loading={loading}
      />

      {error && (
        <div className="text-red-500 mt-4">
          {error}
        </div>
      )}

      {progress && progress.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">搜索进度</h2>
          <SearchProgress progress={progress} />
          <SearchTimeline progress={progress} />
        </div>
      )}

      {result && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">搜索结果</h2>
          <SearchResult result={result} />
        </div>
      )}
    </div>
  )
} 