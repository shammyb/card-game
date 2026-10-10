export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
export type Card = { id: string; rank: Rank; suit: Suit }
type RoundScore = { userId: string; name: string; tablePoints: number; handPoints: number; delta: number; total: number }
type RoundResult = { roundNumber: number; reason: string; scores: RoundScore[] }
export type GameState = {
    computerDifficulty?: string
    revision: number
    roundNumber: number
    status: 'playing' | 'roundOver' | 'matchOver'
    phase: 'draw' | 'play' | 'ended'
    turnUserId: string
    deckCount: number
    hand: Card[]
    stack: Card[]
    melds: { id: string; kind: 'set' | 'run'; cards: (Card & { ownerId: string })[] }[]
    players: { id: string; name: string; cards: number; score: number }[]
    result: RoundResult | null
    history: RoundResult[]
    ready: string[]
    winnerId: string | null
    lastAction: string
}
