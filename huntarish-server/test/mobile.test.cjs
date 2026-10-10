const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { io } = require('../../node_modules/socket.io-client')
const { createGameServer } = require('../index')

function database() {
    const users = []
    const sessions = []
    const games = []
    const store = {
        user: {
            create: async ({ data }) => { const user = { id: randomUUID(), ...data }; users.push(user); return user },
            findUnique: async ({ where }) => users.find(user => user.email === where.email),
            findMany: async () => users,
            update: async ({ where, data }) => Object.assign(users.find(user => user.id === where.id), data),
        },
        userSession: {
            create: async ({ data }) => { const session = { id: randomUUID(), ...data }; sessions.push(session); return session },
            findUnique: async ({ where }) => { const session = sessions.find(value => value.tokenHash === where.tokenHash); return session ? { ...session, user: users.find(user => user.id === session.userId) } : null },
            deleteMany: async ({ where }) => { const index = sessions.findIndex(session => session.id === where.id); if (index >= 0) sessions.splice(index, 1) },
        },
        room: { upsert: async () => ({}), findUnique: async () => null },
        player: { create: async ({ data }) => ({ id: randomUUID(), ...data }) },
        game: {
            findFirst: async () => null,
            findMany: async () => games,
            create: async ({ data }) => { const game = { ...data, id: randomUUID(), rounds: [{ id: randomUUID() }] }; games.push(game); return game },
            update: async ({ where, data }) => Object.assign(games.find(game => game.id === where.id), data),
        },
        move: { create: async () => ({}) },
        round: { update: async ({ data }) => { games[0].rounds[0].result = data.result }, create: async () => ({ id: randomUUID() }) },
    }
    store.$transaction = async action => action(store)
    return store
}

