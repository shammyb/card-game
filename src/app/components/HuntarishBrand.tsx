import CardSvg from './PlayingCards'

export default function HuntarishBrand() {
    return (
        <section className="island-intro" aria-labelledby="game-title">
            <p className="eyebrow">Good company. Great hands.</p>
            <div className="brand-scene">
                <div className="brand-sun" aria-hidden="true" />
                <div className="brand-card card-left" aria-hidden="true"><CardSvg suit="clubs" rank="A" /></div>
                <div className="brand-card card-right" aria-hidden="true"><CardSvg suit="hearts" rank="Q" /></div>
                <div className="brand-card card-center" aria-hidden="true"><CardSvg suit="spades" rank="K" /></div>
                <span className="scene-spark spark-one" aria-hidden="true">✦</span>
                <span className="scene-spark spark-two" aria-hidden="true">✧</span>
                <h1 id="game-title">Huntarish<span className="title-dot">.</span></h1>
            </div>
            <h2>A little escape.<br />A little competition.</h2>
            <p className="intro-copy">Pull up a chair, challenge a friend, and let the cards do the talking. Your beachside table is waiting.</p>
            <div className="intro-badges"><span><i aria-hidden="true">♧</i> Just the two of you</span><span><i aria-hidden="true">✧</i> A fresh hand every time</span></div>
        </section>
    )
}
