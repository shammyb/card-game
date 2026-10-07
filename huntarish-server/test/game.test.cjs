const test = require('node:test')
const assert = require('node:assert/strict')
const { createMatch, applyAction, playerView, meldType, cardPoints, shuffledDeck } = require('../lib/game')

const card = (rank, suit = 'hearts') => ({ id: `${rank}${suit}`, rank, suit })
const players = [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }]
const run = (...ranks) => ranks.map(rank => card(rank))

function fixture({ hand, otherHand = [card('9', 'clubs')], stack = [card('K', 'diamonds')], melds = [], phase = 'play', scores = [0, 0], emptyDeck = false }) {
    const state = createMatch(players)
    state.players[0].hand = hand
    state.players[1].hand = otherHand
    state.players.forEach((player, index) => { player.score = scores[index] })
    state.stack = stack
    state.melds = melds
    state.phase = phase
    const used = new Set([...hand, ...otherHand, ...stack, ...melds.flatMap(meld => meld.cards)].map(item => item.id))
    state.deck = emptyDeck ? [] : shuffledDeck().filter(item => !used.has(item.id))
    return state
}

function act(state, type, payload = {}, userId = 'first') {
    return applyAction(state, userId, { type, revision: state.revision, ...payload })
}

function conserved(state) {
    const cards = [...state.deck, ...state.stack, ...state.players.flatMap(player => player.hand), ...state.melds.flatMap(meld => meld.cards)]
    assert.equal(cards.length, 52)
    assert.equal(new Set(cards.map(item => item.id)).size, 52)
}

test('deal uses 52 unique non-joker cards, eleven each and one stack card', () => {
    const state = createMatch(players)
    assert.equal(state.deck.length, 29)
    assert.equal(state.stack.length, 1)
    assert.equal(state.players[0].hand.length, 11)
    assert.equal(state.players[1].hand.length, 11)
    assert.equal(state.phase, 'draw')
    conserved(state)
})

