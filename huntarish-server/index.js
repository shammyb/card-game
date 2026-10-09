const cors = require('cors')
const express = require('express')
const http = require('http')
const { randomUUID } = require('crypto')
const { Server } = require('socket.io')
const { prisma } = require('./lib/prisma')
const { createAuth, publicUser } = require('./lib/auth')
const { createMatch, applyAction, playerView, forfeitMatch } = require('./lib/game')
const { buildStats } = require('./lib/stats')

function createGameServer(database = prisma) {
    const app = express()
    const server = http.createServer(app)
    const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000'
    const io = new Server(server, {
        cors: { origin, credentials: true },
        allowRequest: (request, callback) => callback(null, request.headers.origin === origin ||
            (!request.headers.origin && /^Bearer [a-f0-9]{64}$/.test(request.headers.authorization || ''))),
    })
    app.use(cors({ origin, credentials: true }))
    app.use(express.json({ limit: '8kb' }))

    const online = new Map()
    const rooms = new Map()
    const userRooms = new Map()
    const challenges = new Map()
    let operations = Promise.resolve()

    const auth = createAuth(app, database, origin, sessionId => {
        for (const socket of online.values()) {
            if (socket.data.sessionId === sessionId) socket.disconnect(true)
        }
    }, updatedUser => {
        const update = operations.then(async () => {
            const socket = online.get(updatedUser.id)
            if (socket) Object.assign(socket.data.user, updatedUser)
            for (const room of rooms.values()) {
                const player = room.players.find(member => member.user.id === updatedUser.id)
                if (!player) continue
                Object.assign(player.user, updatedUser)
                const member = room.state?.players.find(member => member.id === updatedUser.id)
                if (member) {
                    member.name = updatedUser.name
                    await database.game.update({ where: { id: room.game.id }, data: { state: room.state } })
                }
                publishRoom(room)
            }
            presence()
            invitations()
        })
        operations = update.catch(() => {})
        return update
    })

    app.get('/auth/stats', async (req, res, next) => {
        try {
            const session = await auth.authenticate(req.headers)
            if (!session) return res.status(401).json({ error: 'Sign in to see your statistics.' })
            const games = await database.game.findMany({
                where: { room: { players: { some: { userId: session.user.id } } } },
                select: { state: true, rounds: { select: { result: true } } },
            })
            const stats = buildStats(games, session.user.id)
            const names = await database.user.findMany({ where: { id: { in: stats.opponents.map(opponent => opponent.id) } }, select: { id: true, name: true } })
            stats.opponents.forEach(opponent => { opponent.name = names.find(user => user.id === opponent.id)?.name || opponent.name })
            res.json(stats)
        } catch (error) { next(error) }
    })

    function presence() {
        io.emit('onlineUsers', [...online.values()].map(socket => ({
            ...publicUser(socket.data.user), busy: userRooms.has(socket.data.user.id),
        })))
    }

    function invitations() {
        for (const [userId, socket] of online) {
            socket.emit('challenges', [...challenges.values()].filter(challenge =>
                challenge.from.id === userId || challenge.to.id === userId))
        }
    }

    function cancelChallenges(userId) {
        for (const [challengeId, challenge] of challenges) {
            if (challenge.from.id === userId || challenge.to.id === userId) challenges.delete(challengeId)
        }
        invitations()
    }

    function publishRoom(room) {
        const players = room.players.map(player => {
            const member = room.state?.players.find(item => item.id === player.user.id)
            return {
                id: player.user.id, name: player.user.name, cards: member?.hand.length || 0,
                online: online.has(player.user.id),
            }
        })
        for (const player of room.players) {
            const socket = online.get(player.user.id)
            if (!socket) continue
            socket.emit('roomJoined', { roomId: room.id })
            socket.emit('roomPlayers', players)
            if (room.state) {
                const view = playerView(room.state, player.user.id)
                socket.emit('handDealt', view.hand)
                socket.emit('gameReady', { stack: view.stack, roundNumber: view.roundNumber })
                socket.emit('gameState', view)
            } else socket.emit('handDealt', [])
        }
    }

    async function restoreRoom(userId) {
        if (userRooms.has(userId)) return
        const game = await database.game.findFirst({
            where: { active: true, room: { players: { some: { userId } } } },
            orderBy: { createdAt: 'desc' },
            include: { room: { include: { players: true } }, rounds: { orderBy: { number: 'asc' } } },
        })
        if (!game?.state || !game.state.players.some(player => player.id === userId)) return
        const room = rooms.get(game.roomId) || {
            id: game.roomId, game, state: game.state, private: true,
            roundId: game.rounds.at(-1).id,
            players: game.state.players.map(member => ({
                user: { id: member.id, name: member.name },
                prismaId: game.room.players.find(player => player.userId === member.id).id,
            })),
        }
        rooms.set(room.id, room)
        room.players.forEach(player => userRooms.set(player.user.id, room.id))
    }

    async function addPlayers(room, users) {
        const result = await database.$transaction(async transaction => {
            await transaction.room.upsert({ where: { id: room.id }, update: {}, create: { id: room.id } })
            const players = []
            for (const user of users) {
                const player = await transaction.player.create({
                    data: { name: user.name, userId: user.id, roomId: room.id },
                })
                players.push({ user, prismaId: player.id, hand: [] })
            }
            const state = room.players.length + players.length === 2
                ? createMatch([...room.players, ...players].map(player => player.user)) : null
            const game = state
                ? await transaction.game.create({
                    data: { roomId: room.id, state, active: true, rounds: { create: { number: 1 } } }, include: { rounds: true },
                }) : null
            return { players, game, state }
        })
        room.players.push(...result.players)
        for (const user of users) userRooms.set(user.id, room.id)
        rooms.set(room.id, room)
        if (result.game) {
            room.game = result.game
            room.state = result.state
            room.roundId = result.game.rounds[0].id
        }
        for (const user of users) cancelChallenges(user.id)
        publishRoom(room)
        presence()
    }

    io.use(async (socket, next) => {
        try {
            const session = await auth.authenticate(socket.request.headers)
            if (!session) return next(new Error('Please sign in.'))
            if (online.has(session.user.id)) return next(new Error('This account is already connected in another tab.'))
            socket.data.user = publicUser(session.user)
            socket.data.sessionId = session.id
            socket.data.expiresAt = session.expiresAt.getTime()
            next()
        } catch {
            next(new Error('Unable to sign in to the game server.'))
        }
    })

    io.on('connection', socket => {
        const user = socket.data.user
        if (online.has(user.id)) return socket.disconnect(true)
        online.set(user.id, socket)
        const expiration = setTimeout(() => socket.disconnect(true), Math.min(2147483647, socket.data.expiresAt - Date.now()))
        expiration.unref()
        operations = operations.then(async () => {
            await restoreRoom(user.id)
            const currentRoom = rooms.get(userRooms.get(user.id))
            if (currentRoom) publishRoom(currentRoom)
            presence()
            invitations()
        }).catch(error => {
            console.error(error)
            socket.emit('gameError', 'Unable to restore your game. Please reconnect.')
            socket.disconnect(true)
        })

        function handle(event, action) {
            socket.on(event, (payload, acknowledge) => {
                const respond = typeof acknowledge === 'function' ? acknowledge : () => {}
                operations = operations.then(async () => {
                    if (!socket.connected || Date.now() >= socket.data.expiresAt) throw new Error('Please sign in again.')
                    await action(payload || {})
                    respond({ ok: true })
                }).catch(error => {
                    const message = error.clientMessage || 'The request could not be completed. Please try again.'
                    if (!error.clientMessage) console.error(error)
                    respond({ error: message })
                    socket.emit('gameError', message)
                })
            })
        }

        function reject(message) {
            throw Object.assign(new Error(message), { clientMessage: message })
        }

        handle('joinRoom', async ({ roomId }) => {
            if (typeof roomId !== 'string' || !/^[a-zA-Z0-9-]{4,64}$/.test(roomId)) reject('Enter a room code of 4–64 letters, numbers or hyphens.')
            if (userRooms.has(user.id)) reject('Leave your current room first.')
            if (!rooms.has(roomId) && await database.room.findUnique({ where: { id: roomId }, select: { id: true } })) {
                reject('That room code is no longer available. Create a new room or reconnect to your existing game.')
            }
            const room = rooms.get(roomId) || { id: roomId, players: [], game: null, stack: [] }
            if (room.private || room.game || room.players.length >= 2) reject('That room is full or private.')
            await addPlayers(room, [user])
        })

        handle('leaveRoom', async () => {
            const room = rooms.get(userRooms.get(user.id))
            if (!room) return
            if (room.game) {
                const updated = forfeitMatch(room.state, user.id)
                await database.$transaction(async transaction => {
                    if (room.state.status === 'playing') await transaction.round.update({ where: { id: room.roundId }, data: { result: updated.result } })
                    await transaction.game.update({ where: { id: room.game.id }, data: { active: false, state: updated } })
                })
                room.state = updated
            }
            for (const player of room.players) {
                userRooms.delete(player.user.id)
                online.get(player.user.id)?.emit('roomClosed', room.state?.forfeitBy ? `${user.name} forfeited. The match and scores have been saved.` : 'The table was closed.')
            }
            rooms.delete(room.id)
            presence()
        })

        handle('sendChallenge', async ({ userId }) => {
            const target = online.get(userId)
            if (!target || userId === user.id) reject('Choose another online player.')
            if (userRooms.has(user.id) || userRooms.has(userId)) reject('Both players must be available in the lobby.')
            if ([...challenges.values()].some(challenge => challenge.from.id === user.id ||
                (challenge.from.id === userId && challenge.to.id === user.id))) reject('You already have a pending challenge with this player or an outgoing challenge.')
            const challenge = {
                id: randomUUID(), from: user, to: target.data.user, expiresAt: Date.now() + 120000,
            }
            challenges.set(challenge.id, challenge)
            invitations()
        })

        handle('respondChallenge', async ({ challengeId, accept }) => {
            const challenge = challenges.get(challengeId)
            if (!challenge || challenge.to.id !== user.id || challenge.expiresAt <= Date.now()) reject('This challenge is no longer available.')
            if (typeof accept !== 'boolean') reject('Choose accept or decline.')
            if (!accept) {
                challenges.delete(challengeId)
                online.get(challenge.from.id)?.emit('notice', `${user.name} declined your challenge.`)
                invitations()
                return
            }
            if (!online.has(challenge.from.id)) reject('The challenger is offline.')
            if (userRooms.has(user.id) || userRooms.has(challenge.from.id)) reject('One of the players is already in a room.')
            await addPlayers({ id: randomUUID(), players: [], game: null, stack: [], private: true }, [challenge.from, challenge.to])
        })

        handle('cancelChallenge', async ({ challengeId }) => {
            const challenge = challenges.get(challengeId)
            if (!challenge || challenge.from.id !== user.id) reject('This challenge is no longer available.')
            challenges.delete(challengeId)
            invitations()
        })

        handle('gameAction', async action => {
            const room = rooms.get(userRooms.get(user.id))
            if (!room?.state) reject('You are not in an active game.')
            const updated = applyAction(room.state, user.id, action)
            const player = room.players.find(member => member.user.id === user.id)
            const nextRound = updated.roundNumber !== room.state.roundNumber
            const roundFinished = room.state.status === 'playing' && updated.status !== 'playing'
            const roundId = await database.$transaction(async transaction => {
                await transaction.move.create({ data: {
                    roomId: room.id, playerId: player.prismaId, roundId: room.roundId,
                    type: action.type,
                    payload: {
                        revision: action.revision,
                        ...(Array.isArray(action.cardIds) ? { cardIds: action.cardIds } : {}),
                        ...(action.type === 'drawStack' && Array.isArray(action.stackCardIds) ? { stackCardIds: action.stackCardIds } : {}),
                        ...(typeof action.cardId === 'string' ? { cardId: action.cardId } : {}),
                        ...(typeof action.meldId === 'string' ? { meldId: action.meldId } : {}),
                    },
                } })
                if (roundFinished) await transaction.round.update({
                    where: { id: room.roundId }, data: { result: updated.result },
                })
                const round = nextRound ? await transaction.round.create({
                    data: { gameId: room.game.id, number: updated.roundNumber },
                }) : null
                await transaction.game.update({ where: { id: room.game.id }, data: { state: updated } })
                return round?.id || room.roundId
            })
            room.state = updated
            room.roundId = roundId
            publishRoom(room)
        })

        socket.on('disconnect', () => {
            clearTimeout(expiration)
            if (online.get(user.id) === socket) online.delete(user.id)
            cancelChallenges(user.id)
            const room = rooms.get(userRooms.get(user.id))
            if (room) {
                room.lastDisconnectedAt = Date.now()
                publishRoom(room)
            }
            presence()
        })
    })

    const cleanup = setInterval(() => {
        let changed = false
        for (const [id, challenge] of challenges) {
            if (challenge.expiresAt <= Date.now()) { challenges.delete(id); changed = true }
        }
        if (changed) invitations()
        for (const [id, room] of rooms) {
            if (room.lastDisconnectedAt < Date.now() - 30 * 60000 && room.players.every(player => !online.has(player.user.id))) {
                room.players.forEach(player => userRooms.delete(player.user.id))
                rooms.delete(id)
            }
        }
    }, 5000)
    cleanup.unref()
    server.on('close', () => clearInterval(cleanup))
    app.use((error, req, res, next) => {
        console.error(error)
        res.status(error.status === 400 ? 400 : 500).json({ error: 'The request could not be completed. Please try again.' })
    })
    return { app, server, io }
}

if (require.main === module) {
    const { server } = createGameServer()
    const port = process.env.PORT || 3001
    server.listen(port, () => console.log(`Game server running on port ${port}`))
}

module.exports = { createGameServer }
