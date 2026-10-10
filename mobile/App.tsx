import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'
import { io, Socket } from 'socket.io-client'
import { createPractice, playPartner, playPractice, tutorialSteps, Practice } from '../src/lib/tutorial'
import type { GameState } from '../src/lib/game-types'
import { apiUrl, webOrigin, request } from './src/api'
import { Button, Field, styles } from './src/ui'
import Table from './src/Table'

type User = { id: string; name: string }
type OnlineUser = User & { busy: boolean }
type Challenge = { id: string; from: User; to: User; expiresAt: number }
type Stats = { matches: number; wins: number; losses: number; rounds: number; bestRound: number | null; highestScore: number | null; biggestWin: number | null }
type StatsResponse = { overall: Stats; opponents: (Stats & User)[] }
const sessionKey = 'huntarish-session'
const failureText = (failure: unknown) => failure instanceof Error ? failure.message : 'Something went wrong. Please try again.'

function Huntarish() {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [pending, setPending] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [register, setRegister] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [connected, setConnected] = useState(false)
    const [online, setOnline] = useState<OnlineUser[]>([])
    const [challenges, setChallenges] = useState<Challenge[]>([])
    const [roomInput, setRoomInput] = useState('')
    const [room, setRoom] = useState('')
    const [game, setGame] = useState<GameState | null>(null)
    const [difficulty, setDifficulty] = useState('medium')
    const [soloAvailable, setSoloAvailable] = useState(false)
    const [startingSolo, setStartingSolo] = useState(false)
    const [screen, setScreen] = useState<'lobby' | 'profile' | 'tutorial'>('lobby')
    const [practice, setPractice] = useState<Practice>(createPractice)
    const [stats, setStats] = useState<StatsResponse | null>(null)
    const [opponent, setOpponent] = useState('')
    const socket = useRef<Socket | null>(null)
    const busy = useRef(false)

    async function run(action: () => Promise<void>) {
        if (busy.current) return
        busy.current = true
        setPending(true)
        setError('')
        try { await action() } catch (failure) { setError(failureText(failure)) }
        finally { busy.current = false; setPending(false) }
    }

    useEffect(() => {
        let active = true
        void (async () => {
            try {
                const saved = await SecureStore.getItemAsync(sessionKey)
                if (!saved) return
                const result = await request('me', saved)
                if (!result.user) { await SecureStore.deleteItemAsync(sessionKey); return }
                if (active) { setToken(saved); setUser(result.user); setName(result.user.name) }
            } catch { if (active) setError('Could not restore sign-in. Check your connection and sign in again.') }
            finally { if (active) setLoading(false) }
        })()
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!user?.id || !token) return
        const connection = io(apiUrl, { transports: ['websocket'], extraHeaders: { Authorization: `Bearer ${token}`, Origin: webOrigin } })
        socket.current = connection
        const clearRoom = () => { setRoom(''); setGame(null) }
        connection.on('connect', () => { setConnected(true); setSoloAvailable(false); setError(''); clearRoom() })
        connection.on('disconnect', () => { setConnected(false); setSoloAvailable(false); setOnline([]); setChallenges([]); setPending(false); busy.current = false })
        connection.on('serverCapabilities', (features: { computerMode?: boolean }) => setSoloAvailable(features?.computerMode === true))
        connection.on('connect_error', failure => { setConnected(false); setError(failure.message) })
        connection.on('onlineUsers', setOnline)
        connection.on('challenges', setChallenges)
        connection.on('roomJoined', (result: { roomId: string }) => { setRoom(result.roomId); setScreen('lobby') })
        connection.on('gameState', setGame)
        connection.on('roomClosed', (message: string) => { clearRoom(); setNotice(message) })
        connection.on('gameError', setError)
        connection.on('notice', setNotice)
        const subscription = AppState.addEventListener('change', state => { if (state === 'active' && !connection.connected) connection.connect() })
        return () => { subscription.remove(); connection.removeAllListeners(); connection.disconnect(); socket.current = null }
    }, [user?.id, token])

    useEffect(() => {
        if (screen !== 'tutorial' || practice.game.turnUserId !== 'guide' || practice.game.status !== 'playing') return
        const timer = setTimeout(() => setPractice(current => playPartner(current)), 1800)
        return () => clearTimeout(timer)
    }, [screen, practice.game.revision, practice.game.turnUserId, practice.game.status])

    function send(event: string, payload: Record<string, unknown>) {
        void run(async () => {
            if (!socket.current?.connected) throw new Error('Reconnect to the game server first.')
            if (event === 'startComputerGame' && !soloAvailable) throw new Error('Computer mode is not available on this server yet.')
            setStartingSolo(event === 'startComputerGame')
            await new Promise<void>((resolve, reject) => socket.current!.timeout(10000).emit(event, payload, (failure: Error | null, result?: { error?: string }) => {
                if (failure) reject(new Error('No response. Reconnect to refresh before trying again.'))
                else if (result?.error) reject(new Error(result.error))
                else resolve()
            })).finally(() => setStartingSolo(false))
        })
    }

    function authenticate() {
        void run(async () => {
            const result = await request(`native/${register ? 'register' : 'login'}`, null, { email, password, name })
            if (typeof result.token !== 'string') throw new Error('The server needs the mobile sign-in update.')
            await SecureStore.setItemAsync(sessionKey, result.token)
            setToken(result.token); setUser(result.user); setName(result.user.name); setPassword('')
        })
    }

    function logout() {
        void run(async () => {
            await request('logout', token, {})
            await SecureStore.deleteItemAsync(sessionKey)
            setUser(null); setToken(null); setRoom(''); setGame(null); setStats(null); setScreen('lobby'); setNotice('')
        })
    }

    function openProfile() {
        setScreen('profile'); setStats(null); setOpponent(''); setName(user?.name || '')
        void run(async () => { setStats(await request('stats', token)) })
    }

    const disabled = pending || !connected
    const record = stats?.opponents.find(player => player.id === opponent) || stats?.overall
    return <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
                <Text style={styles.title}>♠ Huntarish.</Text><Text style={styles.small}>Your beachside card table. App and browser, together.</Text>
                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
                {loading ? <ActivityIndicator accessibilityLabel="Checking sign-in" /> : <>
                    <View style={styles.row}>
                        {screen !== 'lobby' && <Button title="Back to table" onPress={() => { setScreen('lobby'); setError('') }} />}
                        {!room && screen !== 'tutorial' && <Button title="Learn to play" onPress={() => { setPractice(createPractice()); setScreen('tutorial'); setError('') }} />}
                        {user && !room && screen === 'lobby' && <Button title="My profile" disabled={pending} onPress={openProfile} />}
                    </View>
                    {screen === 'tutorial' ? <>
                        <View style={styles.panel}><Text style={styles.heading}>{practice.step < 8 ? `${practice.step + 1}/8 · ${tutorialSteps[practice.step].title}` : 'Practice complete!'}</Text><Text style={styles.text}>{practice.game.turnUserId === 'guide' && practice.game.status === 'playing' ? 'Watch your practice partner play…' : practice.step < 8 ? tutorialSteps[practice.step].instruction : 'Your table cards score positively; hand cards are deducted. Your real games use the same rules.'}</Text><Text style={styles.small}>Practice only. No account or statistics affected.</Text><Button title="Restart tutorial" onPress={() => { setPractice(createPractice()); setError('') }} /></View>
                        <Table game={practice.game} userId="learner" disabled={false} onAction={action => { const next = playPractice(practice, action); if (next) { setPractice(next); setError('') } else setError('Follow the practice instructions above for this step.') }} />
                    </> : !user ? <View style={styles.panel}>
                        <Text style={styles.heading}>{register ? 'Join the table' : 'Welcome back'}</Text>
                        {register && <Field label="Display name" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />}
                        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
                        <Field label="Password · 12 or more characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={register ? 'new-password' : 'current-password'} maxLength={128} />
                        <Button title={pending ? 'Please wait…' : register ? 'Create account' : 'Sign in'} disabled={pending || !email.trim() || password.length < 12 || (register && !name.trim())} onPress={authenticate} />
                        <Button title={register ? 'I already have an account' : 'Create an account'} disabled={pending} onPress={() => setRegister(!register)} />
                    </View> : screen === 'profile' ? <View style={styles.panel}>
                        <Text style={styles.heading}>My profile</Text><Field label="Display name" value={name} onChangeText={setName} maxLength={40} />
                        <Button title="Save name" disabled={pending || !name.trim()} onPress={() => void run(async () => { const result = await request('profile', token, { name }); setUser(result.user); setNotice('Name saved. Your records stay with you.') })} />
                        <Text style={styles.heading}>Your record</Text><Button title="Refresh record" disabled={pending} onPress={() => void run(async () => { setStats(await request('stats', token)) })} />
                        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}><Button title="Overall" selected={!opponent} onPress={() => setOpponent('')} />{stats?.opponents.map(player => <Button key={player.id} title={player.name} selected={opponent === player.id} onPress={() => setOpponent(player.id)} />)}</ScrollView>
                        {record && <Text style={styles.text}>Wins: {record.wins} · Losses: {record.losses}{'\n'}Matches: {record.matches} · Rounds: {record.rounds}{'\n'}Best round: {record.bestRound ?? '—'}{'\n'}Highest final score: {record.highestScore ?? '—'}{'\n'}Biggest winning margin: {record.biggestWin ?? '—'}</Text>}
                        <Text style={styles.small}>Forfeits count. Names must be unique.</Text>
                    </View> : <>
                        <Text style={styles.text}>Hello, {user.name} · {connected ? 'Connected' : 'Offline'}</Text>
                        {!connected && <Button title="Reconnect" onPress={() => socket.current?.connect()} />}
                        {room ? <>
                            <Text selectable style={styles.small}>Room: {room}</Text>
                            {game?.computerDifficulty && <Text style={styles.text}>Computer practice · {game.computerDifficulty}. No multiplayer stats. Leaving or a server restart clears this game.</Text>}
                            {game ? <Table game={game} userId={user.id} disabled={disabled} onAction={action => send('gameAction', action)} /> : <Text style={styles.text}>Waiting for another player. Share this room code with an app or browser player.</Text>}
                            <Button title={game?.computerDifficulty ? 'Leave practice' : game && game.status !== 'matchOver' ? 'Leave and forfeit' : 'Leave room'} disabled={disabled} onPress={() => game && game.status !== 'matchOver' ? Alert.alert(game.computerDifficulty ? 'Leave computer practice?' : 'Forfeit this match?', game.computerDifficulty ? 'Practice progress will be lost. Your multiplayer record is unchanged.' : 'Your opponent wins. The current round and all scores count toward your stats.', [{ text: 'Stay', style: 'cancel' }, { text: game.computerDifficulty ? 'Leave practice' : 'Forfeit', style: 'destructive', onPress: () => send('leaveRoom', {}) }]) : send('leaveRoom', {})} />
                        </> : <>
                            <View style={styles.panel}><Text style={styles.heading}>Play the computer</Text><Text style={styles.text}>Same rules. No multiplayer stats. Five levels, from a forgiving beginner to an expert that plans ahead.</Text><View style={styles.row}>{['beginner', 'easy', 'medium', 'hard', 'expert'].map(level => <Button key={level} title={level === 'beginner' ? 'Beginner · very easy' : level.charAt(0).toUpperCase() + level.slice(1)} selected={difficulty === level} onPress={() => setDifficulty(level)} />)}</View>{connected && !soloAvailable && <Text style={styles.small}>Computer mode is not available on this server yet.</Text>}<Button title={startingSolo ? 'Starting your table…' : 'Play solo'} disabled={disabled || !soloAvailable} onPress={() => send('startComputerGame', { difficulty })} /></View>
                            <View style={styles.panel}><Text style={styles.heading}>Play with a friend</Text><Field label="Room code · 4–64 letters, numbers or hyphens" value={roomInput} onChangeText={setRoomInput} autoCapitalize="none" autoCorrect={false} maxLength={64} /><Button title="Create or join room" disabled={disabled || !/^[a-zA-Z0-9-]{4,64}$/.test(roomInput.trim())} onPress={() => send('joinRoom', { roomId: roomInput.trim() })} /></View>
                            <View style={styles.panel}><Text style={styles.heading}>Challenges</Text>{challenges.map(challenge => <View key={challenge.id} style={{ gap: 8 }}><Text style={styles.text}>{challenge.from.id === user.id ? `Waiting for ${challenge.to.name}` : `${challenge.from.name} challenges you`}</Text>{challenge.to.id === user.id ? <View style={styles.row}><Button title="Accept" disabled={disabled} onPress={() => send('respondChallenge', { challengeId: challenge.id, accept: true })} /><Button title="Decline" disabled={disabled} onPress={() => send('respondChallenge', { challengeId: challenge.id, accept: false })} /></View> : <Button title="Cancel challenge" disabled={disabled} onPress={() => send('cancelChallenge', { challengeId: challenge.id })} />}</View>)}
                                {!online.some(player => player.id !== user.id) && <Text style={styles.text}>No other players online yet. Ask a friend to sign in on the website or app.</Text>}
                                {online.filter(player => player.id !== user.id).map(player => <Button key={player.id} title={`${player.name}${player.busy ? ' · playing' : ' · challenge'}`} disabled={disabled || player.busy} onPress={() => send('sendChallenge', { userId: player.id })} />)}
                            </View>
                            <Button title="Sign out" disabled={pending} onPress={logout} />
                        </>}
                    </>}
                </>}
            </ScrollView>
        </KeyboardAvoidingView>
    </SafeAreaView>
}

export default function App() { return <SafeAreaProvider><Huntarish /></SafeAreaProvider> }
