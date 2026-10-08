'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import GameTable from '../components/GameTable'
import { createPractice, playPartner, playPractice, tutorialSteps } from '@/lib/tutorial'

const handTargets = [
    [], ['K-clubs', 'K-diamonds', 'K-hearts', 'K-spades'], ['A-hearts', '2-hearts', '3-hearts', '4-hearts'],
    ['9-clubs'], ['10-clubs', '10-spades'], ['9-clubs'], ['5-diamonds'], ['7-spades'],
]

export default function Tutorial() {
    const [practice, setPractice] = useState(createPractice)
    const [attempt, setAttempt] = useState(0)
    const [feedback, setFeedback] = useState('')
    const heading = useRef<HTMLHeadingElement>(null)
    const complete = practice.game.status === 'roundOver'
    const partnerTurn = !complete && practice.game.turnUserId === 'guide'
    const lesson = tutorialSteps[Math.min(practice.step, tutorialSteps.length - 1)]

    useEffect(() => {
        if (!partnerTurn) return
        const timer = window.setTimeout(() => setPractice(current => playPartner(current)), 2200)
        return () => window.clearTimeout(timer)
    }, [partnerTurn, attempt])

    useEffect(() => {
        if (!complete) return
        const timer = window.setTimeout(() => {
            heading.current?.focus({ preventScroll: true })
            heading.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
        }, 850)
        return () => window.clearTimeout(timer)
    }, [complete])

    function restart() {
        setAttempt(value => value + 1)
        setPractice(createPractice())
        setFeedback('')
        heading.current?.focus()
    }

    function act(action: Record<string, unknown>) {
        const next = playPractice(practice, action)
        if (!next) {
            setFeedback(`Try this next: ${lesson.instruction} Tap a selected card again to deselect it.`)
            return
        }
        setPractice(next)
        setFeedback('')
    }

    return <div className="island-app">
        <header className="site-header"><Link href="/" className="wordmark">huntarish.</Link><Link href="/" className="text-button">Exit tutorial</Link></header>
        <main className={`member-layout tutorial-layout ${complete ? '' : 'tutorial-in-progress'}`}>
            <section className="surface tutorial-guide" aria-labelledby="tutorial-heading">
                <p className="eyebrow">ONE GUIDED ROUND · {Math.min(practice.step + 1, tutorialSteps.length)} / {tutorialSteps.length}</p>
                <progress aria-label="Tutorial progress" value={practice.step} max={tutorialSteps.length} />
                <h1 id="tutorial-heading" ref={heading} tabIndex={-1}>{complete ? 'You’re ready for the table.' : 'Your first guided round.'}</h1>
                <p className="section-copy">Follow the speech bubble and glowing cards. This is practice only—your stats are safe.</p>
                {complete && <div className="tutorial-finish">
                    <h2>Your round, counted.</h2>
                    <p>Your kings (40), hearts (24), tens (40) and the diamonds you added (11) earned 115 points. Nothing remains in your hand to subtract. Your partner earned 9 table points but kept 71 in hand: −62 for the round.</p>
                    <p>Aces are 15, J/Q/K are 10, and 2–10 are face value. Scores accumulate across rounds. At round end, 501 or more wins if you have the higher total; a tie means another round.</p>
                    <p>Playing your final card also ends the round without a discard. When the deck is empty at the start of your turn, you may take a valid stack pickup or choose to end the round.</p>
                    <Link href="/" className="button button-primary">Find a game →</Link>
                </div>}
                <button className="text-button" onClick={restart}>{complete ? 'Replay tutorial' : 'Restart tutorial'}</button>
            </section>
            <GameTable key={attempt} state={practice.game} userId="learner" disabled={complete || partnerTurn} onAction={act}
                guide={complete ? undefined : {
                    step: practice.step,
                    title: partnerTurn ? 'Your partner’s turn' : lesson.title,
                    handIds: handTargets[practice.step],
                    stackIds: practice.step === 4 ? ['10-diamonds', '10-hearts'] : practice.step === 6 ? ['6-diamonds'] : [],
                    meldId: practice.step === 6 ? 'partner-run' : undefined,
                    action: practice.step === 0 ? 'draw' : [3, 5, 7].includes(practice.step) ? 'discard' : 'play',
                    waiting: partnerTurn, feedback, notice: practice.notice,
                }} />
        </main>
    </div>
}
