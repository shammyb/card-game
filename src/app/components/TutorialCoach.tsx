'use client'

import { RefObject, useEffect, useState } from 'react'

export type TutorialGuide = {
    step: number
    title: string
    handIds: string[]
    stackIds: string[]
    meldId?: string
    action: 'draw' | 'play' | 'discard'
    waiting: boolean
    feedback: string
    notice: string
}

export default function TutorialCoach({ guide, selectedHand, selectedStack, selectedMeld, arranging, root }: {
    guide: TutorialGuide
    selectedHand: string[]
    selectedStack: string[]
    selectedMeld: string
    arranging: boolean
    root: RefObject<HTMLDivElement | null>
}) {
    const [motion, setMotion] = useState(false)
    useEffect(() => {
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setMotion(preference.matches)
        update()
        preference.addEventListener('change', update)
        return () => preference.removeEventListener('change', update)
    }, [])
    const extra = selectedHand.some(id => !guide.handIds.includes(id)) || selectedStack.some(id => !guide.stackIds.includes(id)) || Boolean(selectedMeld && selectedMeld !== guide.meldId)
    const missingHand = guide.handIds.filter(id => !selectedHand.includes(id))
    const missingStack = guide.stackIds.filter(id => !selectedStack.includes(id))
    const targets = guide.waiting ? ['partner'] : arranging ? ['arrange'] : extra ? ['clear'] : guide.action === 'draw' ? ['draw']
        : missingHand.length ? missingHand.map(id => `hand:${id}`)
        : missingStack.length ? missingStack.map(id => `stack:${id}`)
        : guide.meldId && selectedMeld !== guide.meldId ? [`meld:${guide.meldId}`] : [guide.action]
    const targetKey = targets.join('|')
    const instruction = guide.waiting ? 'Your partner is playing. Watch for their new cards on the table and stack.'
        : arranging ? 'Choose “Done arranging” to return to selecting cards.'
        : extra ? 'Let’s clear the selection and follow the glowing cards.'
        : guide.action === 'draw' ? 'Tap the glowing deck to draw your first card.'
        : missingHand.length ? `Select the ${missingHand.length} glowing card${missingHand.length === 1 ? '' : 's'} in your hand.`
        : missingStack.length ? `Now select the ${missingStack.length} glowing card${missingStack.length === 1 ? '' : 's'} in the stack.`
        : guide.meldId && selectedMeld !== guide.meldId ? 'Tap the glowing “Add cards here” on your partner’s run.'
        : guide.action === 'discard' ? 'Tap “Discard & end turn” to move your selected card to the stack.'
        : guide.stackIds.length ? 'Tap “Take stack & play”. Selected cards go to the table; newer unselected cards go into your hand.'
        : 'Tap “Play selected cards” to put your group onto the table.'

    function showTarget() {
        const target = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-guide]') || []).find(element => element.dataset.guide === targets[0])
        target?.scrollIntoView({ behavior: motion ? 'instant' : 'smooth', block: 'center', inline: 'center' })
    }

    useEffect(() => {
        const elements = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-guide]') || [])
        const active = elements.filter(element => targetKey.split('|').includes(element.dataset.guide || ''))
        active.forEach(element => {
            element.classList.add('tutorial-glow')
            element.setAttribute('aria-describedby', 'tutorial-prompt')
        })
        const timer = window.setTimeout(() => {
            const target = active[0]
            if (!target) return
            const bounds = target.getBoundingClientRect()
            const bubble = document.getElementById('tutorial-coach')?.getBoundingClientRect()
            if (bounds.top < 30 || bounds.bottom > (bubble?.top ?? window.innerHeight) - 20 || bounds.left < 0 || bounds.right > window.innerWidth) {
                target.scrollIntoView({ behavior: motion ? 'instant' : 'smooth', block: 'center', inline: 'center' })
            }
        }, 850)
        return () => {
            window.clearTimeout(timer)
            active.forEach(element => { element.classList.remove('tutorial-glow'); element.removeAttribute('aria-describedby') })
        }
    }, [targetKey, guide.step, motion, root])

    return <aside className="tutorial-coach" id="tutorial-coach" aria-label="Tutorial guide">
        <span className="coach-avatar" aria-hidden="true">♠</span>
        <div className="coach-copy" aria-live="polite" aria-atomic="true">
            <strong>{guide.step + 1}/8 · {guide.title}</strong>
            <p id="tutorial-prompt">{instruction}</p>
            {guide.feedback && <p className="coach-error">{guide.feedback}</p>}
            {guide.notice && <details key={guide.step}><summary>What just happened?</summary><p>{guide.notice}</p></details>}
        </div>
        <button className="button button-secondary button-small" onClick={showTarget}>Show me ↑</button>
    </aside>
}
