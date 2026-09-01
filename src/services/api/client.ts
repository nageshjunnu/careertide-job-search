type ApiOptions = RequestInit & { timeoutMs?: number }

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Shared request boundary for every external API call. */
export async function makeApiCall<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const controller = new AbortController()
  const { timeoutMs = 12_000, signal, ...requestOptions } = options
  const abortRequest = () => controller.abort()
  signal?.addEventListener('abort', abortRequest, { once: true })
  const timeout = window.setTimeout(abortRequest, timeoutMs)

  try {
    const response = await fetch(url, { ...requestOptions, signal: controller.signal })
    if (!response.ok) {
      if (response.status === 401 && options.headers && new Headers(options.headers).has('Authorization')) {
        localStorage.removeItem('candidate_token')
        localStorage.removeItem('candidate_user_id')
        localStorage.removeItem('candidate_name')
        localStorage.removeItem('candidate_email')
        window.dispatchEvent(new Event('candidate_auth_change'))
      }
      throw new ApiError(`Request failed with status ${response.status}`, response.status)
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('Request timed out')
    throw new ApiError(error instanceof Error ? error.message : 'Unexpected API error')
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abortRequest)
  }
}
