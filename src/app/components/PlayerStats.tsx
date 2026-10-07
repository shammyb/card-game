'use client'

import { useEffect, useState } from 'react'

type Stats = { matches: number; wins: number; losses: number; rounds: number; bestRound: number | null; highestScore: number | null; biggestWin: number | null }
type StatsResponse = { overall: Stats; opponents: (Stats & { id: string; name: string })[] }
const apiUrl = process.env.NEXT_PUBLIC_APIURL || 'http://localhost:3001'

export default function PlayerStats({ refreshKey }: { refreshKey: string }) {
    const [data, setData] = useState<StatsResponse | null>(null)
    const [opponentId, setOpponentId] = useState('')
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError('')
        fetch(`${apiUrl}/auth/stats`, { credentials: 'include', signal: controller.signal, cache: 'no-store' })
            .then(async response => {
                if (!response.ok) throw new Error('Could not load your stats. Please try again.')
                return response.json() as Promise<StatsResponse>
            })
            .then(result => { setData(result); setLoading(false) })
            .catch(failure => {
                if (!controller.signal.aborted) { setError(failure.message); setLoading(false) }
            })
        return () => controller.abort()
    }, [refreshKey, retry])

    const selected = data?.opponents.find(opponent => opponent.id === opponentId)
    const stats = selected || data?.overall
    const metrics = stats ? [
        ['Wins', stats.wins], ['Losses', stats.losses], ['Matches finished', stats.matches],
        ['Best round', stats.bestRound], ['Highest final score', stats.highestScore], ['Biggest winning margin', stats.biggestWin],
    ] as const : []

    return <section className="surface stats-panel" aria-labelledby="stats-heading" aria-busy={loading}>
        <div className="section-heading"><h2 id="stats-heading">Your record</h2><button className="text-button" disabled={loading} onClick={() => setRetry(value => value + 1)}>Refresh stats ↻</button></div>
        <label className="stats-filter">Compare results
            <select value={selected?.id || ''} onChange={event => setOpponentId(event.target.value)}>
                <option value="">Overall · all opponents</option>
                {data?.opponents.map(opponent => <option key={opponent.id} value={opponent.id}>Against {opponent.name}</option>)}
            </select>
        </label>
        {loading && <p role="status" className="section-copy">Loading your record…</p>}
        {error && <p role="alert" className="message message-error">{error}</p>}
        {!loading && !error && stats && <>
            <dl className="stats-grid">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
            <p className="section-copy">{stats.rounds} completed rounds{selected ? ` against ${selected.name}` : ' overall'}. Best round is your net points after hand deductions. Forfeits count as finished matches, including the scored final round and all records. Winning margin is your final score minus your opponent’s; it can be negative if they forfeit while ahead. Unfinished matches do not count as wins or losses.</p>
            {!stats.rounds && !stats.matches && <p className="section-copy">Finish your first round to start building your record.</p>}
        </>}
    </section>
}
