'use client'

import { useState } from 'react'
import CardSvg, { Rank, Suit } from './PlayingCards'

type Card = { id: string; rank: Rank; suit: Suit }
type TableCard = Card & { ownerId: string }
type RoundScore = { userId: string; name: string; tablePoints: number; handPoints: number; delta: number; total: number }
type RoundResult = { roundNumber: number; reason: string; scores: RoundScore[] }
export type GameState = {
    revision: number
    roundNumber: number
    status: 'playing' | 'roundOver' | 'matchOver'
    phase: 'draw' | 'play' | 'ended'
    turnUserId: string
    deckCount: number
    hand: Card[]
    stack: Card[]
    melds: { id: string; kind: 'set' | 'run'; cards: TableCard[] }[]
    players: { id: string; name: string; cards: number; score: number }[]
    result: RoundResult | null
    history: RoundResult[]
    ready: string[]
    winnerId: string | null
    lastAction: string
}

type Selection = { revision: number; cards: string[]; stack: string[]; meld: string }
const cardLabel = (card: Card) => `${card.rank} of ${card.suit}`
const signed = (score: number) => `${score > 0 ? '+' : ''}${score}`

export default function GameTable({ state, userId, disabled, onAction }: {
    state: GameState; userId: string; disabled: boolean
    onAction: (action: Record<string, unknown>) => void
}) {
    const [storedSelection, setSelection] = useState<Selection>({ revision: -1, cards: [], stack: [], meld: '' })
    const [handOrder, setHandOrder] = useState<{ round: number; ids: string[] }>({ round: -1, ids: [] })
    const [arranging, setArranging] = useState(false)
    const [arrangeCard, setArrangeCard] = useState('')
    const [orderNotice, setOrderNotice] = useState('')
    const savedIds = handOrder.round === state.roundNumber ? handOrder.ids : []
    const handById = new Map(state.hand.map(card => [card.id, card]))
    const orderedIds = [...savedIds.filter(id => handById.has(id)), ...state.hand.filter(card => !savedIds.includes(card.id)).map(card => card.id)]
    const orderedHand = orderedIds.map(id => handById.get(id)!)
    const arrangeIndex = orderedIds.indexOf(arrangeCard)
    const selection = storedSelection.revision === state.revision ? storedSelection : { revision: state.revision, cards: [], stack: [], meld: '' }
    const ownTurn = state.status === 'playing' && state.turnUserId === userId
    const locked = disabled || !ownTurn
    const drawing = state.phase === 'draw'
    const chosenStackIndex = state.stack.findIndex(card => selection.stack.includes(card.id))
    const takenCount = chosenStackIndex < 0 ? 0 : state.stack.length - chosenStackIndex
    const keptCount = takenCount - selection.stack.length
    const turnName = state.players.find(player => player.id === state.turnUserId)?.name
    const winner = state.players.find(player => player.id === state.winnerId)
    const previousRounds = state.result ? state.history.slice(0, -1) : state.history
    const act = (action: Record<string, unknown>) => onAction({ ...action, revision: state.revision })

    function selectCard(cardId: string) {
        setSelection({ ...selection, cards: selection.cards.includes(cardId) ? selection.cards.filter(id => id !== cardId) : [...selection.cards, cardId] })
    }

    function selectStackCard(cardId: string) {
        setSelection({ ...selection, stack: selection.stack.includes(cardId) ? selection.stack.filter(id => id !== cardId) : [...selection.stack, cardId] })
    }

    function moveCard(cardId: string, targetIndex: number) {
        const index = orderedIds.indexOf(cardId)
        if (index < 0 || targetIndex < 0 || targetIndex >= orderedIds.length || index === targetIndex) return
        const ids = [...orderedIds]
        ids.splice(index, 1)
        ids.splice(targetIndex, 0, cardId)
        setHandOrder({ round: state.roundNumber, ids })
        setArrangeCard(cardId)
        setOrderNotice(`${cardLabel(handById.get(cardId)!)} moved to position ${targetIndex + 1} of ${ids.length}.`)
    }

    function sortHand(by: 'rank' | 'suit') {
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
        const suits = ['clubs', 'diamonds', 'hearts', 'spades']
        const cards = [...orderedHand].sort((first, second) => {
            const rankDifference = ranks.indexOf(first.rank) - ranks.indexOf(second.rank)
            const suitDifference = suits.indexOf(first.suit) - suits.indexOf(second.suit)
            return by === 'rank' ? rankDifference || suitDifference : suitDifference || rankDifference
        })
        setHandOrder({ round: state.roundNumber, ids: cards.map(card => card.id) })
        setOrderNotice(`Hand sorted by ${by}, with aces low.`)
    }

    function play() {
        act({ type: drawing ? 'drawStack' : 'playCards', cardIds: selection.cards, ...(drawing ? { cardId: state.stack[chosenStackIndex]?.id, stackCardIds: selection.stack } : {}), ...(selection.meld ? { meldId: selection.meld } : {}) })
    }

    return (
        <div className="gameplay">
            <div className="match-scoreboard" aria-label="Match scores">
                {state.players.map(player => <div key={player.id} className={player.id === state.turnUserId && state.status === 'playing' ? 'score-player current-player' : 'score-player'}><span>{player.id === userId ? 'You' : player.name}</span><strong>{player.score}<small> / 501</small></strong><span>{player.cards} cards in hand</span></div>)}
                <span className="round-badge">Round {state.roundNumber}</span>
            </div>
            <div className="turn-banner" role="status" aria-live="polite">
                <strong>{state.status !== 'playing' ? winner ? `${winner.name} wins the match!` : `Round ${state.roundNumber} complete` : ownTurn ? drawing ? 'Your turn · Draw first' : 'Your turn · Play, then discard' : `${turnName}’s turn`}</strong>
                <span>{state.lastAction}</span>
            </div>
            {state.result && <section className="round-results" aria-label="Round results">
                <h3>{winner ? 'A winning hand. A great match.' : 'The round, counted.'}</h3>
                <div className="score-table-wrap"><table className="score-table"><thead><tr><th>Player</th><th>Table +</th><th>Hand −</th><th>Round</th><th>Total</th></tr></thead><tbody>{state.result.scores.map(score => <tr key={score.userId}><th>{score.userId === userId ? 'You' : score.name}</th><td>{score.tablePoints}</td><td>{score.handPoints}</td><td>{signed(score.delta)}</td><td><strong>{score.total}</strong></td></tr>)}</tbody></table></div>
                {state.status === 'roundOver' ? <div className="next-round-row"><button className="button button-primary" disabled={disabled || state.ready.includes(userId)} onClick={() => act({ type: 'nextRound' })}>{state.ready.includes(userId) ? 'Waiting for the other player…' : 'Ready for the next round ↗'}</button><p>{state.ready.length}/2 players ready. {state.players.every(player => player.score >= 501) ? 'Scores are tied—another round decides it.' : 'First to 501, with the higher score, wins.'}</p></div> : <p className="section-copy">The match is complete. Leave the table to find your next opponent.</p>}
            </section>}

            <div className="draw-area">
                <section className="draw-deck-area"><h3>The deck</h3><button className="deck-button" disabled={locked || !drawing || !state.deckCount} onClick={() => act({ type: 'drawDeck' })} aria-label={`Draw one card from the deck, ${state.deckCount} remaining`}><span aria-hidden="true">♠</span><strong>{state.deckCount}</strong><small>cards left</small></button><p>Draw one to your hand.</p></section>
                <section className="draw-stack-area"><div className="felt-heading"><h3>The stack</h3><span>Newest → oldest</span></div><div className="card-row interactive-stack">{state.stack.slice().reverse().map(card => <button key={card.id} className={`selectable-card stack-choice ${selection.stack.includes(card.id) ? 'card-selected' : chosenStackIndex >= 0 && state.stack.findIndex(item => item.id === card.id) >= chosenStackIndex ? 'card-to-hand' : ''}`} aria-pressed={selection.stack.includes(card.id)} aria-label={`Select ${cardLabel(card)} to play from the stack`} disabled={locked || !drawing} onClick={() => selectStackCard(card.id)}><CardSvg rank={card.rank} suit={card.suit} /></button>)}</div>{!state.stack.length && <p className="stack-help">The stack is empty.</p>}<p className="stack-help">{takenCount ? `${takenCount} cards will be picked up: ${selection.stack.length} selected stack card${selection.stack.length === 1 ? '' : 's'} will be played with your hand cards; ${keptCount} unselected card${keptCount === 1 ? '' : 's'} will go into your hand.` : 'Select all stack cards you want to play together, plus at least one card from your hand. The oldest selected card starts the pickup.'}</p></section>
            </div>
            {ownTurn && drawing && !state.deckCount && <div className="empty-deck-prompt"><p>The deck is empty. You may make a valid stack pickup or choose to end the round now.</p><button className="button button-secondary" disabled={disabled} onClick={() => act({ type: 'endRound' })}>End round and score</button></div>}

            <section className="table-felt meld-table" aria-label="Sets and runs on the table"><div className="felt-heading"><h3>On the table</h3><span>Each card scores for the player who placed it</span></div>{!state.melds.length && <p className="empty-melds">An open table. Make the first set or run.</p>}<div className="meld-grid">{state.melds.map((meld, index) => <div key={meld.id} className={`meld ${selection.meld === meld.id ? 'meld-selected' : ''}`}><div className="meld-heading"><span>{meld.kind === 'set' ? 'Set' : 'Run'} {index + 1}</span><button className="meld-target" disabled={locked} aria-pressed={selection.meld === meld.id} onClick={() => setSelection({ ...selection, meld: selection.meld === meld.id ? '' : meld.id })}>{selection.meld === meld.id ? 'Selected ✓' : 'Add cards here'}</button></div><div className="meld-cards">{meld.cards.map(card => <div key={card.id} className="owned-card" title={`${cardLabel(card)} · Placed by ${state.players.find(player => player.id === card.ownerId)?.name}`}><CardSvg rank={card.rank} suit={card.suit} /><span className={card.ownerId === userId ? 'owner-you' : 'owner-opponent'}>{card.ownerId === userId ? 'You' : state.players.find(player => player.id === card.ownerId)?.name}</span></div>)}</div></div>)}</div></section>

            <section aria-label="Your hand">
                <div className="hand-heading"><h3>Your hand</h3><span>{state.hand.length} cards · Only you can see these</span></div>
                <div className="hand-arrange-toolbar">
                    <button type="button" className="button button-secondary button-small" aria-pressed={arranging} onClick={() => { setArranging(!arranging); setOrderNotice('') }}>{arranging ? 'Done arranging ✓' : 'Arrange hand'}</button>
                    <button type="button" className="text-button" disabled={state.hand.length < 2} onClick={() => sortHand('rank')}>Sort by rank</button>
                    <button type="button" className="text-button" disabled={state.hand.length < 2} onClick={() => sortHand('suit')}>Sort by suit</button>
                    {arranging && <div className="hand-move-buttons">
                        <button type="button" className="button button-secondary button-small" disabled={arrangeIndex <= 0} onClick={() => moveCard(arrangeCard, arrangeIndex - 1)}>← Move left</button>
                        <button type="button" className="button button-secondary button-small" disabled={arrangeIndex < 0 || arrangeIndex >= orderedIds.length - 1} onClick={() => moveCard(arrangeCard, arrangeIndex + 1)}>Move right →</button>
                    </div>}
                </div>
                {arranging && <p className="arrange-help" id="arrange-help">Drag a card onto another position, or tap a card and use the move buttons. Keyboard: focus a card and press Alt + Left/Right. You can arrange even while waiting for your turn.</p>}
                <div className={`card-row hand-row selectable-hand ${arranging ? 'arranging-hand' : ''}`}>
                    {orderedHand.map((card, index) => <button key={card.id}
                        className={`selectable-card hand-card ${(arranging ? arrangeCard === card.id : selection.cards.includes(card.id)) ? 'card-selected' : ''}`}
                        aria-pressed={arranging ? arrangeCard === card.id : selection.cards.includes(card.id)}
                        aria-label={`${arranging ? 'Arrange' : 'Select'} ${cardLabel(card)}${arranging ? `, position ${index + 1} of ${orderedHand.length}` : ''}`}
                        aria-describedby={arranging ? 'arrange-help' : undefined}
                        disabled={!arranging && locked}
                        draggable={arranging}
                        onClick={() => arranging ? setArrangeCard(card.id) : selectCard(card.id)}
                        onDragStart={event => { event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; setArrangeCard(card.id) }}
                        onDragOver={event => { if (arranging) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
                        onDrop={event => { if (arranging) { event.preventDefault(); moveCard(event.dataTransfer.getData('text/plain'), index) } }}
                        onKeyDown={event => { if (arranging && event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); moveCard(card.id, index + (event.key === 'ArrowLeft' ? -1 : 1)) } }}>
                        <CardSvg rank={card.rank} suit={card.suit} />
                    </button>)}
                </div>
                <p className="sr-only" role="status" aria-live="polite">{orderNotice}</p>
            </section>
            {state.status === 'playing' && <section className="game-controls" aria-label="Turn actions"><div className="selection-summary"><strong>{selection.cards.length} hand + {selection.stack.length} stack cards selected</strong><button className="text-button" disabled={locked || (!selection.cards.length && !selection.stack.length && !selection.meld)} onClick={() => setSelection({ revision: state.revision, cards: [], stack: [], meld: '' })}>Clear selection</button></div><label className="meld-destination">Play to<select value={selection.meld} disabled={locked} onChange={event => setSelection({ ...selection, meld: event.target.value })}><option value="">A new set or run</option>{state.melds.map((meld, index) => <option key={meld.id} value={meld.id}>{meld.kind === 'set' ? 'Set' : 'Run'} {index + 1}: {meld.cards.map(card => card.rank).join('–')} ({meld.cards[0].suit}{meld.kind === 'set' ? ' & other suits' : ''})</option>)}</select></label><div className="button-row"><button className="button button-primary" disabled={locked || !selection.cards.length || (drawing && !selection.stack.length)} onClick={play}>{drawing ? 'Take stack & play' : selection.meld ? 'Add selected cards' : 'Play selected cards'}</button><button className="button button-secondary" disabled={locked || drawing || selection.cards.length !== 1} onClick={() => act({ type: 'discard', cardId: selection.cards[0] })}>Discard & end turn</button></div><p className="section-copy">{!ownTurn ? 'You can select and play cards when your turn begins.' : drawing ? 'Select stack cards and at least one hand card for a single set or run, or draw from the deck. New groups need 3 or more cards—not multiples of 3. To extend a group, choose “Add cards here”.' : 'Play a set of 3 or 4, a run of any length from 3 upwards, or add 1 or more cards to an existing group. Play separate groups one at a time, then discard. Playing your last card ends the round.'}</p></section>}

            <details className="game-rules"><summary>Huntarish rules & scoring</summary><ul><li>Sets: 3 or 4 of one rank. Runs: 3 or more consecutive cards of one suit. Aces can be low (A–2–3) or high (Q–K–A), never K–A–2.</li><li>Start by drawing one deck card, or select stack cards to play immediately with at least one card already in your hand. The oldest selected card starts the pickup; all newer unselected cards go into your hand.</li><li>Add to either player’s sets or runs. Points belong to whoever placed each individual card.</li><li>Finish your turn by discarding one card, unless playing your cards emptied your hand and ended the round.</li><li>At the start of a turn with an empty deck, choose a valid stack pickup or end the round.</li><li>Aces: 15. J, Q, K: 10. Numbered cards: face value. At round end, your table cards are positive and your hand is negative.</li><li>After a round, reaching 501 or more wins if you have the higher total. A tie continues. Both players choose ready to deal the next round; the starting player alternates.</li><li>One standard deck, 11 cards per player, no jokers.</li></ul></details>
            {previousRounds.length > 0 && <details className="game-rules"><summary>Previous round scores</summary>{previousRounds.map(result => <div key={result.roundNumber} className="history-round"><strong>Round {result.roundNumber}</strong><p>{result.scores.map(score => `${score.name}: ${signed(score.delta)} (${score.total} total)`).join(' · ')}</p></div>)}</details>}
        </div>
    )
}
