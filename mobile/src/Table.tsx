import React, { useEffect, useState } from 'react'
import { ScrollView, Pressable, Text, View } from 'react-native'
import type { Card, GameState } from '../../src/lib/game-types'
import { Button, colors, styles } from './ui'

const symbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
function PlayingCard({ card, selected, onPress, disabled }: { card: Card; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
    return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${card.rank} of ${card.suit}`} accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={!onPress || disabled} onPress={onPress} style={{ width: 66, height: 94, backgroundColor: 'white', borderRadius: 8, borderWidth: selected ? 3 : 1, borderColor: selected ? colors.gold : '#bbc4b6', padding: 6, justifyContent: 'space-between' }}>
        <Text style={{ color: ['hearts', 'diamonds'].includes(card.suit) ? '#b32c32' : '#173f3a', fontSize: 20, fontWeight: '700' }}>{card.rank}</Text>
        <Text style={{ color: ['hearts', 'diamonds'].includes(card.suit) ? '#b32c32' : '#173f3a', fontSize: 30, textAlign: 'center' }}>{symbols[card.suit]}</Text>
    </Pressable>
}

export default function Table({ game, userId, disabled, onAction }: { game: GameState; userId: string; disabled: boolean; onAction: (action: Record<string, unknown>) => void }) {
    const [selection, setSelection] = useState<{ revision: number; hand: string[]; stack: string[]; meld: string }>({ revision: -1, hand: [], stack: [], meld: '' })
    const [sort, setSort] = useState<'dealt' | 'rank' | 'suit'>('dealt')
    useEffect(() => { setSort('dealt') }, [game.roundNumber])
    const chosen = selection.revision === game.revision ? selection : { revision: game.revision, hand: [], stack: [], meld: '' }
    const locked = disabled || game.turnUserId !== userId || game.status !== 'playing'
    const drawing = game.phase === 'draw'
    const toggle = (zone: 'hand' | 'stack', id: string) => setSelection({ ...chosen, [zone]: chosen[zone].includes(id) ? chosen[zone].filter(value => value !== id) : [...chosen[zone], id] })
    const act = (action: Record<string, unknown>) => onAction({ ...action, revision: game.revision })
    const oldest = game.stack.findIndex(card => chosen.stack.includes(card.id))
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const hand = [...game.hand].sort((first, second) => sort === 'dealt' ? 0 : sort === 'rank' ? ranks.indexOf(first.rank) - ranks.indexOf(second.rank) || first.suit.localeCompare(second.suit) : first.suit.localeCompare(second.suit) || ranks.indexOf(first.rank) - ranks.indexOf(second.rank))
    return <>
        <View style={styles.panel}><Text style={styles.heading}>Round {game.roundNumber} · first to 501</Text>{game.players.map(player => <Text key={player.id} style={styles.text}>{player.name}: {player.score} points · {player.cards} cards{player.id === game.turnUserId && game.status === 'playing' ? ' · playing' : ''}</Text>)}<Text accessibilityLiveRegion="polite" style={styles.text}>{game.lastAction}</Text></View>
        {game.status === 'playing' && <View style={styles.panel}>
            <Button title={`Draw from deck · ${game.deckCount} left`} disabled={locked || !drawing || !game.deckCount} onPress={() => act({ type: 'drawDeck' })} />
            <Text style={styles.heading}>Stack · newest first</Text>
            <ScrollView horizontal contentContainerStyle={{ gap: 10, padding: 4 }}>{[...game.stack].reverse().map(card => <PlayingCard key={card.id} card={card} disabled={locked || !drawing} selected={chosen.stack.includes(card.id)} onPress={() => toggle('stack', card.id)} />)}</ScrollView>
            <Text style={styles.small}>{oldest >= 0 ? `Take ${game.stack.length - oldest} cards; play ${chosen.stack.length} selected, keep the others.` : 'Select multiple stack cards to play with cards in your hand.'}</Text>
            {drawing && !game.deckCount && <Button title="End round and score" disabled={locked} onPress={() => act({ type: 'endRound' })} />}
        </View>}
        <View style={styles.panel}><Text style={styles.heading}>On the table</Text>
            <Button title="Play a new set or run" disabled={locked} selected={!chosen.meld} onPress={() => setSelection({ ...chosen, meld: '' })} />
            {!game.melds.length && <Text style={styles.small}>New sets and runs need at least three cards.</Text>}
            {game.melds.map((meld, index) => <View key={meld.id} style={{ gap: 8 }}><Button title={`Add to ${meld.kind} ${index + 1}`} selected={chosen.meld === meld.id} disabled={locked} onPress={() => setSelection({ ...chosen, meld: meld.id })} /><ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{meld.cards.map(card => <View key={card.id}><PlayingCard card={card} /><Text style={styles.small}>{card.ownerId === userId ? 'You' : 'Opponent'}</Text></View>)}</ScrollView></View>)}
        </View>
        <View style={styles.panel}><Text style={styles.heading}>Your hand</Text><View style={styles.row}>{(['dealt', 'rank', 'suit'] as const).map(value => <Button key={value} title={value} selected={sort === value} onPress={() => setSort(value)} />)}</View>
            <View style={styles.row}>{hand.map(card => <PlayingCard key={card.id} card={card} disabled={locked} selected={chosen.hand.includes(card.id)} onPress={() => toggle('hand', card.id)} />)}</View>
            <Text style={styles.small}>{chosen.hand.length} hand + {chosen.stack.length} stack selected</Text>
            {game.status === 'playing' && <>
                <Button title="Clear selection" onPress={() => setSelection({ revision: game.revision, hand: [], stack: [], meld: '' })} />
                <Button title={drawing ? 'Take stack & play' : 'Play selected cards'} disabled={locked || !chosen.hand.length || (drawing && oldest < 0)} onPress={() => act({ type: drawing ? 'drawStack' : 'playCards', cardIds: chosen.hand, ...(drawing ? { cardId: game.stack[oldest]?.id, stackCardIds: chosen.stack } : {}), ...(chosen.meld ? { meldId: chosen.meld } : {}) })} />
                <Button title="Discard & end turn" disabled={locked || drawing || chosen.hand.length !== 1} onPress={() => act({ type: 'discard', cardId: chosen.hand[0] })} />
            </>}
        </View>
        {game.result && <View style={styles.panel}><Text style={styles.heading}>{game.status === 'matchOver' ? `${game.players.find(player => player.id === game.winnerId)?.name} wins!` : 'Round finished'}</Text><Text style={styles.text}>{game.result.reason}</Text>{game.result.scores.map(score => <Text key={score.userId} style={styles.text}>{score.name}: +{score.tablePoints} table −{score.handPoints} hand = {score.delta}. Total {score.total}</Text>)}{game.status === 'roundOver' && userId !== 'learner' && <Button title={game.ready.includes(userId) ? 'Waiting for opponent…' : 'Ready for next round'} disabled={disabled || game.ready.includes(userId)} onPress={() => act({ type: 'nextRound' })} />}</View>}
    </>
}
