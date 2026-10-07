const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createGameServer } = require('../index')
const { prisma } = require('../lib/prisma')
const { io } = require('../../node_modules/socket.io-client')
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000'
const password = 'Temporary-test-password-2026'
const users = []
const sockets = []
let game = createGameServer()
let base

function once(socket, event, predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(event, done); reject(new Error(`Timed out: ${event}`)) }, 6000)
        function done(value) {
            if (!predicate(value)) return
            clearTimeout(timer)
            socket.off(event, done)
            resolve(value)
        }
        socket.on(event, done)
    })
}

async function request(path, body, cookie) {
    const response = await fetch(`${base}/auth/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

function connection(cookie) {
    const socket = io(base, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { Origin: origin, Cookie: cookie || '' } })
    sockets.push(socket)
    return socket
}

function send(socket, event, payload) {
    return new Promise((resolve, reject) => {
        socket.timeout(6000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result))
    })
}

async function move(user, type, payload = {}) {
    const revision = user.state.revision
    const watchers = users.filter(member => member.socket.connected && member.roomId === user.roomId)
        .map(member => once(member.socket, 'gameState', state => state.revision === revision + 1))
    const result = await send(user.socket, 'gameAction', { type, revision, ...payload })
    assert.deepEqual(result, { ok: true })
    await Promise.all(watchers)
}

async function run() {
    const databaseHost = new URL(process.env.DATABASE_URL).hostname
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(databaseHost), 'Run this smoke test against a local database only.')
    await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${game.server.address().port}`
    assert.equal((await request('me')).body.user, null)
    assert.equal((await request('stats')).status, 401)
    assert.equal((await request('profile', { name: 'New name' })).status, 401)
    const unauthenticated = connection()
    const denied = once(unauthenticated, 'connect_error')
    unauthenticated.connect()
    assert.match((await denied).message, /sign in/)
    for (const name of ['Alpha', 'Beta', 'Observer']) {
        const email = `codex-smoke-${randomUUID()}@example.invalid`
        const result = await request('register', { email, password, name })
        assert.equal(result.status, 200)
        users.push({ ...result.body.user, email, cookie: result.cookie })
        const stored = await prisma.user.findUnique({ where: { email } })
        assert.notEqual(stored.passwordHash, password)
        assert.equal((await request('me', undefined, result.cookie)).body.user.id, stored.id)
    }
    assert.equal((await request('register', { email: users[0].email, password, name: 'Duplicate' })).status, 409)
    assert.equal((await request('login', { email: users[0].email, password: 'wrong-password-12345' })).status, 401)
    const login = await request('login', { email: users[0].email.toUpperCase(), password })
    assert.equal(login.status, 200)
    users[0].cookie = login.cookie
    for (const user of users) {
        user.socket = connection(user.cookie)
        user.socket.on('handDealt', cards => { user.hand = cards })
        user.socket.on('gameReady', state => { user.game = state })
        user.socket.on('roomJoined', state => { user.roomId = state.roomId })
        user.socket.on('challenges', challenges => { user.challenges = challenges })
        user.socket.on('gameState', state => { user.state = state })
        const connected = once(user.socket, 'connect')
        user.socket.connect()
        await connected
    }
    const [alpha, beta, observer] = users
    assert.equal((await request('profile', { name: ` ${beta.name.toUpperCase()} ` }, alpha.cookie)).status, 409)
    assert.equal((await request('profile', { name: '  ' }, alpha.cookie)).status, 400)
    const renamed = await request('profile', { name: `Renamed-${randomUUID().slice(0, 8)}` }, alpha.cookie)
    assert.equal(renamed.status, 200)
    alpha.name = renamed.body.user.name
    assert.equal((await request('me', undefined, alpha.cookie)).body.user.name, alpha.name)
    assert.equal((await request('register', { email: `codex-smoke-${randomUUID()}@example.invalid`, password, name: alpha.name.toUpperCase() })).status, 409)
    let invitation = once(beta.socket, 'challenges', values => values.some(value => value.from.id === alpha.id))
    assert.deepEqual(await send(alpha.socket, 'sendChallenge', { userId: beta.id }), { ok: true })
    await invitation
    const challenge = beta.challenges.find(item => item.from.id === alpha.id)
    assert.ok(challenge)
    assert.ok((await send(observer.socket, 'respondChallenge', { challengeId: challenge.id, accept: true })).error)
    assert.deepEqual(await send(beta.socket, 'respondChallenge', { challengeId: challenge.id, accept: false }), { ok: true })
    invitation = once(beta.socket, 'challenges', values => values.some(value => value.from.id === alpha.id))
    assert.deepEqual(await send(alpha.socket, 'sendChallenge', { userId: beta.id }), { ok: true })
    await invitation
    const pending = beta.challenges.find(item => item.from.id === alpha.id)
    const alphaReady = once(alpha.socket, 'gameReady')
    const betaReady = once(beta.socket, 'gameReady')
    const firstStates = [once(alpha.socket, 'gameState'), once(beta.socket, 'gameState')]
    const acceptances = await Promise.all([
        send(beta.socket, 'respondChallenge', { challengeId: pending.id, accept: true }),
        send(beta.socket, 'respondChallenge', { challengeId: pending.id, accept: true }),
    ])
    assert.equal(acceptances.filter(result => result.ok).length, 1)
    await Promise.all([alphaReady, betaReady])
    await Promise.all(firstStates)
    assert.equal(alpha.roomId, beta.roomId)
    assert.equal(alpha.hand.length, 11)
    assert.equal(beta.hand.length, 11)
    assert.equal(alpha.game.stack.length, 1)
    assert.equal(new Set([...alpha.hand, ...beta.hand, ...alpha.game.stack].map(card => card.id)).size, 23)
    assert.equal(observer.hand, undefined)
    assert.ok((await send(observer.socket, 'joinRoom', { roomId: alpha.roomId })).error)
    assert.ok((await send(observer.socket, 'sendChallenge', { userId: alpha.id })).error)
    assert.equal(alpha.state.deck, undefined)
    assert.equal(alpha.state.players[1].hand, undefined)
    assert.ok((await send(beta.socket, 'gameAction', { type: 'drawDeck', revision: 0 })).error)
    await move(alpha, 'drawDeck')
    assert.equal(alpha.hand.length, 12)
    assert.equal(beta.state.players.find(player => player.id === alpha.id).cards, 12)
    assert.ok((await send(alpha.socket, 'gameAction', { type: 'drawDeck', revision: 0 })).error)
    assert.ok((await send(alpha.socket, 'gameAction', { type: 'drawDeck', revision: alpha.state.revision })).error)
    assert.ok((await send(alpha.socket, 'gameAction', { type: 'discard', revision: alpha.state.revision, cardId: beta.hand[0].id, playerId: beta.id })).error)
    await move(alpha, 'discard', { cardId: alpha.hand[0].id })
    assert.equal(beta.state.turnUserId, beta.id)
    while (alpha.state.deckCount) {
        const currentPlayer = users.find(member => member.id === alpha.state.turnUserId)
        await move(currentPlayer, 'drawDeck')
        await move(currentPlayer, 'discard', { cardId: currentPlayer.hand[0].id })
    }
    const finishingPlayer = users.find(member => member.id === alpha.state.turnUserId)
    await move(finishingPlayer, 'endRound')
    assert.equal(alpha.state.status, 'roundOver')
    assert.equal(alpha.state.result.scores.length, 2)
    assert.ok(alpha.state.result.scores.every(score => score.delta === -score.handPoints && score.tablePoints === 0))
    const recordedGame = await prisma.game.findFirst({ where: { roomId: alpha.roomId }, include: { rounds: true } })
    assert.deepEqual(recordedGame.rounds[0].result, alpha.state.result)
    const stats = await request('stats', undefined, alpha.cookie)
    assert.equal(stats.status, 200)
    assert.equal(stats.body.overall.rounds, 1)
    assert.equal(stats.body.overall.matches, 0)
    assert.equal(stats.body.overall.bestRound, alpha.state.result.scores.find(score => score.userId === alpha.id).delta)
    assert.equal(stats.body.opponents[0].id, beta.id)
    assert.equal((await request('stats', undefined, observer.cookie)).body.overall.rounds, 0)
    const totals = alpha.state.players.map(player => player.score)
    await move(alpha, 'nextRound')
    assert.equal(alpha.state.roundNumber, 1)
    await move(beta, 'nextRound')
    assert.equal(alpha.state.roundNumber, 2)
    assert.equal(alpha.state.turnUserId, beta.id)
    assert.equal(alpha.state.deckCount, 29)
    assert.deepEqual(alpha.state.players.map(player => player.score), totals)
    const previousHand = alpha.hand
    const offline = once(beta.socket, 'roomPlayers')
    alpha.socket.disconnect()
    await offline
    const restored = once(alpha.socket, 'gameReady')
    alpha.socket.connect()
    await restored
    assert.deepEqual(alpha.hand, previousHand)
    const disconnected = once(alpha.socket, 'disconnect')
    assert.equal((await request('logout', {}, alpha.cookie)).status, 200)
    await disconnected
    assert.equal((await request('me', undefined, alpha.cookie)).body.user, null)
    assert.deepEqual(await send(beta.socket, 'leaveRoom', {}), { ok: true })
    const publicRoom = randomUUID()
    assert.deepEqual(await send(beta.socket, 'joinRoom', { roomId: publicRoom, playerName: 'Spoofed name' }), { ok: true })
    const publicReady = once(beta.socket, 'gameReady')
    assert.deepEqual(await send(observer.socket, 'joinRoom', { roomId: publicRoom }), { ok: true })
    await publicReady
    assert.equal((await prisma.player.findFirst({ where: { roomId: publicRoom, userId: beta.id } })).name, beta.name)
    const publicState = await prisma.game.findFirst({ where: { roomId: publicRoom } })
    sockets.forEach(socket => socket.disconnect())
    await new Promise(resolve => game.io.close(resolve))
    game = createGameServer()
    await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${game.server.address().port}`
    const freshLogin = await request('login', { email: alpha.email, password })
    alpha.socket = connection(freshLogin.cookie)
    const outsiderConnected = once(alpha.socket, 'connect')
    alpha.socket.connect()
    await outsiderConnected
    assert.ok((await send(alpha.socket, 'joinRoom', { roomId: publicRoom })).error)
    assert.equal(await prisma.game.count({ where: { roomId: publicRoom } }), 1)
    for (const member of [beta, observer]) {
        member.socket = connection(member.cookie)
        const restoredState = once(member.socket, 'gameState')
        member.socket.connect()
        const state = await restoredState
        assert.equal(state.revision, publicState.state.revision)
        assert.deepEqual(state.hand, publicState.state.players.find(player => player.id === member.id).hand)
        assert.equal(state.turnUserId, publicState.state.players[publicState.state.turnIndex].id)
    }
    assert.deepEqual(await send(beta.socket, 'leaveRoom', {}), { ok: true })
    assert.equal((await prisma.game.findFirst({ where: { roomId: publicRoom } })).active, false)
    const forfeited = await prisma.game.findFirst({ where: { roomId: publicRoom } })
    assert.equal(forfeited.state.winnerId, observer.id)
    assert.equal(forfeited.state.forfeitBy, beta.id)
    assert.equal((await request('stats', undefined, observer.cookie)).body.overall.wins, 1)
    console.log('PASS: accounts/challenges, private hands, turn enforcement, rejected stale/forged moves, a complete round, persisted scores, next-round readiness, reconnect/logout, and recovery after server restart.')
}

run().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
    sockets.forEach(socket => socket.disconnect())
    await new Promise(resolve => game.io.close(resolve))
    const userIds = users.map(user => user.id)
    if (userIds.length) {
        const players = await prisma.player.findMany({ where: { userId: { in: userIds } } })
        const roomIds = [...new Set(players.map(player => player.roomId))]
        await prisma.move.deleteMany({ where: { roomId: { in: roomIds } } })
        await prisma.round.deleteMany({ where: { game: { roomId: { in: roomIds } } } })
        await prisma.game.deleteMany({ where: { roomId: { in: roomIds } } })
        await prisma.player.deleteMany({ where: { userId: { in: userIds } } })
        await prisma.room.deleteMany({ where: { id: { in: roomIds } } })
        await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    }
    await prisma.$disconnect()
    console.log('Temporary test accounts and games removed.')
})
