'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { io, Socket } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import GameTable, { GameState } from '@/app/components/GameTable'
import HuntarishBrand from '@/app/components/HuntarishBrand'

const apiUrl = process.env.NEXT_PUBLIC_APIURL || 'http://localhost:3001'
type User = { id: string; name: string }
type Player = User & { cards: number; online: boolean }
type OnlineUser = User & { busy: boolean }
type Challenge = { id: string; from: User; to: User; expiresAt: number }

async function accountRequest(path: string, data?: Record<string, string>) {
    const response = await fetch(`${apiUrl}/auth/${path}`, {
        method: data ? 'POST' : 'GET',
        credentials: 'include',
        headers: data ? { 'Content-Type': 'application/json' } : undefined,
        body: data ? JSON.stringify(data) : undefined,
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to complete the request.')
    return result
}

export default function Home() {
    const socket = useRef<Socket | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [register, setRegister] = useState(false)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [pending, setPending] = useState(false)
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [roomInput, setRoomInput] = useState('')
    const [roomId, setRoomId] = useState('')
    const [players, setPlayers] = useState<Player[]>([])
    const [gameState, setGameState] = useState<GameState | null>(null)
    const [computerDifficulty, setComputerDifficulty] = useState('medium')
    const [soloAvailable, setSoloAvailable] = useState(false)
    const [startingSolo, setStartingSolo] = useState(false)

    useEffect(() => {
        let active = true
        accountRequest('me').then(result => {
            if (active) setUser(result.user)
        }).catch(() => {
            if (active) setError('Cannot reach the game server. Check that it is running.')
        }).finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!user) return
        const connection = io(apiUrl, { withCredentials: true })
        socket.current = connection
        const resetRoom = () => {
            setRoomId('')
            setPlayers([])
            setGameState(null)
        }
        connection.on('connect', () => {
            setSoloAvailable(false)
            setConnected(true)
            setError('')
            resetRoom()
        })
        connection.on('disconnect', () => {
            setSoloAvailable(false)
            setConnected(false)
            setOnlineUsers([])
            setChallenges([])
        })
        connection.on('connect_error', failure => setError(failure.message))
        connection.on('serverCapabilities', (features: { computerMode?: boolean }) => setSoloAvailable(features?.computerMode === true))
        connection.on('onlineUsers', setOnlineUsers)
        connection.on('challenges', setChallenges)
        connection.on('roomJoined', ({ roomId }: { roomId: string }) => {
            setRoomId(roomId)
            setNotice('')
        })
        connection.on('roomPlayers', setPlayers)
        connection.on('gameState', setGameState)
        connection.on('roomClosed', (message: string) => {
            resetRoom()
            setNotice(message)
        })
        connection.on('gameError', setError)
        connection.on('notice', setNotice)
        return () => {
            connection.removeAllListeners()
            connection.disconnect()
            socket.current = null
        }
    }, [user])

    async function authenticate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setPending(true)
        setError('')
        try {
            const result = await accountRequest(register ? 'register' : 'login', { email, password, name })
            setUser(result.user)
            setPassword('')
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to sign in.')
        } finally { setPending(false) }
    }

    async function logout() {
        setPending(true)
        setError('')
        try {
            await accountRequest('logout', {})
            setUser(null)
            setConnected(false)
            setRoomId('')
            setGameState(null)
            setNotice('')
        } catch { setError('Unable to sign out. Please try again.') }
        finally { setPending(false) }
    }

    function send(event: string, payload: Record<string, unknown>) {
        if (event === 'leaveRoom' && gameState && gameState.status !== 'matchOver' && !window.confirm(gameState.computerDifficulty ? 'Leave this computer game? Practice progress will be lost, but your multiplayer record is unchanged.' : 'Leave and forfeit this match? Your opponent wins, and the current round and all scores count toward your stats.')) return
        if (!socket.current?.connected) return setError('Connect to the game server first.')
        if (event === 'startComputerGame' && !soloAvailable) return setError('Computer mode is not available on this server yet.')
        setStartingSolo(event === 'startComputerGame')
        setPending(true)
        setError('')
        setNotice('')
        socket.current.timeout(10000).emit(event, payload, (failure: Error | null, result: { error?: string }) => {
            setStartingSolo(false)
            setPending(false)
            if (failure) setError('The server did not respond. Reconnect to refresh your game.')
            else if (result?.error) setError(result.error)
        })
    }

    const disabled = pending || !connected
    const incoming = challenges.filter(challenge => challenge.to.id === user?.id)
    const outgoing = challenges.filter(challenge => challenge.from.id === user?.id)
    const otherPlayers = onlineUsers.filter(player => player.id !== user?.id)

    return (
        <div className="island-app">
            <header className="site-header">
                <div className="wordmark"><span className="wordmark-icon" aria-hidden="true">♠</span> huntarish<span className="wordmark-dot">.</span></div>
                <Link href="/tutorial" className="text-button">Learn to play ↗</Link>
            </header>
            <main className={user ? 'member-layout' : 'welcome-layout'}>
                {!user && <HuntarishBrand />}
                <div className={user ? 'member-content' : 'welcome-panel'}>
                    {error && <p role="alert" className="message message-error">{error}</p>}
                    {notice && <p role="status" className="message message-notice">{notice}</p>}
                    {loading ? (
                        <section className="auth-panel loading-panel" role="status"><span className="loading-suit" aria-hidden="true">♠</span><h2>Setting your table…</h2><p>Checking your account.</p></section>
                    ) : !user ? (
                        <section className="auth-panel" aria-labelledby="auth-heading">
                            <div className="auth-tabs" aria-label="Account options">
                                <button type="button" aria-pressed={!register} className={!register ? 'active' : ''} disabled={pending} onClick={() => { setRegister(false); setError('') }}>Sign in</button>
                                <button type="button" aria-pressed={register} className={register ? 'active' : ''} disabled={pending} onClick={() => { setRegister(true); setError('') }}>Create account</button>
                            </div>
                            <div className="auth-heading">
                                <span className="eyebrow">YOUR SEAT IS WAITING</span>
                                <h2 id="auth-heading">{register ? 'Join the table.' : 'Welcome back.'}</h2>
                                <p>{register ? 'Good games start with good company.' : 'A familiar game. A fresh ocean breeze.'}</p>
                            </div>
                            <form onSubmit={authenticate} className="auth-form">
                                {register && <label>Display name
                                    <input required maxLength={40} autoComplete="nickname" placeholder="What should we call you?" value={name} onChange={event => setName(event.target.value)} />
                                </label>}
                                <label>Email address
                                    <input required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} />
                                </label>
                                <label>Password
                                    <input required type="password" minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 12 characters' : 'Enter your password'} value={password} onChange={event => setPassword(event.target.value)} aria-describedby={register ? 'password-hint' : undefined} />
                                </label>
                                {register && <p className="field-hint" id="password-hint">Make it yours with 12 or more characters.</p>}
                                <button disabled={pending} className="button button-primary button-full">{pending ? 'Please wait…' : register ? 'Take your seat' : 'Let’s play'}<span aria-hidden="true">↗</span></button>
                            </form>
                            <div className="auth-switch">
                                {register ? 'Already part of the club?' : 'First time at the table?'}{' '}
                                <button disabled={pending} onClick={() => { setRegister(!register); setError('') }}>{register ? 'Sign in' : 'Join us'}</button>
                            </div>
                            <div className="auth-bottom"><span aria-hidden="true">♣</span> Two players. One great game.<span aria-hidden="true">♥</span></div>
                        </section>
                    ) : (
                        <>
                            <section className="member-heading">
                                <div><p className="eyebrow">{roomId ? 'YOUR BEACHSIDE TABLE' : 'THE HUNTARISH CLUB'}</p><h1>{roomId ? 'Let the good hands roll.' : `Hello, ${user.name}.`}</h1><p>{roomId ? 'A little strategy. A little island time.' : 'Find a friend. Pull up a chair. Play a hand.'}</p></div>
                                <div className="account-controls">
                                    <Link href="/profile" className="text-button">My profile</Link>
                                    <span className={connected ? 'connection-status is-online' : 'connection-status'}><i />{connected ? 'You’re online' : 'Disconnected'}</span>
                                    {!connected && <button className="button button-secondary" onClick={() => socket.current?.connect()}>Reconnect</button>}
                                    <button disabled={pending} className="text-button" onClick={logout}>Sign out ↗</button>
                                </div>
                            </section>
                            {!roomId ? (
                                <div className="lobby-grid">
                                    <section className="surface computer-panel">
                                        <h2>Play the computer</h2>
                                        <p className="section-copy">Your own table, whenever you want. Same rules and 501-point matches. Practice does not affect your multiplayer record.</p>
                                        <label>Difficulty<select value={computerDifficulty} onChange={event => setComputerDifficulty(event.target.value)}>{[['beginner', 'Beginner · very easy'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['expert', 'Expert']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                                        <p className="section-copy">{({ beginner: 'A forgiving opponent that often misses opportunities.', easy: 'Simple plays and shallow stack pickups.', medium: 'Reliable melds and more careful discards.', hard: 'Plans follow-up melds and searches deeper in the stack.', expert: 'Searches the whole stack and protects useful cards. Never sees your hand or the deck.' } as Record<string, string>)[computerDifficulty]}</p>
                                        {connected && !soloAvailable && <p role="status" className="section-copy">Computer mode is not available on this server yet. For local testing, restart the game server with the latest code.</p>}
                                        <button className="button button-primary" disabled={disabled || !soloAvailable} aria-busy={startingSolo} onClick={() => send('startComputerGame', { difficulty: computerDifficulty })}>{startingSolo ? 'Starting your table…' : 'Play solo ↗'}</button>
                                    </section>
                                    <section className="surface players-panel">
                                        <div className="section-heading"><h2>Find your opponent</h2><span className="count-pill">{otherPlayers.length} online</span></div>
                                        <p className="section-copy">A friendly rivalry is only a challenge away.</p>
                                        <div className="player-list">{otherPlayers.map(player => (
                                            <div key={player.id} className="player-row">
                                                <span className="avatar" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>
                                                <div className="player-details"><strong>{player.name}</strong><span>{player.busy ? 'Already at a table' : 'Ready for a game'}</span></div>
                                                <button className="button button-primary button-small" disabled={disabled || player.busy || outgoing.length > 0} onClick={() => send('sendChallenge', { userId: player.id })}>Challenge <span aria-hidden="true">↗</span></button>
                                            </div>
                                        ))}</div>
                                        {!otherPlayers.length && <div className="empty-state"><span aria-hidden="true">♧</span><h3>A little calm before the cards.</h3><p>No other players are online yet.<br />Invite a friend to join you here.</p></div>}
                                    </section>
                                    <section className="surface challenges-panel">
                                        <div className="section-heading"><h2>Your invitations</h2><span className="count-pill">{challenges.length}</span></div>
                                        <p className="section-copy">Save a seat. Invitations last two minutes.</p>
                                        {incoming.map(challenge => (
                                            <div key={challenge.id} className="invitation">
                                                <p><strong>{challenge.from.name}</strong> has a seat for you.</p>
                                                <div className="button-row"><button className="button button-primary button-small" disabled={disabled} onClick={() => send('respondChallenge', { challengeId: challenge.id, accept: true })}>Accept ↗</button><button disabled={disabled} className="text-button" onClick={() => send('respondChallenge', { challengeId: challenge.id, accept: false })}>Decline</button></div>
                                            </div>
                                        ))}
                                        {outgoing.map(challenge => (
                                            <div key={challenge.id} className="invitation"><p>Waiting for <strong>{challenge.to.name}</strong>…</p><button disabled={disabled} className="text-button" onClick={() => send('cancelChallenge', { challengeId: challenge.id })}>Cancel invitation</button></div>
                                        ))}
                                        {!challenges.length && <div className="empty-state compact-empty"><span aria-hidden="true">✉</span><p>No invitations just yet.<br />Challenge someone to get things going.</p></div>}
                                    </section>
                                    <section className="surface room-code-panel">
                                        <div><p className="eyebrow">ALREADY HAVE COMPANY?</p><h2>Meet at your own table.</h2><p className="section-copy">Create a room to share, or join with a friend’s code.</p></div>
                                        <form className="room-form" onSubmit={event => { event.preventDefault(); send('joinRoom', { roomId: roomInput.trim() }) }}>
                                            <div className="room-input-row"><input aria-label="Room code" required minLength={4} maxLength={64} value={roomInput} onChange={event => setRoomInput(event.target.value)} placeholder="Enter a room code" /><button disabled={disabled} className="button button-primary">Join ↗</button></div>
                                            <button type="button" disabled={disabled} className="text-button" onClick={() => send('joinRoom', { roomId: uuidv4() })}>Or create a new room <span aria-hidden="true">＋</span></button>
                                        </form>
                                    </section>
                                </div>
                            ) : (
                                <section className="surface game-panel">
                                    {gameState?.computerDifficulty && <p className="message message-notice">Computer practice · {gameState.computerDifficulty}. No multiplayer stats. Reconnect to resume while this server is running; leaving or a server restart clears this game.</p>}
                                    <div className="room-toolbar"><div><span className="eyebrow">ROOM CODE</span><p className="room-code">{roomId}</p></div><button disabled={disabled} className="text-button" onClick={() => send('leaveRoom', {})}>Leave table ↗</button></div>
                                    <ul className="table-players">{players.map(player => (
                                        <li key={player.id}><span className="avatar" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span><div><strong>{player.id === user.id ? 'You' : player.name}</strong><p>{player.cards} cards{!player.online ? ' · Offline' : ''}</p></div><span className={player.online ? 'player-dot is-online' : 'player-dot'} /></li>
                                    ))}</ul>
                                    {!gameState ? <div className="waiting-table"><span aria-hidden="true">♠ <i>♥</i> ♣ <i>♦</i></span><h2>A seat for a friend.</h2><p>Share the room code above.<br />We’ll deal the cards when they arrive.</p></div> : <GameTable state={gameState} userId={user.id} disabled={disabled} onAction={action => send('gameAction', action)} />}
                                </section>
                            )}
                        </>
                    )}
                </div>
            </main>
            <footer className="site-footer"><span>Take your time. Enjoy the game.</span><span className="footer-suits" aria-hidden="true">♠ <i>♥</i> ♣ <i>♦</i></span><span>Life’s better by the cards.</span></footer>
        </div>
    )
}
