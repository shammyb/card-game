import type { GameState } from '../app/components/GameTable'
import type { Rank, Suit } from '../app/components/PlayingCards'

const card = (rank: Rank, suit: Suit) => ({ id: `${rank}-${suit}`, rank, suit })
type Card = ReturnType<typeof card>
export type Practice = { game: GameState; deck: Card[]; partnerHand: Card[]; step: number; notice: string }
const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const kings = suits.map(suit => card('K', suit))
const run = ranks.slice(0, 4).map(rank => card(rank, 'hearts'))
const tens = [card('10', 'clubs'), card('10', 'spades')]
const stackTens = [card('10', 'diamonds'), card('10', 'hearts')]
const partnerRun = ranks.slice(1, 4).map(rank => card(rank, 'diamonds'))

export const tutorialSteps = [
    { title: 'Draw to start your turn', instruction: 'Tap the deck. You can keep a deck card without playing it immediately.', success: 'You drew the 4 of hearts. Let’s use the cards in this same hand.' },
    { title: 'Put down your four kings', instruction: 'Select all four kings, then choose “Play selected cards”. Sets can contain 3 or 4 cards—not just multiples of three.', success: 'Your kings stay on the table, worth 40 points at round end.' },
    { title: 'Now play your hearts', instruction: 'Select A, 2, 3 and 4 of hearts, then choose “Play selected cards”. Runs need at least 3 consecutive cards of one suit.', success: 'Another 24 points on your table. Aces can be low or high (Q–K–A), but never wrap around as K–A–2.' },
    { title: 'Finish your first turn', instruction: 'Select the 9 of clubs, then choose “Discard & end turn”. Your practice partner will play automatically.', success: 'You discarded the 9 of clubs. Watch your partner draw, play a run and discard.' },
    { title: 'Pick up both stack tens', instruction: 'Select both tens in the stack and both tens in your hand, then choose “Take stack & play”. The oldest selected card starts the pickup.', success: 'Four tens join your kings and hearts. The newer 7 and your discarded 9 went into your hand; the older 3 stayed in the stack.' },
    { title: 'Discard after your pickup', instruction: 'Select the 9 of clubs and discard it again. You must finish this turn before taking another stack card.', success: 'Your 9 is back on the stack. Your partner will draw and discard again.' },
    { title: 'Extend your partner’s run', instruction: 'Select the stack’s 6 of diamonds and your 5 of diamonds. Choose “Add cards here” on your partner’s 2–3–4 run, then “Take stack & play”.', success: 'Your 5 and 6 earn you 11 points; the original 2–3–4 still score for your partner. Stack pickups must use at least one card already in your hand, so you cannot add a stack card alone.' },
    { title: 'One last card', instruction: 'Discard your remaining 7 of spades to empty your hand and finish the round.', success: 'You emptied your hand! Playing your last card would also end the round immediately, without a discard.' },
]

export function createPractice(): Practice {
    const hand = [...kings, ...run.slice(0, 3), ...tens, card('5', 'diamonds'), card('9', 'clubs')]
    const stack = [card('3', 'clubs'), stackTens[0], card('7', 'spades')]
    const partnerHand = [...partnerRun, stackTens[1], card('6', 'diamonds'), card('A', 'clubs'), card('2', 'spades'), card('8', 'clubs'), card('8', 'diamonds'), card('8', 'hearts'), card('J', 'spades')]
    const firstDraws = [card('4', 'hearts'), card('Q', 'spades'), card('Q', 'clubs')]
    const used = new Set([...hand, ...stack, ...partnerHand, ...firstDraws].map(item => item.id))
    const deck = [...firstDraws, ...suits.flatMap(suit => ranks.map(rank => card(rank, suit))).filter(item => !used.has(item.id))]
    return { step: 0, notice: '', deck, partnerHand, game: {
        revision: 0, roundNumber: 1, status: 'playing', phase: 'draw', turnUserId: 'learner',
        deckCount: deck.length, hand, stack, melds: [],
        players: [{ id: 'learner', name: 'You', cards: hand.length, score: 0 }, { id: 'guide', name: 'Practice partner', cards: partnerHand.length, score: 0 }],
        result: null, history: [], ready: [], winnerId: null, lastAction: 'A guided practice round. The stack is already started; your hand has 11 cards.',
    } }
}

function sameCards(value: unknown, expected: Card[]) {
    return Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && expected.every(item => value.includes(item.id))
}

