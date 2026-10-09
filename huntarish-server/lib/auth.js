const { randomBytes, createHash, scrypt, timingSafeEqual } = require('crypto')
const { promisify } = require('util')

const deriveKey = promisify(scrypt)
const sessionDuration = 7 * 24 * 60 * 60 * 1000
const cookieName = 'huntarish_session'
const publicUser = user => ({ id: user.id, name: user.name })
const digest = token => createHash('sha256').update(token).digest('hex')

async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex')
    const key = await deriveKey(password, salt, 64)
    return `${salt}:${key.toString('hex')}`
}

async function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':')
    const key = await deriveKey(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return key.length === expected.length && timingSafeEqual(key, expected)
}

function sessionToken(headers) {
    if (headers.authorization) return /^Bearer ([a-f0-9]{64})$/.exec(headers.authorization)?.[1] || ''
    const cookie = (headers.cookie || '').split(';').map(value => value.trim())
        .find(value => value.startsWith(`${cookieName}=`))
    return cookie ? cookie.slice(cookieName.length + 1) : ''
}

function createAuth(app, prisma, origin, onLogout, onRename = async () => {}) {
    const attempts = new Map()
    const cleanup = setInterval(() => {
        for (const [key, value] of attempts) {
            if (value.until < Date.now()) attempts.delete(key)
        }
    }, 60000)
    cleanup.unref()

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    }

    async function authenticate(headers) {
        const token = sessionToken(headers)
        if (!/^[a-f0-9]{64}$/.test(token)) return null
        const session = await prisma.userSession.findUnique({
            where: { tokenHash: digest(token) }, include: { user: true },
        })
        return session && session.expiresAt > new Date() ? session : null
    }

    app.use('/auth', (req, res, next) => {
        res.set('Cache-Control', 'no-store')
        const nativeLogin = ['/native/login', '/native/register'].includes(req.path) && !req.headers.origin && !req.headers.cookie
        const bearer = !req.headers.origin && /^Bearer [a-f0-9]{64}$/.test(req.headers.authorization || '')
        if (req.method !== 'GET' && req.headers.origin !== origin && !nativeLogin && !bearer) {
            return res.status(403).json({ error: 'Request origin is not allowed.' })
        }
        next()
    })

    async function issueSession(user, res, native) {
        const token = randomBytes(32).toString('hex')
        await prisma.userSession.create({ data: {
            userId: user.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + sessionDuration),
        } })
        if (!native) res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDuration })
        res.json({ user: publicUser(user), ...(native ? { token } : {}) })
    }

    for (const action of ['register', 'login']) {
        app.post([`/auth/${action}`, `/auth/native/${action}`], async (req, res, next) => {
            try {
                const native = req.path.startsWith('/auth/native/')
                if (native && (req.headers.origin || req.headers.cookie)) return res.status(403).json({ error: 'Use browser sign-in.' })
                const key = req.ip
                const attempt = attempts.get(key)
                const limit = attempt && attempt.until > Date.now() ? attempt : { count: 0, until: Date.now() + 900000 }
                attempts.set(key, limit)
                if (++limit.count > 30) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
                const { email, password, name } = req.body || {}
                if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
                    typeof password !== 'string' || password.length < 12 || password.length > 128 ||
                    (action === 'register' && (typeof name !== 'string' || !name.trim() || name.trim().length > 40))) {
                    return res.status(400).json({ error: 'Enter a valid email, a name of 1–40 characters, and a password of 12–128 characters.' })
                }
                const normalizedEmail = email.trim().toLowerCase()
                let user
                if (action === 'register') {
                    user = await prisma.user.create({ data: {
                        email: normalizedEmail, name: name.trim(), passwordHash: await hashPassword(password),
                    } })
                } else {
                    user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
                    const valid = await verifyPassword(password, user ? user.passwordHash : `${'0'.repeat(32)}:${'0'.repeat(128)}`)
                    if (!user || !valid) return res.status(401).json({ error: 'Email or password is incorrect.' })
                }
                await issueSession(user, res, native)
            } catch (error) {
                if (error.code === 'P2002') return res.status(409).json({ error: 'That email or display name is already taken. Please choose another.' })
                next(error)
            }
        })
    }

    app.post('/auth/profile', async (req, res, next) => {
        try {
            const session = await authenticate(req.headers)
            if (!session) return res.status(401).json({ error: 'Please sign in.' })
            const name = req.body?.name
            if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) return res.status(400).json({ error: 'Choose a name of 1–40 characters.' })
            const user = await prisma.user.update({ where: { id: session.user.id }, data: { name: name.trim() } })
            await onRename(publicUser(user))
            res.json({ user: publicUser(user) })
        } catch (error) {
            if (error.code === 'P2002') return res.status(409).json({ error: 'That name is taken. Please choose another name.' })
            next(error)
        }
    })

    app.get('/auth/me', async (req, res, next) => {
        try {
            const session = await authenticate(req.headers)
            res.json({ user: session ? publicUser(session.user) : null })
        } catch (error) { next(error) }
    })

    app.post('/auth/logout', async (req, res, next) => {
        try {
            const session = await authenticate(req.headers)
            if (session) {
                await prisma.userSession.deleteMany({ where: { id: session.id } })
                onLogout(session.id)
            }
            res.clearCookie(cookieName, cookieOptions)
            res.json({ ok: true })
        } catch (error) { next(error) }
    })

    return { authenticate }
}

module.exports = { createAuth, hashPassword, verifyPassword, publicUser }
