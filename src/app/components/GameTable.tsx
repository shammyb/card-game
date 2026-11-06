'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import TutorialCoach, { TutorialGuide } from './TutorialCoach'
import useCardMotion from './useCardMotion'
import CardSvg, { CardBack } from './PlayingCards'
import type { Card, GameState } from '@/lib/game-types'
export type { GameState } from '@/lib/game-types'

type Selection = { revision: number; cards: string[]; stack: string[]; meld: string }
type DragCard = { zone: 'deck' | 'hand' | 'stack'; cardId?: string }
type PointerDrag = DragCard & { startX: number; startY: number; active: boolean; pointerId: number; revision: number }
const cardLabel = (card: Card) => `${card.rank} of ${card.suit}`
const signed = (score: number) => `${score > 0 ? '+' : ''}${score}`

export default function GameTable({ state, userId, disabled, onAction, guide }: {
    state: GameState; userId: string; disabled: boolean; guide?: TutorialGuide
    onAction: (action: Record<string, unknown>) => void
}) {
    const board = useRef<HTMLDivElement>(null)
    useCardMotion(board, state.revision)
    const [storedSelection, setSelection] = useState<Selection>({ revision: -1, cards: [], stack: [], meld: '' })
    const [handOrder, setHandOrder] = useState<{ round: number; ids: string[] }>({ round: -1, ids: [] })
    const [arranging, setArranging] = useState(false)
    const [arrangeCard, setArrangeCard] = useState('')
    const [arrangeSelection, setArrangeSelection] = useState<string[]>([])
    const [orderNotice, setOrderNotice] = useState('')
    const [tableVisible, setTableVisible] = useState(false)
    const [pointsVisible, setPointsVisible] = useState(false)
    const [dragOver, setDragOver] = useState('')
    const [dropNotice, setDropNotice] = useState('')
    const pointerDrag = useRef<PointerDrag | null>(null)
    const suppressClick = useRef(false)
    const [dragPreview, setDragPreview] = useState<{ payload: DragCard; x: number; y: number } | null>(null)
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
    const opponent = state.players.find(player => player.id !== userId)
    const opponentAction = !!opponent && (state.lastAction.startsWith(`${opponent.name} `) || state.lastAction.startsWith(`${opponent.name}’`))
    const act = (action: Record<string, unknown>) => onAction({ ...action, revision: state.revision })

    useEffect(() => {
        setDropNotice('')
    }, [state.revision])

    useEffect(() => {
        if (guide?.meldId && !guide.waiting && guide.handIds.every(id => selection.cards.includes(id)) && guide.stackIds.every(id => selection.stack.includes(id)) && selection.meld !== guide.meldId) {
            setTableVisible(true)
        }
    }, [guide, selection.cards, selection.stack, selection.meld])

    useEffect(() => {
        if (!tableVisible) return
        const drawer = board.current?.querySelector<HTMLElement>('#game-table')
        const previous = document.activeElement as HTMLElement | null
        drawer?.querySelector<HTMLButtonElement>('.table-toggle')?.focus({ preventScroll: true })
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setTableVisible(false)
            if (event.key !== 'Tab' || !drawer) return
            const controls = Array.from(drawer.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]'))
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('keydown', onKey); previous?.focus({ preventScroll: true }) }
    }, [tableVisible])

    useEffect(() => {
        if (dragOver !== 'table-tab' || tableVisible) return
        const timer = window.setTimeout(() => setTableVisible(true), 600)
        return () => window.clearTimeout(timer)
    }, [dragOver, tableVisible])

    function selectCard(cardId: string) {
        setSelection({ ...selection, cards: selection.cards.includes(cardId) ? selection.cards.filter(id => id !== cardId) : [...selection.cards, cardId] })
    }

    function selectStackCard(cardId: string) {
        setSelection({ ...selection, stack: selection.stack.includes(cardId) ? selection.stack.filter(id => id !== cardId) : [...selection.stack, cardId] })
    }

    function moveCard(cardId: string, targetIndex: number) {
        const index = orderedIds.indexOf(cardId)
        if (index < 0 || targetIndex < 0 || targetIndex >= orderedIds.length || index === targetIndex) return
        const moving = orderedIds.filter(id => id === cardId || (arrangeSelection.includes(cardId) && arrangeSelection.includes(id)))
        if (moving.includes(orderedIds[targetIndex])) return
        const ids = orderedIds.filter(id => !moving.includes(id))
        const destination = ids.indexOf(orderedIds[targetIndex]) + (targetIndex > index ? 1 : 0)
        ids.splice(destination, 0, ...moving)
        setHandOrder({ round: state.roundNumber, ids })
        setArrangeCard(cardId)
        setArrangeSelection(moving)
        setOrderNotice(`${moving.length} card${moving.length === 1 ? '' : 's'} moved together. Only your hand order changed.`)
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

    function selectionWith(payload: DragCard, meld = selection.meld) {
        const cards = payload.zone === 'hand' && payload.cardId && !selection.cards.includes(payload.cardId) ? [...selection.cards, payload.cardId] : selection.cards
        const stack = payload.zone === 'stack' && payload.cardId && !selection.stack.includes(payload.cardId) ? [...selection.stack, payload.cardId] : selection.stack
        return { revision: state.revision, cards, stack, meld }
    }

    function dropOnTable(payload: DragCard, meldId = '') {
        if (locked || arranging || payload.zone === 'deck') return
        const next = selectionWith(payload, meldId)
        setSelection(next)
        setTableVisible(true)
        if (drawing) {
            const pickupIndex = state.stack.findIndex(card => next.stack.includes(card.id))
            const enoughForDestination = meldId ? next.cards.length > 0 : next.cards.length + next.stack.length >= 3
            if (pickupIndex < 0 || !next.cards.length || !enoughForDestination) {
                setDropNotice(meldId ? 'Select at least one hand card and one stack card, then drag either one onto this group.' : 'Select a complete set or run from your hand and stack, then drag one selected card onto the table.')
                return
            }
            setDropNotice('Playing the selected stack pickup…')
            act({ type: 'drawStack', cardId: state.stack[pickupIndex].id, cardIds: next.cards, stackCardIds: next.stack, ...(meldId ? { meldId } : {}) })
            return
        }
        const minimum = meldId ? 1 : 3
        if (next.cards.length < minimum) {
            setDropNotice(meldId ? 'Select every card you want to add, then drag one of them onto this group.' : 'Select at least three cards for a new set or run, then drag one selected card onto the table.')
            return
        }
        setDropNotice(meldId ? 'Adding the selected cards to this group…' : 'Playing the selected cards as a new group…')
        act({ type: 'playCards', cardIds: next.cards, ...(meldId ? { meldId } : {}) })
    }

    function finishDrop(payload: DragCard, target: string) {
        setDragOver('')
        if (arranging) {
            if (payload.zone === 'hand' && payload.cardId && target.startsWith('arrange:')) moveCard(payload.cardId, orderedIds.indexOf(target.slice(8)))
            return
        }
        if (locked || arranging) return
        if (payload.zone === 'hand' && !handById.has(payload.cardId ?? '')) return
        if (payload.zone === 'stack' && (!drawing || !state.stack.some(card => card.id === payload.cardId))) return
        if (target === 'hand' && payload.zone === 'deck') {
            if (!locked && drawing && state.deckCount) {
                setDropNotice('Drawing a card from the deck…')
                act({ type: 'drawDeck' })
            }
            return
        }
        if (target === 'discard' && payload.zone === 'hand' && payload.cardId) {
            if (!locked && !drawing) {
                setDropNotice(`Discarding ${cardLabel(handById.get(payload.cardId)!)}…`)
                act({ type: 'discard', cardId: payload.cardId })
            } else if (!locked) setDropNotice('Draw first, then drag one hand card onto the stack to discard it.')
            return
        }
        if (target === 'new-meld') dropOnTable(payload)
        else if (target === 'table-tab') dropOnTable(payload, selection.meld)
        else if (target.startsWith('meld:')) dropOnTable(payload, target.slice(5))
    }

    function beginPointerDrag(event: ReactPointerEvent<HTMLElement>, payload: DragCard) {
        if (event.button !== 0 || (arranging ? payload.zone !== 'hand' : locked)) return
        suppressClick.current = false
        pointerDrag.current = { ...payload, startX: event.clientX, startY: event.clientY, active: false, pointerId: event.pointerId, revision: state.revision }
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    function movePointerDrag(event: ReactPointerEvent<HTMLElement>) {
        const drag = pointerDrag.current
        if (!drag || drag.pointerId !== event.pointerId) return
        if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 12) return
        drag.active = true
        suppressClick.current = true
        event.preventDefault()
        setDragPreview({ payload: drag, x: event.clientX, y: event.clientY })
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]')?.dataset.dropZone ?? ''
        setDragOver(target)
    }

    function endPointerDrag(event: ReactPointerEvent<HTMLElement>) {
        const drag = pointerDrag.current
        if (!drag || drag.pointerId !== event.pointerId) return
        pointerDrag.current = null
        setDragPreview(null)
        setDragOver('')
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (!drag.active) return
        event.preventDefault()
        if (drag.revision !== state.revision) return
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-zone]')?.dataset.dropZone ?? ''
        finishDrop(drag, target)
    }

    function clickUnlessDragged(action: () => void) {
        if (suppressClick.current) {
            suppressClick.current = false
            return
        }
        action()
    }

    function cancelPointerDrag() {
        pointerDrag.current = null
        setDragPreview(null)
        setDragOver('')
        suppressClick.current = false
    }

    return (
        <div className="gameplay" ref={board} onPointerUpCapture={endPointerDrag}>
            {guide && <TutorialCoach guide={guide} selectedHand={selection.cards} selectedStack={selection.stack} selectedMeld={selection.meld} arranging={arranging} root={board} tableVisible={tableVisible} />}
            <nav className="mobile-table-nav" aria-label="Jump around the game">
                <a href="#game-draw">Draw</a><button type="button" onClick={() => setTableVisible(true)}>Table</button><a href="#game-hand">Hand</a>
                {state.status === 'playing' && <a href="#game-actions">Play</a>}
            </nav>
            <div className="points-toolbar"><span>Round {state.roundNumber} · 501 to win</span><button type="button" aria-expanded={pointsVisible} aria-controls="match-points" onClick={() => setPointsVisible(!pointsVisible)}>{pointsVisible ? 'Hide points' : 'Show points'}</button></div>
            <div id="match-points" className="match-scoreboard" aria-label="Match scores" hidden={!pointsVisible}>
                {state.players.map(player => <div key={player.id} data-guide={player.id !== userId ? 'partner' : undefined} className={player.id === state.turnUserId && state.status === 'playing' ? 'score-player current-player' : 'score-player'}><span>{player.id === userId ? 'You' : player.name}</span><strong>{player.score}<small> / 501</small></strong><span>{player.cards} cards in hand</span></div>)}
                <span className="round-badge">Round {state.roundNumber}</span>
            </div>
            <div className="game-watch">
            {opponent && <section key={`${opponent.id}-${state.revision}`} className={`opponent-hand ${opponentAction ? 'opponent-action-pulse' : ''}`} aria-label={`${opponent.name}'s hidden hand`}>
                <div className="opponent-hand-heading"><h3>{opponent.name}’s hand</h3><span>{opponent.cards} hidden card{opponent.cards === 1 ? '' : 's'}</span></div>
                <div className="card-back-fan" aria-hidden="true">{Array.from({ length: opponent.cards }, (_, index) => <div className="opponent-card" key={index}><CardBack variant="B2" /></div>)}</div>
            </section>}
            <div key={`turn-${state.revision}`} className={`turn-banner ${opponentAction ? 'opponent-action-banner' : ''}`} role="status" aria-live="polite">
                <strong>{state.status !== 'playing' ? winner ? `${winner.name} wins the match!` : `Round ${state.roundNumber} complete` : ownTurn ? drawing ? 'Your turn · Draw first' : 'Your turn · Play, then discard' : `${turnName}’s turn`}</strong>
                <span>{state.lastAction}</span>
            </div>
            <div className="draw-area" id="game-draw">
                <section className={`draw-deck-area ${dragOver === 'hand' ? 'drop-source-active' : ''}`}><h3>The deck</h3><button data-guide="draw" className="deck-button" disabled={locked || !drawing || !state.deckCount} onClick={() => clickUnlessDragged(() => act({ type: 'drawDeck' }))} aria-label={`Draw one card from the deck, ${state.deckCount} remaining`} draggable={false} onPointerDown={event => beginPointerDrag(event, { zone: 'deck' })} onPointerMove={movePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={cancelPointerDrag}><span className="deck-card-back" aria-hidden="true"><CardBack /></span><span className="deck-count"><strong>{state.deckCount}</strong><small>cards left</small></span></button><p>Tap to draw, or drag the deck to your hand.</p></section>
                <section className={`draw-stack-area drop-zone ${dragOver === 'discard' ? 'drop-zone-active' : ''}`} data-drop-zone="discard"><div className="felt-heading"><h3>The stack</h3><span>Oldest → newest · Drop here to discard</span></div><div className="card-row interactive-stack">{state.stack.map(card => <button key={card.id} data-card-id={card.id} data-card-zone="stack" data-card-owner="guide" data-guide={`stack:${card.id}`} className={`selectable-card stack-choice ${selection.stack.includes(card.id) ? 'card-selected' : chosenStackIndex >= 0 && state.stack.findIndex(item => item.id === card.id) >= chosenStackIndex ? 'card-to-hand' : ''}`} aria-pressed={selection.stack.includes(card.id)} aria-label={`Select ${cardLabel(card)} to play from the stack`} disabled={locked || !drawing} draggable={false} onClick={() => clickUnlessDragged(() => selectStackCard(card.id))} onPointerDown={event => beginPointerDrag(event, { zone: 'stack', cardId: card.id })} onPointerMove={movePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={cancelPointerDrag}><CardSvg rank={card.rank} suit={card.suit} /></button>)}</div>{!state.stack.length && <div className="empty-card-slot"><CardBack /><span>Stack empty</span></div>}<p className="stack-help">{takenCount ? `${takenCount} cards will be picked up: ${selection.stack.length} selected stack card${selection.stack.length === 1 ? '' : 's'} will be played with your hand cards; ${keptCount} unselected card${keptCount === 1 ? '' : 's'} will go into your hand.` : 'Select stack and hand cards, then drag one selected card onto the table. After playing, drag one hand card back here to discard.'}</p></section>
            </div>
            </div>
            {state.result && <section className="round-results" aria-label="Round results">
                <h3>{winner ? 'A winning hand. A great match.' : 'The round, counted.'}</h3>
                <div className="score-table-wrap"><table className="score-table"><thead><tr><th>Player</th><th>Table +</th><th>Hand −</th><th>Round</th><th>Total</th></tr></thead><tbody>{state.result.scores.map(score => <tr key={score.userId}><th>{score.userId === userId ? 'You' : score.name}</th><td>{score.tablePoints}</td><td>{score.handPoints}</td><td>{signed(score.delta)}</td><td><strong>{score.total}</strong></td></tr>)}</tbody></table></div>
                {state.status === 'roundOver' ? <div className="next-round-row"><button className="button button-primary" disabled={disabled || state.ready.includes(userId)} onClick={() => act({ type: 'nextRound' })}>{state.ready.includes(userId) ? 'Waiting for the other player…' : 'Ready for the next round ↗'}</button><p>{state.ready.length}/2 players ready. {state.players.every(player => player.score >= 501) ? 'Scores are tied—another round decides it.' : 'First to 501, with the higher score, wins.'}</p></div> : <p className="section-copy">The match is complete. Leave the table to find your next opponent.</p>}
            </section>}

            {ownTurn && drawing && !state.deckCount && <div className="empty-deck-prompt"><p>The deck is empty. You may make a valid stack pickup or choose to end the round now.</p><button className="button button-secondary" disabled={disabled} onClick={() => act({ type: 'endRound' })}>End round and score</button></div>}

            {tableVisible && <button type="button" className="table-drawer-backdrop" aria-label="Close table" onClick={() => setTableVisible(false)} />}
            <button type="button" className={`table-drawer-tab ${opponentAction ? 'opponent-action-banner' : ''} ${tableVisible ? 'table-drawer-tab-open' : ''} ${dragOver === 'table-tab' ? 'drop-zone-active' : ''}`} data-drop-zone="table-tab" aria-expanded={tableVisible} onClick={() => setTableVisible(!tableVisible)}><span>{tableVisible ? '›' : '‹'}</span> Table</button>
            <section className={`table-felt meld-table drop-zone ${tableVisible ? 'meld-table-drawer-open' : 'meld-table-collapsed'} ${dragOver === 'new-meld' ? 'drop-zone-active' : ''}`} id="game-table" role="dialog" aria-modal={tableVisible} aria-label="Sets and runs on the table" data-drop-zone="new-meld"><div className="felt-heading table-heading"><h3>On the table</h3><div><span>{tableVisible ? 'Each card scores for the player who placed it' : `${state.melds.length} group${state.melds.length === 1 ? '' : 's'} hidden · Still accepts dropped cards`}</span><button type="button" className="table-toggle" aria-expanded={tableVisible} onClick={() => setTableVisible(!tableVisible)}>{tableVisible ? 'Hide table' : 'Show table'}</button></div></div>{tableVisible ? <>{dropNotice && <p role="status" className="drop-notice">{dropNotice}</p>}{!state.melds.length && <p className="empty-melds">An open table. Select a set or run, then drag one selected card here.</p>}<div className="meld-grid">{state.melds.map((meld, index) => <div key={meld.id} data-drop-zone={`meld:${meld.id}`} className={`meld drop-zone ${selection.meld === meld.id ? 'meld-selected' : ''} ${dragOver === `meld:${meld.id}` ? 'drop-zone-active' : ''}`}><div className="meld-heading"><span>{meld.kind === 'set' ? 'Set' : 'Run'} {index + 1}</span><button data-guide={`meld:${meld.id}`} className="meld-target" disabled={locked} aria-pressed={selection.meld === meld.id} onClick={() => { setSelection({ ...selection, meld: selection.meld === meld.id ? '' : meld.id }); setTableVisible(false) }}>{selection.meld === meld.id ? 'Selected ✓' : 'Add cards here'}</button></div><div className="meld-cards">{meld.cards.map(card => <div key={card.id} data-card-id={card.id} data-card-zone={`meld:${meld.id}`} data-card-owner={card.ownerId === userId ? 'you' : 'guide'} className="owned-card" title={`${cardLabel(card)} · Placed by ${state.players.find(player => player.id === card.ownerId)?.name}`}><CardSvg rank={card.rank} suit={card.suit} /><span className={card.ownerId === userId ? 'owner-you' : 'owner-opponent'}>{card.ownerId === userId ? 'You' : state.players.find(player => player.id === card.ownerId)?.name}</span></div>)}</div></div>)}</div></> : <button type="button" className="collapsed-table-drop" onClick={() => setTableVisible(true)}>Table hidden · Tap to show, or drop selected cards here</button>}</section>
            {dragPreview && <div className="touch-drag-preview" aria-hidden="true" style={{ left: dragPreview.x - 30, top: dragPreview.y - 45 }}>{dragPreview.payload.zone === 'deck' ? <CardBack /> : (() => { const card = [...state.hand, ...state.stack].find(item => item.id === dragPreview.payload.cardId); return card ? <CardSvg rank={card.rank} suit={card.suit} /> : null })()}</div>}
            {dropNotice && <p className="drop-notice" role="status" aria-live="polite">{dropNotice}</p>}

            <section className={`hand-drop-zone drop-zone ${dragOver === 'hand' ? 'drop-zone-active' : ''}`} aria-label="Your hand" id="game-hand" data-drop-zone="hand">
                <div className="hand-heading"><h3>Your hand</h3><span>{state.hand.length} cards · Only you can see these</span></div>
                <div className="hand-arrange-toolbar">
                    <button data-guide="arrange" type="button" className="button button-secondary button-small" aria-pressed={arranging} onClick={() => { setArranging(!arranging); setOrderNotice('') }}>{arranging ? 'Done arranging ✓' : 'Arrange hand'}</button>
                    <button type="button" className="text-button" disabled={state.hand.length < 2} onClick={() => sortHand('rank')}>Sort by rank</button>
                    <button type="button" className="text-button" disabled={state.hand.length < 2} onClick={() => sortHand('suit')}>Sort by suit</button>
                    {arranging && <div className="hand-move-buttons">
                        <button type="button" className="button button-secondary button-small" disabled={arrangeIndex <= 0} onClick={() => moveCard(arrangeCard, arrangeIndex - 1)}>← Move left</button>
                        <button type="button" className="button button-secondary button-small" disabled={arrangeIndex < 0 || arrangeIndex >= orderedIds.length - 1} onClick={() => moveCard(arrangeCard, arrangeIndex + 1)}>Move right →</button>
                    </div>}
                </div>
                {arranging && <p className="arrange-help" id="arrange-help">Tap any cards to select a group, then drag one selected card onto another card to move them together. They do not need to form a set. Only your display order changes. You can also use the move buttons or Alt + Left/Right.</p>}
                <p className="mobile-card-hint">Swipe sideways to see every card. Tap to select, or drag cards onto the table.</p>
                <div className={`card-row hand-row selectable-hand ${arranging ? 'arranging-hand' : ''}`}>
                    {orderedHand.map((card, index) => <button key={card.id} data-card-id={card.id} data-card-zone="hand" data-guide={`hand:${card.id}`}
                        className={`selectable-card hand-card ${(arranging ? arrangeSelection.includes(card.id) : selection.cards.includes(card.id)) ? 'card-selected' : ''} ${dragOver === `arrange:${card.id}` ? 'drop-zone-active' : ''}`}
                        data-drop-zone={arranging ? `arrange:${card.id}` : undefined}
                        aria-pressed={arranging ? arrangeSelection.includes(card.id) : selection.cards.includes(card.id)}
                        aria-label={`${arranging ? 'Arrange' : 'Select'} ${cardLabel(card)}${arranging ? `, position ${index + 1} of ${orderedHand.length}` : ''}`}
                        aria-describedby={arranging ? 'arrange-help' : undefined}
                        disabled={!arranging && locked}
                        draggable={false}
                        onClick={() => clickUnlessDragged(() => {
                            if (!arranging) return selectCard(card.id)
                            setArrangeCard(card.id)
                            setArrangeSelection(ids => ids.includes(card.id) ? ids.filter(id => id !== card.id) : [...ids, card.id])
                        })}
                        onDragStart={event => { if (arranging) { event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; setArrangeCard(card.id) } }}
                        onDragEnd={() => setDragOver('')}
                        onDragOver={event => { if (arranging) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }}
                        onDrop={event => { if (arranging) { event.preventDefault(); moveCard(event.dataTransfer.getData('text/plain'), index) } }}
                        onPointerDown={event => beginPointerDrag(event, { zone: 'hand', cardId: card.id })}
                        onPointerMove={movePointerDrag}
                        onPointerCancel={cancelPointerDrag}
                        onKeyDown={event => { if (arranging && event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); moveCard(card.id, index + (event.key === 'ArrowLeft' ? -1 : 1)) } }}>
                        <CardSvg rank={card.rank} suit={card.suit} />
                    </button>)}
                </div>
                <p className="sr-only" role="status" aria-live="polite">{orderNotice}</p>
            </section>
            {state.status === 'playing' && <section className="game-controls" id="game-actions" aria-label="Turn actions"><div className="selection-summary"><strong>{selection.cards.length} hand + {selection.stack.length} stack cards selected</strong><button data-guide="clear" className="text-button" disabled={arranging || locked || (!selection.cards.length && !selection.stack.length && !selection.meld)} onClick={() => setSelection({ revision: state.revision, cards: [], stack: [], meld: '' })}>Clear selection</button></div><label className="meld-destination">Play to<select value={selection.meld} disabled={locked} onChange={event => setSelection({ ...selection, meld: event.target.value })}><option value="">A new set or run</option>{state.melds.map((meld, index) => <option key={meld.id} value={meld.id}>{meld.kind === 'set' ? 'Set' : 'Run'} {index + 1}: {meld.cards.map(card => card.rank).join('–')} ({meld.cards[0].suit}{meld.kind === 'set' ? ' & other suits' : ''})</option>)}</select></label><div className="button-row"><button data-guide="play" className="button button-primary" disabled={arranging || locked || !selection.cards.length || (drawing && !selection.stack.length)} onClick={play}>{drawing ? 'Take stack & play' : selection.meld ? 'Add selected cards' : 'Play selected cards'}</button><button data-guide="discard" className="button button-secondary" disabled={arranging || locked || drawing || selection.cards.length !== 1} onClick={() => act({ type: 'discard', cardId: selection.cards[0] })}>Discard & end turn</button></div><p className="section-copy">{!ownTurn ? 'You can select and play cards when your turn begins.' : drawing ? 'Select stack cards and at least one hand card for a single set or run, or draw from the deck. New groups need 3 or more cards—not multiples of 3. To extend a group, choose “Add cards here”.' : 'Play a set of 3 or 4, a run of any length from 3 upwards, or add 1 or more cards to an existing group. Play separate groups one at a time, then discard. Playing your last card ends the round.'}</p></section>}

            <details className="game-rules"><summary>Huntarish rules & scoring</summary><ul><li>Sets: 3 or 4 of one rank. Runs: 3 or more consecutive cards of one suit. Aces can be low (A–2–3) or high (Q–K–A), never K–A–2.</li><li>Start by drawing one deck card, or select stack cards to play immediately with at least one card already in your hand. The oldest selected card starts the pickup; all newer unselected cards go into your hand.</li><li>Add to either player’s sets or runs. Points belong to whoever placed each individual card.</li><li>Finish your turn by discarding one card, unless playing your cards emptied your hand and ended the round.</li><li>At the start of a turn with an empty deck, choose a valid stack pickup or end the round.</li><li>Aces: 15. J, Q, K: 10. Numbered cards: face value. At round end, your table cards are positive and your hand is negative.</li><li>After a round, reaching 501 or more wins if you have the higher total. A tie continues. Both players choose ready to deal the next round; the starting player alternates.</li><li>One standard deck, 11 cards per player, no jokers.</li></ul></details>
            {previousRounds.length > 0 && <details className="game-rules"><summary>Previous round scores</summary>{previousRounds.map(result => <div key={result.roundNumber} className="history-round"><strong>Round {result.roundNumber}</strong><p>{result.scores.map(score => `${score.name}: ${signed(score.delta)} (${score.total} total)`).join(' · ')}</p></div>)}</details>}
        </div>
    )
}