function event(socket, name, predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out: ${name}`)) }, 5000)
        function receive(value) { if (predicate(value)) { clearTimeout(timeout); socket.off(name, receive); resolve(value) } }
        socket.on(name, receive)
    })
}

test('native bearer and browser cookie users play together; browser CSRF protections remain intact', async context => {
    const server = createGameServer(database())
    await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.server.address().port}`
    const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000'
    const sockets = []
    context.after(async () => { sockets.forEach(socket => socket.disconnect()); await new Promise(resolve => server.io.close(resolve)) })
    async function request(path, data, headers = {}) {
        const response = await fetch(`${base}/auth/${path}`, { method: data ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...headers }, body: data ? JSON.stringify(data) : undefined })
        return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const account = name => ({ name, email: `${name}@example.test`, password: 'test-password-12345' })
    assert.equal((await request('register', account('blocked'))).status, 403)
    assert.equal((await request('native/register', account('blocked'), { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await request('native/register', account('blocked'), { Origin: origin })).status, 403)
    const native = await request('native/register', account('App'))
    assert.equal(native.status, 200)
    assert.match(native.body.token, /^[a-f0-9]{64}$/)
    assert.equal(native.cookie, undefined)
    const bearer = { Authorization: `Bearer ${native.body.token}` }
    assert.equal((await request('me', null, bearer)).body.user.id, native.body.user.id)
    assert.equal((await request('profile', { name: 'App player' }, bearer)).status, 200)
    assert.equal((await request('profile', { name: 'Stolen' }, { ...bearer, Origin: 'https://evil.example' })).status, 403)
    assert.equal((await request('profile', { name: 'Invalid' }, { Authorization: `Bearer ${'0'.repeat(64)}` })).status, 401)
    const browser = await request('register', account('Browser'), { Origin: origin })
    assert.equal(browser.status, 200)
    assert.equal(browser.body.token, undefined)
    assert.match(browser.cookie, /^huntarish_session=/)
    assert.equal((await request('profile', { name: 'Stolen' }, { Cookie: browser.cookie })).status, 403)
    async function connect(headers) {
        const socket = io(base, { autoConnect: false, transports: ['websocket'], extraHeaders: headers, reconnection: false })
        sockets.push(socket)
        const connected = event(socket, 'connect')
        const capabilities = event(socket, 'serverCapabilities')
        socket.connect()
        await connected
        assert.deepEqual(await capabilities, { computerMode: true })
        return socket
    }
    const androidDefault = io(base, { autoConnect: false, transports: ['websocket'], extraHeaders: { ...bearer, Origin: base }, reconnection: false })
    sockets.push(androidDefault)
    const originRejected = event(androidDefault, 'connect_error')
    androidDefault.connect()
    assert.match((await originRejected).message, /websocket error/)
    androidDefault.disconnect()
    const appSocket = await connect({ ...bearer, Origin: origin })
    const webSocket = await connect({ Origin: origin, Cookie: browser.cookie })
    const emit = (socket, name, payload) => socket.timeout(5000).emitWithAck(name, payload)
    const invitation = event(webSocket, 'challenges', value => value.length > 0)
    assert.deepEqual(await emit(appSocket, 'sendChallenge', { userId: browser.body.user.id }), { ok: true })
    const challenge = (await invitation)[0]
    const appState = event(appSocket, 'gameState')
    const webState = event(webSocket, 'gameState')
    assert.deepEqual(await emit(webSocket, 'respondChallenge', { challengeId: challenge.id, accept: true }), { ok: true })
    const first = await appState
    const second = await webState
    assert.equal(first.hand.length, 11)
    assert.equal(second.hand.length, 11)
    assert.equal(first.hand.some(card => second.hand.some(other => other.id === card.id)), false)
    assert.equal(first.players.length, 2)
    const turn = first.turnUserId === native.body.user.id ? appSocket : webSocket
    const drawnApp = event(appSocket, 'gameState', value => value.revision > first.revision)
    const drawnWeb = event(webSocket, 'gameState', value => value.revision > first.revision)
    assert.deepEqual(await emit(turn, 'gameAction', { type: 'drawDeck', revision: first.revision }), { ok: true })
    assert.equal((await drawnApp).deckCount, first.deckCount - 1)
    assert.equal((await drawnWeb).deckCount, first.deckCount - 1)
    assert.deepEqual(await emit(appSocket, 'leaveRoom', {}), { ok: true })
    assert.equal((await request('stats', null, bearer)).body.overall.losses, 1)
    assert.equal((await request('stats', null, { Cookie: browser.cookie })).body.overall.wins, 1)
    const statsBeforePractice = (await request('stats', null, bearer)).body
    assert.match((await emit(appSocket, 'startComputerGame', { difficulty: 'constructor' })).error, /difficulty/)
    const practiceState = event(appSocket, 'gameState')
    const practiceRoom = event(appSocket, 'roomJoined')
    assert.deepEqual(await emit(appSocket, 'startComputerGame', { difficulty: 'expert' }), { ok: true })
    const practice = await practiceState
    const room = await practiceRoom
    assert.equal(practice.computerDifficulty, 'expert')
    assert.equal(practice.hand.length, 11)
    assert.equal(practice.players[1].hand, undefined)
    assert.match((await emit(appSocket, 'startComputerGame', { difficulty: 'easy' })).error, /Leave/)
    assert.ok((await emit(webSocket, 'joinRoom', { roomId: typeof room === 'string' ? room : room.roomId })).error)
    const practiceDraw = event(appSocket, 'gameState', value => value.revision > practice.revision)
    assert.deepEqual(await emit(appSocket, 'gameAction', { type: 'drawDeck', revision: practice.revision }), { ok: true })
    const drawn = await practiceDraw
    const computerPlayed = event(appSocket, 'gameState', value => value.revision >= drawn.revision + 2)
    assert.deepEqual(await emit(appSocket, 'gameAction', { type: 'discard', revision: drawn.revision, cardId: drawn.hand[0].id }), { ok: true })
    const computerTurn = await computerPlayed
    assert.ok(computerTurn.revision > drawn.revision + 1)
    appSocket.disconnect()
    const resumedState = event(appSocket, 'gameState')
    appSocket.connect()
    assert.equal((await resumedState).computerDifficulty, 'expert')
    assert.deepEqual(await emit(appSocket, 'leaveRoom', {}), { ok: true })
    assert.deepEqual((await request('stats', null, bearer)).body, statsBeforePractice)
    const disconnected = event(appSocket, 'disconnect')
    assert.equal((await request('logout', {}, bearer)).status, 200)
    await disconnected
    assert.equal((await request('me', null, bearer)).body.user, null)
    const revoked = io(base, { autoConnect: false, transports: ['websocket'], extraHeaders: bearer, reconnection: false })
    sockets.push(revoked)
    const rejected = event(revoked, 'connect_error')
    revoked.connect()
    assert.match((await rejected).message, /sign in/)
    const login = await request('native/login', account('App'))
    assert.equal(login.status, 200)
    assert.notEqual(login.body.token, native.body.token)
})
