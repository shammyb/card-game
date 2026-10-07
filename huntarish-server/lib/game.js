const { randomInt, randomUUID } = require('crypto')

const suits = ['spades', 'hearts', 'diamonds', 'clubs']
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function fail(message) {
    throw Object.assign(new Error(message), { clientMessage: message })
}

function shuffledDeck() {
    const deck = suits.flatMap(suit => ranks.map(rank => ({ id: `${rank}${suit}`, rank, suit })))
    for (let index = deck.length - 1; index > 0; index--) {
        const swapIndex = randomInt(index + 1)
        ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
    }
    return deck
}

function meldType(cards) {
    if (cards.length < 3 || new Set(cards.map(card => card.id)).size !== cards.length) return null
    if (cards.length <= 4 && cards.every(card => card.rank === cards[0].rank) &&
        new Set(cards.map(card => card.suit)).size === cards.length) return 'set'
    if (!cards.every(card => card.suit === cards[0].suit)) return null
    for (const aceHigh of [false, true]) {
        const values = cards.map(card => card.rank === 'A' && aceHigh ? 14 : ranks.indexOf(card.rank) + 1).sort((first, second) => first - second)
        if (values.every((value, index) => index === 0 || value === values[index - 1] + 1)) return 'run'
    }
    return null
}

function orderMeld(cards, kind) {
    if (kind === 'set') return cards.sort((first, second) => suits.indexOf(first.suit) - suits.indexOf(second.suit))
    const aceHigh = cards.some(card => card.rank === 'K') && cards.some(card => card.rank === 'A') && !cards.some(card => card.rank === '2')
    const rankValue = card => card.rank === 'A' && aceHigh ? 14 : ranks.indexOf(card.rank) + 1
    return cards.sort((first, second) => rankValue(first) - rankValue(second))
}

function cardPoints(card) {
    if (card.rank === 'A') return 15
    if (['J', 'Q', 'K'].includes(card.rank)) return 10
    return Number(card.rank)
}

function beginRound(state, deckFactory = shuffledDeck) {
    state.deck = deckFactory()
    state.stack = [state.deck.pop()]
    state.players.forEach(player => { player.hand = state.deck.splice(0, 11) })
    state.melds = []
    state.turnIndex = (state.roundNumber - 1) % state.players.length
    state.phase = 'draw'
    state.status = 'playing'
    state.ready = []
    state.result = null
    state.winnerId = null
    state.lastAction = `Round ${state.roundNumber} started. ${state.players[state.turnIndex].name} draws first.`
}

function createMatch(players, deckFactory = shuffledDeck) {
    if (players.length !== 2 || players[0].id === players[1].id) fail('A game needs two different players.')
    const state = {
        revision: 0, roundNumber: 1, history: [],
        players: players.map(player => ({ id: player.id, name: player.name, hand: [], score: 0 })),
    }
    beginRound(state, deckFactory)
    return state
}

function finishRound(state, reason) {
    const scores = state.players.map(player => {
        const tablePoints = state.melds.flatMap(meld => meld.cards).filter(card => card.ownerId === player.id).reduce((sum, card) => sum + cardPoints(card), 0)
        const handPoints = player.hand.reduce((sum, card) => sum + cardPoints(card), 0)
        const delta = tablePoints - handPoints
        player.score += delta
        return { userId: player.id, name: player.name, tablePoints, handPoints, delta, total: player.score }
    })
    const highScore = Math.max(...state.players.map(player => player.score))
    const leaders = state.players.filter(player => player.score === highScore)
    state.winnerId = highScore >= 501 && leaders.length === 1 ? leaders[0].id : null
    state.status = state.winnerId ? 'matchOver' : 'roundOver'
    state.phase = 'ended'
    state.result = { roundNumber: state.roundNumber, reason, scores }
    state.history.push(state.result)
    state.lastAction = reason
}

function fromHand(player, ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 52 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) fail('Select different cards from your hand.')
    const cards = ids.map(id => player.hand.find(card => card.id === id))
    if (cards.some(card => !card)) fail('One of those cards is not in your hand.')
    return cards
}

function putOnTable(state, player, cards, meldId) {
    const ownedCards = cards.map(card => ({ ...card, ownerId: player.id }))
    if (meldId !== undefined && meldId !== null) {
        const meld = state.melds.find(item => item.id === meldId)
        if (!meld) fail('Choose a set or run on the table.')
        const combined = [...meld.cards, ...ownedCards]
        if (meldType(combined) !== meld.kind) fail('Those cards do not extend that set or run.')
        meld.cards = orderMeld(combined, meld.kind)
    } else {
        const kind = meldType(cards)
        if (!kind) fail('Play at least three matching ranks or consecutive cards of one suit. Aces may be low or high, but cannot wrap.')
        state.melds.push({ id: randomUUID(), kind, cards: orderMeld(ownedCards, kind) })
    }
    const playedIds = new Set(cards.map(card => card.id))
    player.hand = player.hand.filter(card => !playedIds.has(card.id))
}

