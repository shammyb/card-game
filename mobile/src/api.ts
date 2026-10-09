export const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://api.huntarish.com'
if (!__DEV__ && !apiUrl.startsWith('https://')) throw new Error('Production sign-in requires HTTPS.')

export async function request(path: string, token: string | null, data?: Record<string, string>) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
        const response = await fetch(`${apiUrl}/auth/${path}`, {
            method: data ? 'POST' : 'GET',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: data ? JSON.stringify(data) : undefined,
            signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to complete the request.')
        return result
    } finally { clearTimeout(timer) }
}
