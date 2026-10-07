const test = require('node:test')
const assert = require('node:assert/strict')
const { createMatch, forfeitMatch } = require('../lib/game')
const { buildStats } = require('../lib/stats')

test('forfeit scores current cards, awards opponent victory, and counts all statistics exactly once', () => {
    const state = createMatch([{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }])
    const finished = forfeitMatch(state, 'first')
    assert.equal(state.status, 'playing')
    assert.equal(finished.status, 'matchOver')
    assert.equal(finished.winnerId, 'second')
    assert.equal(finished.forfeitBy, 'first')
    assert.equal(finished.history.length, 1)
    assert.deepEqual(forfeitMatch(finished, 'second'), finished)
    const games = [{ state: finished, rounds: [{ result: finished.result }] }]
    const stats = buildStats(games, 'second').overall
    assert.equal(stats.wins, 1)
    assert.equal(stats.rounds, 1)
    assert.equal(stats.highestScore, finished.players[1].score)
    assert.equal(stats.bestRound, finished.result.scores[1].delta)
    assert.equal(stats.biggestWin, finished.players[1].score - finished.players[0].score)
    assert.equal(buildStats(games, 'first').overall.losses, 1)
    assert.throws(() => forfeitMatch(state, 'outsider'))
})

test('leaving between rounds does not score the same cards twice', () => {
    const state = createMatch([{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }])
    state.status = 'roundOver'
    state.players[0].score = 200
    state.players[1].score = 100
    const finished = forfeitMatch(state, 'first')
    assert.equal(finished.players[0].score, 200)
    assert.equal(finished.players[1].score, 100)
    assert.equal(finished.history.length, 0)
    assert.equal(finished.winnerId, 'second')
})
