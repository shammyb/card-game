function emptyStats() {
    return { matches: 0, wins: 0, losses: 0, rounds: 0, bestRound: null, highestScore: null, biggestWin: null }
}

function buildStats(games, userId) {
    const overall = emptyStats()
    const opponents = new Map()
    for (const game of games) {
        const state = game.state
        if (!state || !Array.isArray(state.players) || state.players.length !== 2) continue
        const player = state.players.find(member => member.id === userId)
        const opponent = state.players.find(member => member.id !== userId)
        if (!player || !opponent) continue
        if (!opponents.has(opponent.id)) opponents.set(opponent.id, { id: opponent.id, name: opponent.name, ...emptyStats() })
        const targets = [overall, opponents.get(opponent.id)]
        for (const round of game.rounds) {
            const score = round.result?.scores?.find(item => item.userId === userId)
            if (!score || !Number.isFinite(score.delta)) continue
            for (const stats of targets) {
                stats.rounds++
                stats.bestRound = stats.bestRound === null ? score.delta : Math.max(stats.bestRound, score.delta)
            }
        }
        if (state.status !== 'matchOver' || !state.players.some(member => member.id === state.winnerId)) continue
        for (const stats of targets) {
            stats.matches++
            const won = state.winnerId === userId
            stats[won ? 'wins' : 'losses']++
            stats.highestScore = stats.highestScore === null ? player.score : Math.max(stats.highestScore, player.score)
            if (won) stats.biggestWin = stats.biggestWin === null ? player.score - opponent.score : Math.max(stats.biggestWin, player.score - opponent.score)
        }
    }
    return { overall, opponents: [...opponents.values()].sort((first, second) => first.name.localeCompare(second.name) || first.id.localeCompare(second.id)) }
}

module.exports = { buildStats }
