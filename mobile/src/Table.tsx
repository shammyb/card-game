import React, { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, BackHandler, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Card, GameState } from '../../src/lib/game-types'
import { Button, colors, styles } from './ui'

const symbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
type DragCard = { zone: 'deck' | 'hand' | 'stack'; cardId?: string }
type DropRect = { x: number; y: number; width: number; height: number }

function CardBack({ compact = false }: { compact?: boolean }) {
    return <View style={[tableStyles.cardBack, compact && tableStyles.cardBackCompact]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={tableStyles.cardBackInset}><Text style={tableStyles.cardBackSuit}>♠</Text></View>
    </View>
}

function PlayingCard({ card, selected, onPress, disabled }: { card: Card; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
    const red = ['hearts', 'diamonds'].includes(card.suit)
    return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${card.rank} of ${card.suit}`} accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={!onPress || disabled} onPress={onPress} style={[tableStyles.card, selected && tableStyles.cardSelected]}>
        <Text style={[tableStyles.cardRank, red && tableStyles.redSuit]}>{card.rank}</Text>
        <Text style={[tableStyles.cardSuit, red && tableStyles.redSuit]}>{symbols[card.suit]}</Text>
    </Pressable>
}

function Draggable({ payload, disabled, children, onStart, onMove, onDrop, onCancel }: {
    payload: DragCard
    disabled?: boolean
    children: ReactNode
    onStart: (payload: DragCard, x: number, y: number) => void
    onMove: (x: number, y: number) => void
    onDrop: (payload: DragCard, x: number, y: number) => void
    onCancel: () => void
}) {
    const latest = useRef({ payload, disabled, onStart, onMove, onDrop, onCancel })
    latest.current = { payload, disabled, onStart, onMove, onDrop, onCancel }
    const [dragging, setDragging] = useState(false)
    const responder = useRef(PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) => !latest.current.disabled && Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,
        onPanResponderGrant: (_, gesture) => {
            setDragging(true)
            latest.current.onStart(latest.current.payload, gesture.moveX, gesture.moveY)
        },
        onPanResponderMove: (_, gesture) => latest.current.onMove(gesture.moveX, gesture.moveY),
        onPanResponderRelease: (_, gesture) => {
            setDragging(false)
            latest.current.onDrop(latest.current.payload, gesture.moveX, gesture.moveY)
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => { setDragging(false); latest.current.onCancel() },
    })).current
    return <View {...responder.panHandlers} style={dragging ? { opacity: .3 } : undefined}>{children}</View>
}

export default function Table({ game, userId, disabled, onAction }: { game: GameState; userId: string; disabled: boolean; onAction: (action: Record<string, unknown>) => void }) {
    const [selection, setSelection] = useState<{ revision: number; hand: string[]; stack: string[]; meld: string }>({ revision: -1, hand: [], stack: [], meld: '' })
    const [sort, setSort] = useState<'dealt' | 'rank' | 'suit'>('dealt')
    const [tableVisible, setTableVisible] = useState(false)
    const [pointsVisible, setPointsVisible] = useState(false)
    const [dragOver, setDragOver] = useState('')
    const [dropNotice, setDropNotice] = useState('')
    const [dragPreview, setDragPreview] = useState<{ payload: DragCard; x: number; y: number } | null>(null)
    const root = useRef<View>(null)
    const rootOrigin = useRef({ x: 0, y: 0 })
    const dragRevision = useRef(-1)
    const drawerSlide = useRef(new Animated.Value(440)).current
    const dropRefs = useRef<Record<string, View | null>>({})
    const dropRects = useRef<Record<string, DropRect>>({})
    const opponentPulse = useRef(new Animated.Value(0)).current
    useEffect(() => { setSort('dealt') }, [game.roundNumber])

    const chosen = selection.revision === game.revision ? selection : { revision: game.revision, hand: [], stack: [], meld: '' }
    const locked = disabled || game.turnUserId !== userId || game.status !== 'playing'
    const drawing = game.phase === 'draw'
    const opponent = game.players.find(player => player.id !== userId)
    const opponentAction = !!opponent && (game.lastAction.startsWith(`${opponent.name} `) || game.lastAction.startsWith(`${opponent.name}’`))
    const toggle = (zone: 'hand' | 'stack', id: string) => setSelection({ ...chosen, [zone]: chosen[zone].includes(id) ? chosen[zone].filter(value => value !== id) : [...chosen[zone], id] })
    const act = (action: Record<string, unknown>) => onAction({ ...action, revision: game.revision })
    const oldest = game.stack.findIndex(card => chosen.stack.includes(card.id))
    const handById = new Map(game.hand.map(card => [card.id, card]))
    const hand = [...game.hand].sort((first, second) => sort === 'dealt' ? 0 : sort === 'rank' ? ranks.indexOf(first.rank) - ranks.indexOf(second.rank) || first.suit.localeCompare(second.suit) : first.suit.localeCompare(second.suit) || ranks.indexOf(first.rank) - ranks.indexOf(second.rank))

    useEffect(() => {
        if (!opponentAction) return
        opponentPulse.setValue(1)
        Animated.timing(opponentPulse, { toValue: 0, duration: 1100, useNativeDriver: true }).start()
    }, [game.revision, opponentAction, opponentPulse])

    useEffect(() => { setDropNotice(''); setDragPreview(null); setDragOver('') }, [game.revision])
    useEffect(() => {
        Animated.timing(drawerSlide, { toValue: tableVisible ? 0 : 440, duration: 220, useNativeDriver: true }).start(() => measureDropZones())
        if (!tableVisible) return
        const back = BackHandler.addEventListener('hardwareBackPress', () => { setTableVisible(false); return true })
        return () => back.remove()
    }, [tableVisible, drawerSlide])

    useEffect(() => {
        if (dragOver !== 'table' || tableVisible || !dragPreview) return
        const timer = setTimeout(() => setTableVisible(true), 600)
        return () => clearTimeout(timer)
    }, [dragOver, tableVisible, !!dragPreview])

    function measureDropZones() {
        dropRects.current = {}
        root.current?.measureInWindow((x, y) => { rootOrigin.current = { x, y } })
        Object.entries(dropRefs.current).forEach(([name, node]) => node?.measureInWindow((x, y, width, height) => {
            dropRects.current[name] = { x, y, width, height }
        }))
    }

    function targetAt(x: number, y: number) {
        return Object.entries(dropRects.current).filter(([name]) => tableVisible ? name === 'new-meld' || name.startsWith('meld:') : name === 'hand' || name === 'discard' || name === 'table').find(([, rect]) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)?.[0] ?? ''
    }

    function selectionWith(payload: DragCard, meld = chosen.meld) {
        const nextHand = payload.zone === 'hand' && payload.cardId && !chosen.hand.includes(payload.cardId) ? [...chosen.hand, payload.cardId] : chosen.hand
        const nextStack = payload.zone === 'stack' && payload.cardId && !chosen.stack.includes(payload.cardId) ? [...chosen.stack, payload.cardId] : chosen.stack
        return { revision: game.revision, hand: nextHand, stack: nextStack, meld }
    }

    function dropOnTable(payload: DragCard, meld = chosen.meld) {
        if (locked || payload.zone === 'deck') return
        const next = selectionWith(payload, meld)
        setSelection(next)
        if (drawing) {
            const pickupIndex = game.stack.findIndex(card => next.stack.includes(card.id))
            const enough = next.meld ? next.hand.length > 0 : next.hand.length + next.stack.length >= 3
            if (pickupIndex < 0 || !next.hand.length || !enough) {
                setDropNotice(next.meld ? 'Select a hand card and a stack card, then drag either card onto the Table tab.' : 'Select a complete set or run, then drag one selected card onto the Table tab.')
                return
            }
            setDropNotice('Playing your stack pickup…')
            act({ type: 'drawStack', cardId: game.stack[pickupIndex].id, cardIds: next.hand, stackCardIds: next.stack, ...(next.meld ? { meldId: next.meld } : {}) })
            return
        }
        const minimum = next.meld ? 1 : 3
        if (next.hand.length < minimum) {
            setDropNotice(next.meld ? 'Select every card you want to add, then drag one onto the Table tab.' : 'Select at least three cards, then drag one onto the Table tab.')
            return
        }
        setDropNotice(next.meld ? 'Adding cards to the selected group…' : 'Playing a new set or run…')
        act({ type: 'playCards', cardIds: next.hand, ...(next.meld ? { meldId: next.meld } : {}) })
    }

    function finishDrop(payload: DragCard, x: number, y: number) {
        const target = targetAt(x, y)
        setDragOver('')
        setDragPreview(null)
        if (locked || dragRevision.current !== game.revision) return
        if (payload.zone === 'hand' && !game.hand.some(card => card.id === payload.cardId)) return
        if (payload.zone === 'stack' && (!drawing || !game.stack.some(card => card.id === payload.cardId))) return
        if (target === 'hand' && payload.zone === 'deck') {
            if (!locked && drawing && game.deckCount) { setDropNotice('Drawing from the deck…'); act({ type: 'drawDeck' }) }
            return
        }
        if (target === 'discard' && payload.zone === 'hand' && payload.cardId) {
            if (!locked && !drawing) { setDropNotice(`Discarding ${handById.get(payload.cardId)?.rank}…`); act({ type: 'discard', cardId: payload.cardId }) }
            else if (!locked) setDropNotice('Draw first, then drag a hand card onto the stack to discard it.')
            return
        }
        if (target === 'table') dropOnTable(payload)
        if (target.startsWith('meld:')) dropOnTable(payload, target.slice(5))
        if (target === 'new-meld') dropOnTable(payload, '')
    }

    function updateDragTarget(x: number, y: number) {
        setDragOver(targetAt(x, y))
        setDragPreview(current => current ? { ...current, x, y } : null)
    }

    const dragProps = {
        onStart: (payload: DragCard, x: number, y: number) => { dragRevision.current = game.revision; measureDropZones(); setDragPreview({ payload, x, y }) },
        onMove: updateDragTarget,
        onDrop: finishDrop,
        onCancel: () => { setDragPreview(null); setDragOver('') },
    }
    const previewCard = dragPreview && [...game.hand, ...game.stack].find(card => card.id === dragPreview.payload.cardId)
    const pulseScale = opponentPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] })
    return <View ref={root} style={tableStyles.board} collapsable={false}>
        <View style={tableStyles.watch}>
            <View style={tableStyles.panelHeading}><Text style={styles.small}>Round {game.roundNumber} · 501 to win</Text><Pressable accessibilityRole="button" accessibilityState={{ expanded: pointsVisible }} onPress={() => setPointsVisible(!pointsVisible)} style={{ padding: 12 }}><Text style={styles.small}>{pointsVisible ? 'Hide points' : 'Show points'}</Text></Pressable></View>
            {pointsVisible && <Text style={styles.small}>{game.players.map(player => `${player.name}: ${player.score}`).join(' · ')}</Text>}
            {opponent && <Animated.View style={[tableStyles.opponentHand, { transform: [{ scale: pulseScale }] }]} accessibilityLabel={`${opponent.name}'s hand, ${opponent.cards} hidden cards`}>
                <Text style={styles.small}>{opponent.name} · {opponent.cards} cards</Text>
                <ScrollView horizontal scrollEnabled={!dragPreview} showsHorizontalScrollIndicator={false} contentContainerStyle={tableStyles.cardBackRow}>{Array.from({ length: opponent.cards }, (_, index) => <View key={index} style={index ? tableStyles.cardBackOverlap : undefined}><CardBack compact /></View>)}</ScrollView>
            </Animated.View>}
            <Text accessibilityLiveRegion="polite" style={[styles.small, opponentAction && tableStyles.opponentAction]}>{game.lastAction}</Text>
        {game.status === 'playing' && <View style={tableStyles.piles}>
            <Draggable payload={{ zone: 'deck' }} disabled={locked || !drawing || !game.deckCount} {...dragProps}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Draw from deck, ${game.deckCount} cards left`} disabled={locked || !drawing || !game.deckCount} onPress={() => act({ type: 'drawDeck' })} style={tableStyles.deckWrap}>
                    <CardBack />
                    <View style={tableStyles.deckCount}><Text style={tableStyles.deckCountNumber}>{game.deckCount}</Text><Text style={tableStyles.deckCountLabel}>cards left</Text></View>
                </Pressable>
            </Draggable>
            <View ref={node => { dropRefs.current.discard = node }} collapsable={false} style={[tableStyles.dropZone, { flex: 1, minWidth: 0 }, dragOver === 'discard' && tableStyles.dropZoneActive]}>
                <Text style={styles.small}>Stack · oldest → newest</Text>
                <ScrollView horizontal scrollEnabled={!dragPreview} showsHorizontalScrollIndicator={false} contentContainerStyle={tableStyles.cardRow}>
                    {game.stack.map(card => <Draggable key={card.id} payload={{ zone: 'stack', cardId: card.id }} disabled={locked || !drawing} {...dragProps}><PlayingCard card={card} disabled={locked || !drawing} selected={chosen.stack.includes(card.id)} onPress={() => toggle('stack', card.id)} /></Draggable>)}
                    {!game.stack.length && <View style={tableStyles.emptyStack}><CardBack /><Text style={tableStyles.emptyStackText}>Stack empty</Text></View>}
                </ScrollView>
            </View>
            {drawing && !game.deckCount && <Button title="End round and score" disabled={locked} onPress={() => act({ type: 'endRound' })} />}
        </View>}
        </View>

        <Pressable ref={node => { dropRefs.current.table = node }} collapsable={false} accessibilityRole="button" accessibilityLabel={`Open table drawer, ${game.melds.length} groups`} onPress={() => setTableVisible(true)} style={[tableStyles.tableTab, dragOver === 'table' && tableStyles.dropZoneActive]}>
            <Text style={tableStyles.tableTabTitle}>Table</Text><Text style={tableStyles.tableTabCopy}>{game.melds.length}</Text><Text style={tableStyles.tableTabArrow}>‹</Text>
        </Pressable>

        <View pointerEvents={tableVisible ? 'auto' : 'none'} accessibilityElementsHidden={!tableVisible} importantForAccessibility={tableVisible ? 'auto' : 'no-hide-descendants'} style={tableStyles.drawerLayer}>
                {tableVisible && <Pressable accessibilityRole="button" accessibilityLabel="Close table drawer" style={tableStyles.drawerBackdrop} onPress={() => setTableVisible(false)} />}
                <Animated.View style={[tableStyles.tableDrawer, { transform: [{ translateX: drawerSlide }] }]}>
                    <View style={tableStyles.panelHeading}><Text style={styles.heading}>On the table</Text><Button title="Close ›" onPress={() => setTableVisible(false)} /></View>
                    <Text style={styles.small}>Drop onto a group to add cards. Hold a dragged card over the Table tab to open this drawer. You can also tap a destination, then use Play.</Text>
                    <View ref={node => { dropRefs.current['new-meld'] = node }} collapsable={false} style={dragOver === 'new-meld' ? tableStyles.dropZoneActive : undefined}><Button title="New set or run" disabled={locked} selected={!chosen.meld} onPress={() => { setSelection({ ...chosen, meld: '' }); setTableVisible(false) }} /></View>
                    {!game.melds.length && <Text style={tableStyles.emptyTable}>An open table. New sets and runs need at least three cards.</Text>}
                    <ScrollView scrollEnabled={!dragPreview} onScroll={measureDropZones} scrollEventThrottle={80} contentContainerStyle={tableStyles.drawerContent}>
                        {game.melds.map((meld, index) => <View key={meld.id} ref={node => { dropRefs.current[`meld:${meld.id}`] = node }} collapsable={false} style={[tableStyles.meld, dragOver === `meld:${meld.id}` && tableStyles.dropZoneActive]}>
                            <Button title={`Add to ${meld.kind} ${index + 1}`} selected={chosen.meld === meld.id} disabled={locked} onPress={() => { setSelection({ ...chosen, meld: meld.id }); setTableVisible(false) }} />
                            <ScrollView horizontal scrollEnabled={!dragPreview} showsHorizontalScrollIndicator={false} contentContainerStyle={tableStyles.cardRow}>{meld.cards.map(card => <View key={card.id}><PlayingCard card={card} /><Text style={tableStyles.ownerLabel}>{card.ownerId === userId ? 'You' : 'Opponent'}</Text></View>)}</ScrollView>
                        </View>)}
                        <Button title={drawing ? 'Take stack & play' : 'Play selected cards'} disabled={locked || !chosen.hand.length || (drawing && oldest < 0)} onPress={() => { dropOnTable({ zone: 'hand', cardId: chosen.hand[0] }); setTableVisible(false) }} />
                    </ScrollView>
                </Animated.View>
        </View>

        <ScrollView scrollEnabled={!dragPreview} contentContainerStyle={tableStyles.handContent}>
        {dropNotice ? <Text accessibilityLiveRegion="polite" style={tableStyles.dropNotice}>{dropNotice}</Text> : null}

        <View ref={node => { dropRefs.current.hand = node }} collapsable={false} style={[styles.panel, dragOver === 'hand' && tableStyles.dropZoneActive]}>
            <Text style={styles.heading}>{locked ? 'Your hand · waiting' : drawing ? 'Your turn · draw first' : 'Your turn · play, then discard'}</Text>
            <View style={styles.row}>{(['dealt', 'rank', 'suit'] as const).map(value => <Button key={value} title={value} selected={sort === value} onPress={() => setSort(value)} />)}</View>
            <ScrollView horizontal scrollEnabled={!dragPreview} showsHorizontalScrollIndicator={false} contentContainerStyle={tableStyles.cardRow}>{hand.map(card => <Draggable key={card.id} payload={{ zone: 'hand', cardId: card.id }} disabled={locked} {...dragProps}><PlayingCard card={card} disabled={locked} selected={chosen.hand.includes(card.id)} onPress={() => toggle('hand', card.id)} /></Draggable>)}</ScrollView>
            <Text style={styles.small}>Swipe sideways to browse. Drag cards vertically to the Table tab or stack.</Text>
            <Text style={styles.small}>{chosen.hand.length} hand + {chosen.stack.length} stack selected{oldest >= 0 ? ` · Take ${game.stack.length - oldest}, keep ${game.stack.length - oldest - chosen.stack.length}` : ''}{chosen.meld ? ` · Add to group ${game.melds.findIndex(meld => meld.id === chosen.meld) + 1}` : ' · New group'}</Text>
            {game.status === 'playing' && <>
                <Button title="Clear selection" onPress={() => setSelection({ revision: game.revision, hand: [], stack: [], meld: '' })} />
                <Button title={drawing ? 'Take stack & play' : 'Play selected cards'} disabled={locked || !chosen.hand.length || (drawing && oldest < 0)} onPress={() => act({ type: drawing ? 'drawStack' : 'playCards', cardIds: chosen.hand, ...(drawing ? { cardId: game.stack[oldest]?.id, stackCardIds: chosen.stack } : {}), ...(chosen.meld ? { meldId: chosen.meld } : {}) })} />
                <Button title="Discard & end turn" disabled={locked || drawing || chosen.hand.length !== 1} onPress={() => act({ type: 'discard', cardId: chosen.hand[0] })} />
            </>}
        </View>
        {game.result && <View style={styles.panel}><Text style={styles.heading}>{game.status === 'matchOver' ? `${game.players.find(player => player.id === game.winnerId)?.name} wins!` : 'Round finished'}</Text><Text style={styles.text}>{game.result.reason}</Text>{game.result.scores.map(score => <Text key={score.userId} style={styles.text}>{score.name}: +{score.tablePoints} table −{score.handPoints} hand = {score.delta}. Total {score.total}</Text>)}{game.status === 'roundOver' && userId !== 'learner' && <Button title={game.ready.includes(userId) ? 'Waiting for opponent…' : 'Ready for next round'} disabled={disabled || game.ready.includes(userId)} onPress={() => act({ type: 'nextRound' })} />}</View>}
        </ScrollView>
        {dragPreview && <View pointerEvents="none" style={[tableStyles.dragGhost, { left: dragPreview.x - rootOrigin.current.x - 33, top: dragPreview.y - rootOrigin.current.y - 47 }]}>{dragPreview.payload.zone === 'deck' ? <CardBack /> : previewCard ? <PlayingCard card={previewCard} /> : null}</View>}
    </View>
}

const tableStyles = StyleSheet.create({
    board: { flex: 1, position: 'relative' },
    watch: { padding: 10, gap: 5, backgroundColor: '#edf1e5', borderBottomWidth: 1, borderBottomColor: '#b7c6aa' },
    piles: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    handContent: { padding: 10, paddingRight: 42, gap: 8, paddingBottom: 24 },
    dragGhost: { position: 'absolute', zIndex: 100, elevation: 30, opacity: .9 },
    card: { width: 66, height: 94, backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#bbc4b6', padding: 6, justifyContent: 'space-between' },
    cardSelected: { borderWidth: 3, borderColor: colors.gold, transform: [{ translateY: -3 }] },
    cardRank: { color: colors.ink, fontSize: 20, fontWeight: '700' },
    cardSuit: { color: colors.ink, fontSize: 30, textAlign: 'center' },
    redSuit: { color: '#b32c32' },
    cardBack: { width: 66, height: 94, borderRadius: 8, borderWidth: 4, borderColor: '#fff3d1', padding: 4, backgroundColor: '#246554', shadowColor: '#173f3a', shadowOpacity: .18, shadowRadius: 5, elevation: 3 },
    cardBackCompact: { width: 25, height: 36, borderWidth: 2 },
    cardBackInset: { flex: 1, borderWidth: 1, borderColor: '#ffffff55', borderRadius: 4, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2f7562' },
    cardBackSuit: { color: '#ffe9ad', fontSize: 16 },
    cardBackRow: { minHeight: 38, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 2 },
    cardBackOverlap: { marginLeft: -14 },
    cardRow: { gap: 10, padding: 4, alignItems: 'flex-start' },
    panelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    opponentHand: { flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
    opponentAction: { backgroundColor: '#fff0bd', borderLeftWidth: 4, borderLeftColor: colors.gold, padding: 4, borderRadius: 8 },
    deckWrap: { alignSelf: 'flex-start', position: 'relative' },
    deckCount: { position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 5, backgroundColor: '#173f35dd', padding: 4, alignItems: 'center' },
    deckCountNumber: { color: '#fff3d1', fontWeight: '800', fontSize: 18, lineHeight: 20 },
    deckCountLabel: { color: '#fff3d1', fontSize: 9 },
    emptyStack: { position: 'relative', opacity: .55 },
    emptyStackText: { position: 'absolute', top: 36, left: 6, right: 6, color: 'white', fontWeight: '700', fontSize: 10, textAlign: 'center', backgroundColor: '#173f35cc' },
    dropZone: { borderRadius: 12, padding: 8, gap: 8 },
    dropZoneActive: { borderWidth: 3, borderColor: '#e5b647', shadowColor: '#e5b647', shadowOpacity: .5, shadowRadius: 9, elevation: 6 },
    dropNotice: { color: '#5f4c24', backgroundColor: '#fff4d5', padding: 12, borderRadius: 10, fontSize: 14 },
    tableTab: { position: 'absolute', right: 0, top: '48%', zIndex: 25, width: 42, minHeight: 104, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, padding: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#286953', elevation: 4 },
    tableTabTitle: { color: '#fff7e4', fontSize: 12, fontWeight: '800' },
    tableTabCopy: { color: '#d9e8d5', fontSize: 12, marginTop: 3 },
    tableTabArrow: { color: '#fff7e4', fontSize: 24 },
    drawerLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40, flexDirection: 'row', justifyContent: 'flex-end' },
    drawerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#173f3570' },
    tableDrawer: { width: '88%', maxWidth: 430, height: '100%', backgroundColor: '#f8f0d8', padding: 12, gap: 8, shadowColor: '#000', shadowOpacity: .25, shadowRadius: 18, elevation: 20 },
    drawerContent: { gap: 12, paddingBottom: 50 },
    meld: { gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#b7c6aa', backgroundColor: '#edf1e5' },
    emptyTable: { color: colors.muted, fontSize: 15, lineHeight: 22, fontStyle: 'italic', borderWidth: 1, borderStyle: 'dashed', borderColor: '#94a991', borderRadius: 10, padding: 18, textAlign: 'center' },
    ownerLabel: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 3 },
})
