const { meldType, cardPoints } = require('./game')

const levels = {
    beginner: { name: 'Beginner', depth: 1, skip: .65, foresight: 0, penalty: 2 },
    easy: { name: 'Easy', depth: 3, skip: .3, foresight: 0, penalty: 1.5 },
    medium: { name: 'Medium', depth: 8, skip: 0, foresight: 1, penalty: 1 },
    hard: { name: 'Hard', depth: 20, skip: 0, foresight: 2, penalty: .8 },
    expert: { name: 'Expert', depth: 52, skip: 0, foresight: 3, penalty: .65 },
}
const rankValue = card => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].indexOf(card.rank) + 1
const points = cards => cards.reduce((sum, card) => sum + cardPoints(card), 0)

function groups(pool) {
    const found = new Map()
    const add = cards => {
        if (meldType(cards)) found.set(cards.map(card => card.id).sort().join('|'), cards)
    }
    for (const rank of new Set(pool.map(card => card.rank))) {
        const same = pool.filter(card => card.rank === rank)
        if (same.length >= 3) {
            add(same)
            if (same.length === 4) same.forEach(card => add(same.filter(other => other.id !== card.id)))
        }
    }
    for (const suit of new Set(pool.map(card => card.suit))) {
        for (const high of [false, true]) {
            const sorted = pool.filter(card => card.suit === suit).sort((first, second) =>
                (high && first.rank === 'A' ? 14 : rankValue(first)) - (high && second.rank === 'A' ? 14 : rankValue(second)))
            for (let start = 0; start < sorted.length; start++) {
                for (let end = start + 3; end <= sorted.length; end++) add(sorted.slice(start, end))
            }
        }
    }
    return [...found.values()]
}

function plays(pool, melds) {
    const options = groups(pool).map(cards => ({ cards }))
    for (const meld of melds) {
        const existing = new Set(meld.cards.map(card => card.id))
        const relevant = pool.filter(card => meld.kind === 'set' ? card.rank === meld.cards[0].rank : card.suit === meld.cards[0].suit)
        for (const group of groups([...meld.cards, ...relevant])) {
            if (!meld.cards.every(card => group.some(item => item.id === card.id))) continue
            const cards = group.filter(card => !existing.has(card.id))
            if (cards.length) options.push({ cards, meldId: meld.id })
        }
    }
    return options
}

function potential(card, hand) {
    return hand.filter(other => other.id !== card.id).reduce((sum, other) => {
        if (other.rank === card.rank) return sum + 3
        if (other.suit !== card.suit) return sum
        const distance = Math.abs(rankValue(other) - rankValue(card))
        return sum + (distance === 1 || (card.rank === 'A' && other.rank === 'K') || (other.rank === 'A' && card.rank === 'K') ? 2 : distance === 2 ? 1 : 0)
    }, 0)
}

function chooseAction(view, difficulty, random = Math.random) {
    if (!Object.hasOwn(levels, difficulty)) throw new Error('Unknown computer difficulty.')
    const level = levels[difficulty]
    const revision = view.revision
    const remainingValue = remaining => level.foresight >= 2
        ? Math.max(0, ...plays(remaining, view.melds).map(play => points(play.cards))) : 0
    const score = (option, extra = []) => {
        const ids = new Set(option.cards.map(card => card.id))
        const remaining = [...view.hand, ...extra].filter(card => !ids.has(card.id))
        return points(option.cards) * 2 + (remaining.length === 0 ? 10000 : 0) + remainingValue(remaining) * level.foresight
    }
    if (view.phase === 'draw') {
        const choices = []
        if (random() >= level.skip || !view.deckCount) {
            const start = Math.max(0, view.stack.length - level.depth)
            for (let index = start; index < view.stack.length; index++) {
                const pickup = view.stack.slice(index)
                const handIds = new Set(view.hand.map(card => card.id))
                for (const option of plays([...view.hand, ...pickup], view.melds)) {
                    if (!option.cards.some(card => card.id === pickup[0].id) || !option.cards.some(card => handIds.has(card.id))) continue
                    const kept = pickup.filter(card => !option.cards.some(played => played.id === card.id))
                    choices.push({ option, index, value: score(option, pickup) - points(kept) * level.penalty })
                }
            }
        }
        choices.sort((first, second) => second.value - first.value)
        const best = choices[0]
        if (best && (best.value > 0 || !view.deckCount)) {
            const handIds = new Set(view.hand.map(card => card.id))
            return { type: 'drawStack', revision, cardId: view.stack[best.index].id,
                cardIds: best.option.cards.filter(card => handIds.has(card.id)).map(card => card.id),
                stackCardIds: best.option.cards.filter(card => !handIds.has(card.id)).map(card => card.id),
                ...(best.option.meldId ? { meldId: best.option.meldId } : {}) }
        }
        return { type: view.deckCount ? 'drawDeck' : 'endRound', revision }
    }
    const options = plays(view.hand, view.melds)
    if (options.length && random() >= level.skip) {
        const ranked = options.map(option => ({ option, value: score(option) })).sort((first, second) => second.value - first.value)
        const best = level.foresight ? ranked[0].option : options[Math.floor(random() * options.length)]
        return { type: 'playCards', revision, cardIds: best.cards.map(card => card.id), ...(best.meldId ? { meldId: best.meldId } : {}) }
    }
    const hand = [...view.hand]
    if (level.foresight) {
        const discardValue = card => cardPoints(card) - potential(card, hand) * level.foresight - (level.foresight === 3 && view.melds.some(meld => meldType([...meld.cards, card]) === meld.kind) ? 15 : 0)
        hand.sort((first, second) => discardValue(second) - discardValue(first))
    } else hand.sort((first, second) => cardPoints(second) - cardPoints(first))
    const discard = difficulty === 'beginner' ? hand[Math.floor(random() * hand.length)] : hand[0]
    return { type: 'discard', cardId: discard.id, revision }
}

module.exports = { levels, chooseAction }
