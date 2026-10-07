const test = require('node:test')
const assert = require('node:assert/strict')
const { buildStats } = require('../lib/stats')

function game(opponent, score, otherScore, deltas, status = 'matchOver') {
    return {
        state: { status, winnerId: score > otherScore ? 'me' : opponent, players: [{ id: 'me', name: 'Me', score }, { id: opponent, name: opponent, score: otherScore }] },
        rounds: deltas.map(delta => ({ result: { scores: [{ userId: 'me', delta }] } })),
    }
}

test('empty history has zero counts and no invented records', () => {
    const stats = buildStats([], 'me')
    assert.equal(stats.overall.wins, 0)
    assert.equal(stats.overall.bestRound, null)
    assert.equal(stats.overall.highestScore, null)
    assert.equal(stats.overall.biggestWin, null)
    assert.deepEqual(stats.opponents, [])
})

test('overall and head-to-head records include offline opponents and finished matches once', () => {
    const games = [game('Alice', 520, 300, [100, 120]), game('Alice', 470, 510, [140]), game('Bob', 600, -10, [150])]
    const stats = buildStats(games, 'me')
    assert.deepEqual(stats.overall, { matches: 3, wins: 2, losses: 1, rounds: 4, bestRound: 150, highestScore: 600, biggestWin: 610 })
    assert.deepEqual(stats.opponents[0], { id: 'Alice', name: 'Alice', matches: 2, wins: 1, losses: 1, rounds: 3, bestRound: 140, highestScore: 520, biggestWin: 220 })
    assert.deepEqual(buildStats(games, 'me'), stats)
})

test('unfinished and abandoned games contribute completed rounds only, including negative best rounds', () => {
    const partial = game('Alice', 700, 700, [-20, -5], 'roundOver')
    partial.active = false
    partial.rounds.push({ result: null })
    const stats = buildStats([partial, { state: null, rounds: [] }, game('Bob', 600, 100, [100])], 'outsider')
    assert.equal(stats.overall.rounds, 0)
    const own = buildStats([partial], 'me').overall
    assert.equal(own.bestRound, -5)
    assert.equal(own.rounds, 2)
    assert.equal(own.matches, 0)
    assert.equal(own.highestScore, null)
})
