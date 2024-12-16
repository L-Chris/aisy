import crypto from 'crypto';
import Queue, { QueueWorkerCallback } from 'queue'

export const createQueue = (params: {
  timeout?: number
  concurrency?: number
  name: string
  delay?: number
  showProgress?: boolean
}) => {
  const timeout = params.timeout || 10000
  const concurrency = params.concurrency || 1
  const startTime = new Date()
  const q = new Queue({ results: [], timeout, concurrency })

  const onTimeout = (next: () => void) => {
    console.log(`[${params.name}] job timed out:`)
    next()
  }

  const onSuccess = (e: any) => {
    if (params.showProgress) {
      const results = q.results || []
      console.log(
        `[${params.name}] Progress ${results.length}/${
          (q.length || q.length - 1) + results.length
        }`
      )
    }
  }

  q.on('timeout', onTimeout)
  q.on('success', onSuccess)

  return {
    queue: q,
    async push (job: (cb: QueueWorkerCallback) => any) {
      q.push(async function (cb) {
        if (params.delay) await wait(params.delay)
        return job(cb || (() => {}))
      })
    },
    start () {
      return new Promise((resolve, reject) => {
        q.start(err => {
          if (err) {
            q.off('timeout', onTimeout)
            q.off('success', onSuccess)
            console.log(`[${params.name}]queue err`, err)
            return reject(err)
          }
          const results = q.results || []
          const failedJobs = results.filter(_ => !_?.[0]?.success)
          const endTime = new Date()
          console.log(`
[${params.name}] Finished ${results.length - failedJobs.length}/${
            results.length
          }
                 Failed ${failedJobs.length}
                 Startred at ${startTime}
                 Finished at ${endTime}
                 Time elapsed ${endTime.valueOf() - startTime.valueOf()}
`)

          q.off('timeout', onTimeout)
          q.off('success', onSuccess)
          return resolve(true)
        })
      })
    }
  }
}

const wait = (timeout: number) =>
  new Promise(resolve => setTimeout(resolve, timeout))

export const getErrorMessage = (err: any) => {
  if (err?.response?.data) {
    if (
      typeof err?.response?.data === 'string' &&
      err?.response?.data?.length >= 1000
    )
      return err?.response?.data.slice(100)
    return err?.response?.data
  }
  if (err?.message) return err.message
  return typeof err === 'string' && err.length > 1000 ? err.slice(100) : err
}

export const getUUID = () => crypto.randomUUID()