test('aces score 15, faces score 10 and numbered cards score their number', () => {
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
        assert.equal(cardPoints(card(rank)), rank === 'A' ? 15 : ['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank))
    }
})

test('validates sets of three/four and same-suit runs with low/high aces', () => {
    assert.equal(meldType(['clubs', 'diamonds', 'spades'].map(suit => card('K', suit))), 'set')
    assert.equal(meldType(['clubs', 'diamonds', 'hearts', 'spades'].map(suit => card('K', suit))), 'set')
    for (const cards of [run('A', '2', '3'), run('Q', 'K', 'A'), run('A', '2', '3', '4', '5'), run('A', 'K', 'Q', 'J'), run('5', '3', '4')]) assert.equal(meldType(cards), 'run')
    for (const cards of [run('K', 'A', '2'), run('2', '3'), run('2', '4', '5'), run('2', '2', '3'), [card('2'), card('3', 'clubs'), card('4')], [card('K'), card('K'), card('K', 'clubs')]]) assert.equal(meldType(cards), null)
})

test('enforces turns, one draw per turn and mandatory discard; failures never mutate state', () => {
    const original = createMatch(players)
    const before = structuredClone(original)
    assert.throws(() => act(original, 'drawDeck', {}, 'second'), /Wait for your turn/)
    assert.throws(() => act(original, 'discard', { cardId: original.players[0].hand[0].id }), /Draw before/)
    assert.throws(() => act(original, 'playCards', { cardIds: original.players[0].hand.slice(0, 3).map(item => item.id) }), /Draw from/)
    assert.throws(() => act(original, 'unknown'), /not supported/)
    assert.deepEqual(original, before)
    const drawn = act(original, 'drawDeck')
    assert.equal(drawn.players[0].hand.length, 12)
    assert.equal(drawn.phase, 'play')
    assert.throws(() => act(drawn, 'drawDeck'), /already drawn/)
    assert.throws(() => applyAction(drawn, 'first', { type: 'discard', cardId: drawn.players[0].hand[0].id, revision: 0 }), /table has changed/)
    const discarded = act(drawn, 'discard', { cardId: drawn.players[0].hand[0].id })
    assert.equal(discarded.turnIndex, 1)
    assert.equal(discarded.phase, 'draw')
    assert.equal(discarded.players[0].hand.length, 11)
    conserved(discarded)
})

test('buried pickup plays the selected card and only takes cards above it', () => {
    const stack = [card('8', 'clubs'), card('9', 'clubs'), card('A'), card('K', 'clubs'), card('Q', 'clubs')]
    const state = fixture({ hand: run('2', '3'), stack, otherHand: [card('7', 'spades')], phase: 'draw' })
    const played = act(state, 'drawStack', { cardId: card('A').id, cardIds: run('2', '3').map(item => item.id) })
    assert.deepEqual(played.stack, stack.slice(0, 2))
    assert.deepEqual(played.players[0].hand, stack.slice(3))
    assert.deepEqual(played.melds[0].cards.map(item => item.rank), ['A', '2', '3'])
    assert.equal(played.status, 'playing')
    conserved(played)
    const bottomState = fixture({ hand: [card('8', 'diamonds'), card('8', 'spades')], stack, otherHand: [card('7', 'spades')], phase: 'draw' })
    const bottom = act(bottomState, 'drawStack', { cardId: stack[0].id, cardIds: bottomState.players[0].hand.map(item => item.id) })
    assert.equal(bottom.stack.length, 0)
    assert.deepEqual(bottom.players[0].hand, stack.slice(1))
    conserved(bottom)
})

test('pickup cannot borrow an unowned card or use a newer stack card as its required hand card', () => {
    const state = fixture({ hand: [card('2')], stack: run('A', '3'), phase: 'draw' })
    const before = structuredClone(state)
    assert.throws(() => act(state, 'drawStack', { cardId: card('A').id, cardIds: run('2', '3').map(item => item.id) }), /not in your hand/)
    assert.throws(() => act(state, 'drawStack', { cardId: card('A').id, cardIds: [card('2').id, card('2').id] }), /different cards/)
    assert.deepEqual(state, before)
})

test('screenshot: three stack twos and the hand two form four of a kind', () => {
    const stack = [card('10', 'clubs'), card('3', 'clubs'), card('2', 'clubs'), card('3', 'spades'), card('J'), card('K'), card('10', 'diamonds'), card('K', 'diamonds'), card('5'), card('A', 'spades'), card('8', 'spades'), card('2', 'diamonds'), card('4', 'spades'), card('2')]
    const hand = [card('8', 'diamonds'), card('K', 'spades'), card('5', 'spades'), card('6', 'spades'), card('3'), card('2', 'spades')]
    const state = fixture({ hand, stack, phase: 'draw' })
    const stackCardIds = [card('2').id, card('2', 'clubs').id, card('2', 'diamonds').id]
    const played = act(state, 'drawStack', { cardId: card('2', 'clubs').id, cardIds: [card('2', 'spades').id], stackCardIds })
    assert.equal(played.melds[0].kind, 'set')
    assert.equal(played.melds[0].cards.length, 4)
    assert.ok(played.melds[0].cards.every(item => item.rank === '2' && item.ownerId === 'first'))
    assert.deepEqual(played.stack, stack.slice(0, 2))
    assert.deepEqual(played.players[0].hand, [...hand.slice(0, -1), ...stack.slice(2).filter(item => !stackCardIds.includes(item.id))])
    conserved(played)
})

test('multiple stack cards can help complete a run, but cannot replace the hand contribution', () => {
    const state = fixture({ hand: [card('2')], stack: run('A', '3', '4'), phase: 'draw' })
    const played = act(state, 'drawStack', { cardId: card('A').id, cardIds: [card('2').id], stackCardIds: run('A', '3', '4').map(item => item.id) })
    assert.deepEqual(played.melds[0].cards.map(item => item.rank), ['A', '2', '3', '4'])
    assert.equal(played.status, 'roundOver')
    assert.equal(played.result.scores[0].tablePoints, 24)
    conserved(played)
    assert.throws(() => act(state, 'drawStack', { cardId: card('A').id, cardIds: [], stackCardIds: run('A', '3', '4').map(item => item.id) }), /Select different/)
})

test('multi-card pickup rejects older, missing, repeated or unowned stack selections atomically', () => {
    const state = fixture({ hand: run('2', '3'), stack: run('5', 'A', '4'), phase: 'draw' })
    const before = structuredClone(state)
    for (const stackCardIds of [[], [card('4').id], [card('A').id, card('A').id], [card('A').id, card('5').id], [card('A').id, card('Q').id], 'Ahearts']) {
        assert.throws(() => act(state, 'drawStack', { cardId: card('A').id, cardIds: run('2', '3').map(item => item.id), stackCardIds }))
        assert.deepEqual(state, before)
    }
})

test('pickups allow runs of four, five and seven, not just multiples of three', () => {
    for (const length of [4, 5, 7]) {
        const handRun = Array.from({ length: length - 1 }, (_, index) => card(String(index + 3)))
        const state = fixture({ hand: [...handRun, card('K', 'spades')], stack: [card('2')], phase: 'draw' })
        const played = act(state, 'drawStack', { cardId: card('2').id, cardIds: handRun.map(item => item.id) })
        assert.equal(played.melds[0].cards.length, length)
        assert.equal(played.players[0].hand.length, 1)
        conserved(played)
    }
})

test('one or two hand cards can extend an existing run without making a new triple', () => {
    const meld = { id: 'existing', kind: 'run', cards: run('2', '3', '4').map(item => ({ ...item, ownerId: 'second' })) }
    for (const ranks of [['5'], ['5', '6']]) {
        const additions = run(...ranks)
        const state = fixture({ hand: [...additions, card('K', 'spades')], melds: [meld] })
        const played = act(state, 'playCards', { cardIds: additions.map(item => item.id), meldId: meld.id })
        assert.equal(played.melds[0].cards.length, 3 + additions.length)
        assert.equal(played.players[0].hand.length, 1)
        conserved(played)
    }
})

test('stack extension must include a hand card, and each added card keeps its scorer', () => {
    const meld = { id: 'opponent-run', kind: 'run', cards: run('2', '3', '4').map(item => ({ ...item, ownerId: 'second' })) }
    const denied = fixture({ hand: run('6', 'Q'), stack: [card('5')], melds: [meld], phase: 'draw' })
    assert.throws(() => act(denied, 'drawStack', { cardId: card('5').id, cardIds: [], meldId: meld.id }), /Select different/)
    const state = fixture({ hand: run('5', 'Q'), otherHand: [card('J', 'clubs')], stack: [card('6')], melds: [meld], phase: 'draw' })
    const played = act(state, 'drawStack', { cardId: card('6').id, cardIds: [card('5').id], meldId: meld.id })
    assert.deepEqual(played.melds[0].cards.map(item => item.rank), ['2', '3', '4', '5', '6'])
    assert.deepEqual(played.melds[0].cards.map(item => item.ownerId), ['second', 'second', 'second', 'first', 'first'])
    const finished = act(played, 'discard', { cardId: card('Q').id })
    assert.equal(finished.result.scores[0].tablePoints, 11)
    assert.equal(finished.result.scores[0].handPoints, 0)
    assert.equal(finished.result.scores[1].tablePoints, 9)
    assert.equal(finished.result.scores[1].delta, -1)
})

test('extend an opponent run by multiple hand cards, but cannot break or rearrange it', () => {
    const meld = { id: 'run', kind: 'run', cards: run('2', '3', '4').map(item => ({ ...item, ownerId: 'second' })) }
    const state = fixture({ hand: run('5', '6', '8'), melds: [meld] })
    assert.throws(() => act(state, 'playCards', { cardIds: [card('8').id], meldId: 'run' }), /do not extend/)
    const played = act(state, 'playCards', { cardIds: run('5', '6').map(item => item.id), meldId: 'run' })
    assert.equal(played.melds[0].cards.length, 5)
    assert.equal(played.players[0].hand.length, 1)
    assert.equal(played.turnIndex, 0)
})

test('going out by playing or discarding finishes immediately and scores once', () => {
    const state = fixture({ hand: run('A', '2', '3'), otherHand: [card('A', 'clubs'), card('J', 'diamonds'), card('2', 'spades')] })
    const finished = act(state, 'playCards', { cardIds: state.players[0].hand.map(item => item.id) })
    assert.equal(finished.status, 'roundOver')
    assert.equal(finished.players[0].score, 20)
    assert.equal(finished.players[1].score, -27)
    assert.equal(finished.history.length, 1)
    assert.throws(() => act(finished, 'discard', { cardId: card('A').id }), /round is over/)
    const discardState = fixture({ hand: [card('A')], otherHand: [card('2', 'spades')] })
    const discarded = act(discardState, 'discard', { cardId: card('A').id })
    assert.equal(discarded.status, 'roundOver')
    assert.equal(discarded.players[0].score, 0)
    assert.equal(discarded.stack.at(-1).rank, 'A')
})

test('empty deck offers a choice even with a legal pickup; last deck draw still gets a full turn', () => {
    const state = fixture({ hand: run('2', '3', '9'), stack: [card('A')], phase: 'draw', emptyDeck: true })
    assert.equal(act(state, 'endRound').status, 'roundOver')
    assert.equal(act(state, 'drawStack', { cardId: card('A').id, cardIds: run('2', '3').map(item => item.id) }).status, 'playing')
    assert.throws(() => act(state, 'drawDeck'), /deck is empty/)
    const lastDraw = { ...state, deck: [card('K', 'clubs')] }
    assert.throws(() => act(lastDraw, 'endRound'), /only at the start/)
    const drawn = act(lastDraw, 'drawDeck')
    assert.equal(drawn.status, 'playing')
    assert.throws(() => act(drawn, 'endRound'), /only at the start/)
    const discarded = act(drawn, 'discard', { cardId: card('K', 'clubs').id })
    assert.equal(act(discarded, 'endRound', {}, 'second').status, 'roundOver')
})

test('500 does not win, 501 is inclusive, highest score wins if both qualify, ties continue', () => {
    const base = { hand: run('A', '2', '3'), otherHand: [card('2', 'spades')] }
    for (const [scores, winner] of [[[480, 0], null], [[481, 0], 'first'], [[481, 510], 'second'], [[490, 510], 'first'], [[481, 503], null]]) {
        const state = fixture({ ...base, scores })
        const finished = act(state, 'playCards', { cardIds: state.players[0].hand.map(item => item.id) })
        assert.equal(finished.winnerId, winner)
        assert.equal(finished.status, winner ? 'matchOver' : 'roundOver')
    }
})

test('both players ready starts next round, preserves cumulative scores and alternates starter', () => {
    const state = fixture({ hand: run('A', '2', '3') })
    const finished = act(state, 'playCards', { cardIds: state.players[0].hand.map(item => item.id) })
    const firstReady = act(finished, 'nextRound')
    assert.equal(firstReady.status, 'roundOver')
    assert.throws(() => act(firstReady, 'nextRound'), /already ready/)
    const next = act(firstReady, 'nextRound', {}, 'second')
    assert.equal(next.roundNumber, 2)
    assert.equal(next.turnIndex, 1)
    assert.equal(next.players[0].score, 20)
    assert.equal(next.players[1].score, -9)
    assert.equal(next.history.length, 1)
    assert.equal(next.result, null)
    assert.equal(next.status, 'playing')
    assert.deepEqual(next.ready, [])
    conserved(next)
})

test('player views expose only own hand, public cards/counts and scores', () => {
    const state = createMatch(players)
    const view = playerView(state, 'first')
    assert.equal(view.deck, undefined)
    assert.equal(view.players[1].hand, undefined)
    assert.equal(view.hand.length, 11)
    assert.throws(() => playerView(state, 'outsider'), /not in this game/)
    view.hand.length = 0
    assert.equal(state.players[0].hand.length, 11)
})

test('many draw/discard turns conserve all cards and reveal no deck identities', () => {
    let state = createMatch(players)
    while (state.deck.length) {
        const userId = state.players[state.turnIndex].id
        state = act(state, 'drawDeck', {}, userId)
        state = act(state, 'discard', { cardId: state.players[state.turnIndex].hand[0].id }, userId)
        conserved(state)
    }
    const ended = act(state, 'endRound', {}, state.players[state.turnIndex].id)
    assert.equal(ended.status, 'roundOver')
})
