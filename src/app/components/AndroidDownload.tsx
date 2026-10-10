'use client'

import { useEffect, useState } from 'react'

const dismissalKey = 'huntarish-android-0.2.0-dismissed'
const apkUrl = 'https://github.com/shammyb/card-game/releases/download/android-v0.2.0/huntarish-0.2.0.apk'

export default function AndroidDownload() {
    const [isAndroid, setIsAndroid] = useState(false)
    const [expanded, setExpanded] = useState(false)
    useEffect(() => {
        const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        const android = /Android/i.test(navigator.userAgent) || /Android/i.test(userAgentData?.platform ?? '')
        setIsAndroid(android)
        if (!android) return
        try {
            setExpanded(!localStorage.getItem(dismissalKey))
        } catch {
            setExpanded(true)
        }
    }, [])
    function dismiss() {
        setExpanded(false)
        try { localStorage.setItem(dismissalKey, 'yes') } catch {}
    }
    if (!isAndroid) return null
    if (!expanded) return <aside className="android-download android-download-collapsed" aria-label="Android app download">
        <strong>Huntarish for Android</strong>
        <a className="button button-primary" href={apkUrl}>Download 0.2.0</a>
        <button className="text-button" onClick={() => setExpanded(true)}>Details</button>
    </aside>
    return <aside className="android-download" aria-label="Android app download">
        <div><strong>Huntarish 0.2.0 is ready.</strong><p>Android preview · Computer games · Oldest-first stacks · Same account.</p>
            <details><summary>About installing</summary><p>This is a direct APK download, not a Google Play listing. Android may ask you to allow installation from your browser. Only install if you trust this download. Updates currently need a new download. You can always keep playing here instead.</p></details>
        </div>
        <a className="button button-primary" href={apkUrl}>Download Android 0.2.0</a>
        <button className="text-button" onClick={dismiss} aria-label="Dismiss Android download banner">Not now</button>
    </aside>
}
