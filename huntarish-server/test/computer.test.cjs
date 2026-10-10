const test = require('node:test')
const assert = require('node:assert/strict')
const { createMatch, applyAction, playerView, shuffledDeck } = require('../lib/game')
const { levels, chooseAction } = require('../lib/computer')

const players = [{ id: 'human', name: 'Human' }, { id: 'computer', name: 'Computer' }]
const card = (rank, suit = 'hearts') => ({ id: `${rank}${suit}`, rank, suit })

test('rejects invalid difficulties including inherited property names', () => {
    for (const difficulty of ['unknown', '__proto__', 'constructor']) {
        assert.throws(() => chooseAction({}, difficulty), /Unknown computer difficulty/)
    }
})

test('computer picks up and plays four tens using multiple stack cards', () => {
    const state = createMatch(players)
    state.players[0].hand = [card('10', 'spades'), card('10', 'clubs'), card('2')]
    state.stack = [card('10', 'diamonds'), card('9'), card('10')]
    const action = chooseAction(playerView(state, 'human'), 'expert', () => .99)
    assert.equal(action.type, 'drawStack')
    assert.equal(action.cardId, '10diamonds')
    assert.equal(action.cardIds.length, 2)
    assert.equal(action.stackCardIds.length, 2)
    const updated = applyAction(state, 'human', action)
    assert.equal(updated.melds[0].cards.length, 4)
    assert.deepEqual(updated.players[0].hand.map(item => item.id).sort(), ['2hearts', '9hearts'])
})

for (const difficulty of Object.keys(levels)) {
    test(`${difficulty} completes legal rounds using only its public view`, () => {
        let seed = 7291
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
        const deck = () => {
            const cards = shuffledDeck().sort((first, second) => first.id.localeCompare(second.id))
            for (let index = cards.length - 1; index > 0; index--) {
                const target = Math.floor(random() * (index + 1))
                ;[cards[index], cards[target]] = [cards[target], cards[index]]
            }
            return cards
        }
        for (let round = 0; round < 8; round++) {
            let state = createMatch(players, deck)
            let actions = 0
            while (state.status === 'playing' && actions++ < 1200) {
                const userId = state.players[state.turnIndex].id
                const view = playerView(state, userId)
                const before = structuredClone(view)
                const action = chooseAction(view, difficulty, random)
                assert.deepEqual(view, before)
                state = applyAction(state, userId, action)
                const cards = [...state.deck, ...state.stack, ...state.players.flatMap(player => player.hand), ...state.melds.flatMap(meld => meld.cards)]
                assert.equal(cards.length, 52)
                assert.equal(new Set(cards.map(item => item.id)).size, 52)
            }
            assert.notEqual(state.status, 'playing', 'round must finish without getting stuck')
        }
    })
}
