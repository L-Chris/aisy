import React from 'react'

interface ProgressProps {
  status: 'running' | 'finished' | 'error'
}

export function Progress({ status }: ProgressProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'text-blue-500'
      case 'finished':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return '进行中'
      case 'finished':
        return '已完成'
      case 'error':
        return '出错'
      default:
        return '未知'
    }
  }

  return (
    <span className={`text-sm ${getStatusColor()}`}>
      {getStatusText()}
    </span>
  )
} 