function points(cards: Card[]) {
    return cards.reduce((total, item) => total + (item.rank === 'A' ? 15 : ['J', 'Q', 'K'].includes(item.rank) ? 10 : Number(item.rank)), 0)
}

export function playPractice(practice: Practice, action: Record<string, unknown>): Practice | null {
    const { step, game } = practice
    if (game.turnUserId !== 'learner' || game.status !== 'playing' || action.revision !== game.revision) return null
    const valid = step === 0 ? action.type === 'drawDeck'
        : [3, 5, 7].includes(step) ? action.type === 'discard' && action.cardId === (step === 7 ? '7-spades' : '9-clubs')
        : step === 4 ? action.type === 'drawStack' && action.cardId === stackTens[0].id && sameCards(action.cardIds, tens) && sameCards(action.stackCardIds, stackTens) && !action.meldId
        : step === 6 ? action.type === 'drawStack' && action.cardId === '6-diamonds' && sameCards(action.cardIds, [card('5', 'diamonds')]) && sameCards(action.stackCardIds, [card('6', 'diamonds')]) && action.meldId === 'partner-run'
        : action.type === 'playCards' && !action.meldId && sameCards(action.cardIds, step === 1 ? kings : run)
    if (!valid) return null
    const next = structuredClone(practice)
    const state = next.game
    state.revision++
    state.phase = 'play'
    if (step === 0) state.hand.push(next.deck.shift()!)
    else if ([3, 5, 7].includes(step)) {
        state.stack.push(state.hand.splice(state.hand.findIndex(item => item.id === action.cardId), 1)[0])
        state.turnUserId = 'guide'
        state.phase = 'draw'
    } else {
        const ids = action.cardIds as string[]
        let played = state.hand.filter(item => ids.includes(item.id))
        state.hand = state.hand.filter(item => !ids.includes(item.id))
        if (action.type === 'drawStack') {
            const picked = state.stack.splice(state.stack.findIndex(item => item.id === action.cardId))
            const stackIds = action.stackCardIds as string[]
            played = [...played, ...picked.filter(item => stackIds.includes(item.id))]
            state.hand.push(...picked.filter(item => !stackIds.includes(item.id)))
        }
        const owned = played.map(item => ({ ...item, ownerId: 'learner' }))
        if (step === 6) state.melds.find(meld => meld.id === 'partner-run')!.cards.push(...owned)
        else state.melds.push({ id: `your-group-${step}`, kind: step === 2 ? 'run' : 'set', cards: owned })
    }
    state.deckCount = next.deck.length
    state.players[0].cards = state.hand.length
    next.notice = tutorialSteps[step].success
    state.lastAction = next.notice
    next.step++
    if (!state.hand.length) {
        state.status = 'roundOver'
        state.phase = 'ended'
        const scores = state.players.map(player => {
            const tablePoints = points(state.melds.flatMap(meld => meld.cards).filter(item => item.ownerId === player.id))
            const handPoints = points(player.id === 'learner' ? state.hand : next.partnerHand)
            player.score = tablePoints - handPoints
            return { userId: player.id, name: player.name, tablePoints, handPoints, delta: player.score, total: player.score }
        })
        state.result = { roundNumber: 1, reason: 'You emptied your hand.', scores }
        state.history = [state.result]
    }
    return next
}

export function playPartner(practice: Practice): Practice {
    if (practice.game.turnUserId !== 'guide' || practice.game.status !== 'playing') return practice
    const next = structuredClone(practice)
    const state = next.game
    next.partnerHand.push(next.deck.shift()!)
    if (next.step === 4) {
        state.melds.push({ id: 'partner-run', kind: 'run', cards: partnerRun.map(item => ({ ...item, ownerId: 'guide' })) })
        next.partnerHand = next.partnerHand.filter(item => !partnerRun.some(played => played.id === item.id))
    }
    const discard = next.step === 4 ? '10-hearts' : '6-diamonds'
    state.stack.push(next.partnerHand.splice(next.partnerHand.findIndex(item => item.id === discard), 1)[0])
    state.players[1].cards = next.partnerHand.length
    state.deckCount = next.deck.length
    state.turnUserId = 'learner'
    state.revision++
    next.notice = next.step === 4 ? 'Your partner drew, played 2–3–4 of diamonds, then discarded the 10 of hearts. Your turn again.' : 'Your partner drew and discarded the 6 of diamonds. You can use it to extend their run.'
    state.lastAction = next.notice
    return next
}
