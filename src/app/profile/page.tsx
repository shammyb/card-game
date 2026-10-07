'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import PlayerStats from '@/app/components/PlayerStats'

const apiUrl = process.env.NEXT_PUBLIC_APIURL || 'http://localhost:3001'
type User = { id: string; name: string }

export default function Profile() {
    const [user, setUser] = useState<User | null>(null)
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    useEffect(() => {
        const controller = new AbortController()
        fetch(`${apiUrl}/auth/me`, { credentials: 'include', signal: controller.signal, cache: 'no-store' })
            .then(async response => {
                if (!response.ok) throw new Error('Unable to load your profile.')
                const result = await response.json()
                setUser(result.user)
                setName(result.user?.name || '')
            }).catch(() => { if (!controller.signal.aborted) setError('Unable to load your profile. Please try again.') })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [])

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSaving(true)
        setError('')
        setNotice('')
        try {
            const response = await fetch(`${apiUrl}/auth/profile`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Unable to update your name.')
            setUser(result.user)
            setName(result.user.name)
            setNotice('Your name has been updated. All your stats stay with your account.')
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save your profile.') }
        finally { setSaving(false) }
    }

    return <div className="island-app">
        <header className="site-header"><Link href="/" className="wordmark">♠ huntarish.</Link><Link href="/" className="text-button">Back to the table ↗</Link></header>
        <main className="member-layout"><div className="member-content">
            <section className="member-heading"><div><p className="eyebrow">YOUR HUNTARISH PROFILE</p><h1>{user ? user.name : 'My profile'}</h1><p>Your name. Your games. Your record.</p></div></section>
            {error && <p className="message message-error" role="alert">{error}</p>}
            {notice && <p className="message message-notice" role="status">{notice}</p>}
            {loading ? <p role="status">Loading your profile…</p> : user ? <>
                <section className="surface stats-panel"><h2>Your display name</h2><form className="auth-form" onSubmit={save}>
                    <label>Display name<input required maxLength={40} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} aria-describedby="name-help" /></label>
                    <p id="name-help" className="section-copy">Names must be unique, ignoring capital letters. If a name is taken, choose another.</p>
                    <button className="button button-primary" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save name'}</button>
                </form></section>
                <PlayerStats refreshKey={user.name} />
            </> : <p><Link href="/">Sign in</Link> to see and edit your profile.</p>}
        </div></main>
    </div>
}