function applyAction(current, userId, action, deckFactory = shuffledDeck) {
    if (!action || typeof action !== 'object' || !Number.isInteger(action.revision) || action.revision !== current.revision) fail('The table has changed. Use the latest cards and try again.')
    const state = structuredClone(current)
    const player = state.players.find(member => member.id === userId)
    if (!player) fail('You are not in this game.')
    if (action.type === 'nextRound') {
        if (state.status !== 'roundOver') fail('The next round is not available.')
        if (state.ready.includes(userId)) fail('You are already ready.')
        state.ready.push(userId)
        if (state.ready.length === 2) {
            state.roundNumber++
            beginRound(state, deckFactory)
        }
        state.revision++
        return state
    }
    if (state.status !== 'playing') fail('This round is over.')
    if (state.players[state.turnIndex].id !== userId) fail('Wait for your turn.')
    if (action.type === 'drawDeck') {
        if (state.phase !== 'draw') fail('You have already drawn this turn.')
        if (!state.deck.length) fail('The deck is empty. Use the stack or end the round.')
        player.hand.push(state.deck.pop())
        state.phase = 'play'
        state.lastAction = `${player.name} drew from the deck.`
    } else if (action.type === 'drawStack') {
        if (state.phase !== 'draw') fail('You have already drawn this turn.')
        const index = state.stack.findIndex(card => card.id === action.cardId)
        if (index < 0) fail('Choose a card in the stack.')
        const cards = fromHand(player, action.cardIds)
        const chosen = state.stack[index]
        const stackIds = action.stackCardIds === undefined ? [chosen.id] : action.stackCardIds
        if (!Array.isArray(stackIds) || !stackIds.length || stackIds.length > 52 ||
            stackIds.some(id => typeof id !== 'string') || new Set(stackIds).size !== stackIds.length || !stackIds.includes(chosen.id)) {
            fail('Select the pickup card and any newer stack cards you want to play with it.')
        }
        const pickup = state.stack.slice(index)
        const stackCards = stackIds.map(id => pickup.find(card => card.id === id))
        if (stackCards.some(card => !card)) fail('You can only play stack cards from the chosen card onwards.')
        putOnTable(state, player, [...stackCards, ...cards], action.meldId)
        player.hand.push(...pickup.filter(card => !stackIds.includes(card.id)))
        state.stack = state.stack.slice(0, index)
        state.phase = 'play'
        state.lastAction = `${player.name} picked up and played ${chosen.rank} of ${chosen.suit}.`
        if (!player.hand.length) finishRound(state, `${player.name} played their last card.`)
    } else if (action.type === 'playCards') {
        if (state.phase !== 'play') fail('Draw from the deck or make a valid stack pickup first.')
        const cards = fromHand(player, action.cardIds)
        putOnTable(state, player, cards, action.meldId)
        state.lastAction = `${player.name} played ${cards.length} card${cards.length === 1 ? '' : 's'} to the table.`
        if (!player.hand.length) finishRound(state, `${player.name} played their last card.`)
    } else if (action.type === 'discard') {
        if (state.phase !== 'play') fail('Draw before discarding.')
        const [card] = fromHand(player, [action.cardId])
        player.hand = player.hand.filter(item => item.id !== card.id)
        state.stack.push(card)
        state.lastAction = `${player.name} discarded ${card.rank} of ${card.suit}.`
        if (!player.hand.length) finishRound(state, `${player.name} discarded their last card.`)
        else {
            state.turnIndex = (state.turnIndex + 1) % state.players.length
            state.phase = 'draw'
        }
    } else if (action.type === 'endRound') {
        if (state.deck.length || state.phase !== 'draw') fail('You can end the round only at the start of your turn when the deck is empty.')
        finishRound(state, `${player.name} ended the round with an empty deck.`)
    } else {
        fail('That game action is not supported.')
    }
    state.revision++
    return state
}

function playerView(state, userId) {
    const player = state.players.find(member => member.id === userId)
    if (!player) fail('You are not in this game.')
    return structuredClone({
        revision: state.revision, roundNumber: state.roundNumber, status: state.status, phase: state.phase,
        turnUserId: state.players[state.turnIndex].id, deckCount: state.deck.length,
        hand: player.hand, stack: state.stack, melds: state.melds,
        players: state.players.map(member => ({ id: member.id, name: member.name, cards: member.hand.length, score: member.score })),
        result: state.result, history: state.history, ready: state.ready, winnerId: state.winnerId, lastAction: state.lastAction,
    })
}

function forfeitMatch(current, userId) {
    if (!current.players.some(player => player.id === userId)) fail('You are not in this match.')
    const state = structuredClone(current)
    if (state.status === 'matchOver') return state
    const reason = `${state.players.find(player => player.id === userId).name} forfeited the match.`
    if (state.status === 'playing') finishRound(state, reason)
    state.status = 'matchOver'
    state.phase = 'ended'
    state.winnerId = state.players.find(player => player.id !== userId).id
    state.forfeitBy = userId
    state.lastAction = reason
    state.revision++
    return state
}

module.exports = { createMatch, applyAction, playerView, meldType, cardPoints, shuffledDeck, forfeitMatch }
