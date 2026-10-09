import * as Deck from '@letele/playing-cards'

import type { Suit, Rank } from '@/lib/game-types'
export type { Suit, Rank } from '@/lib/game-types'

const suitMap: Record<Suit, 'C' | 'D' | 'H' | 'S'> = {
    clubs: 'C',
    diamonds: 'D',
    hearts: 'H',
    spades: 'S',
}

const rankMap: Record<Rank, 'a' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'j' | 'q' | 'k'> = {
    A: 'a',
    J: 'j',
    Q: 'q',
    K: 'k',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2',
}

export default function CardSvg({ suit, rank }: { suit: Suit; rank: Rank }) {
    const key = `${suitMap[suit]}${rankMap[rank]}` as keyof typeof Deck
    const Card = Deck[key]

    if (!Card) return <div className="aspect-[5/7] w-full rounded border bg-gray-100">?</div>

    return (
        <div className="aspect-[5/7] w-full overflow-hidden rounded shadow">
            <Card style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
    )
}
