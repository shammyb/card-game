'use client'

import { RefObject, useLayoutEffect, useRef } from 'react'

type Position = { left: number; top: number; width: number; height: number; zone: string }

export default function useCardMotion(root: RefObject<HTMLDivElement | null>, revision: number) {
    const previous = useRef(new Map<string, Position>())
    const lastRevision = useRef(revision)

    useLayoutEffect(() => {
        const board = root.current
        if (!board) return
        const position = (element: HTMLElement): Position => {
            const bounds = element.getBoundingClientRect()
            return { left: bounds.left + window.scrollX, top: bounds.top + window.scrollY, width: bounds.width, height: bounds.height, zone: element.dataset.cardZone || '' }
        }
        const cards = Array.from(board.querySelectorAll<HTMLElement>('[data-card-id]'))
        const cleanups: (() => void)[] = []
        if (lastRevision.current !== revision && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            cards.forEach((element, index) => {
                const destination = position(element)
                const old = previous.current.get(element.dataset.cardId!)
                if (old?.zone === destination.zone) return
                const sourceElement = board.querySelector<HTMLElement>(element.dataset.cardOwner === 'guide' ? '[data-guide="partner"]' : '[data-guide="draw"]')
                const source = old || (sourceElement ? position(sourceElement) : destination)
                if (!destination.width || !source.width) return
                const clone = element.cloneNode(true) as HTMLElement
                clone.removeAttribute('id')
                clone.removeAttribute('data-card-id')
                clone.setAttribute('aria-hidden', 'true')
                clone.setAttribute('inert', '')
                clone.classList.remove('tutorial-glow', 'card-selected')
                Object.assign(clone.style, { position: 'fixed', left: `${destination.left - window.scrollX}px`, top: `${destination.top - window.scrollY}px`, width: `${destination.width}px`, height: `${destination.height}px`, margin: '0', zIndex: '90', pointerEvents: 'none', transition: 'none', animation: 'none' })
                document.body.appendChild(clone)
                const visibility = element.style.visibility
                element.style.visibility = 'hidden'
                const animation = clone.animate([
                    { transform: `translate(${source.left - destination.left}px, ${source.top - destination.top}px) scale(${source.width / destination.width}) rotate(-5deg)`, opacity: .8 },
                    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
                ], { duration: 600, delay: Math.min(index * 25, 150), easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'both' })
                const finish = () => { clone.remove(); element.style.visibility = visibility }
                animation.onfinish = finish
                cleanups.push(() => { animation.cancel(); finish() })
            })
        }
        lastRevision.current = revision
        const capture = () => { previous.current = new Map(cards.map(element => [element.dataset.cardId!, position(element)])) }
        capture()
        const interrupt = () => { cleanups.forEach(cleanup => cleanup()); capture() }
        window.addEventListener('scroll', interrupt, true)
        window.addEventListener('resize', interrupt)
        return () => {
            cleanups.forEach(cleanup => cleanup())
            window.removeEventListener('scroll', interrupt, true)
            window.removeEventListener('resize', interrupt)
        }
    }, [revision, root])
}
