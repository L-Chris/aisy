import { useState, useEffect } from 'react'

// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function useSearch() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<any>()
  const [progress, setProgress] = useState<any[]>([])
  const [searchId, setSearchId] = useState<string>()

  useEffect(() => {
    let timer: NodeJS.Timeout
    
    async function pollProgress() {
      if (!searchId) return
      
      try {
        const res = await fetch(`${API_URL}/api/search/${searchId}/progress`)
        const data = await res.json()
        
        if (data.success) {
          setProgress(data.data.progress)
          
          // 处理最终结果
          if (data.data.completed) {
            if (data.data.error) {
              setError(data.data.error)
            } else if (data.data.result) {
              setResult(data.data.result)
            }
            setSearchId(undefined) // 停止轮询
            setLoading(false)
            return
          }
          
          timer = setTimeout(pollProgress, 1000)
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err)
        setError('获取搜索进度失败')
        setSearchId(undefined)
        setLoading(false)
      }
    }

    if (searchId) {
      pollProgress()
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [searchId])

  const search = async (question: string) => {
    setLoading(true)
    setError(undefined)
    setResult(undefined)
    setProgress([])
    
    try {
      const res = await fetch(`${API_URL}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setSearchId(data.data.searchId)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('搜索请求失败')
      console.error('Search error:', err)
      setLoading(false)
    }
  }

  return {
    search,
    result,
    progress,
    loading,
    error
  }
} 