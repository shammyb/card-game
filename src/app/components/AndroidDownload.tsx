'use client'

import { useEffect, useState } from 'react'

const dismissalKey = 'huntarish-android-0.1.0-dismissed'
const apkUrl = 'https://expo.dev/artifacts/eas/7UwahVNfIEefdmKbldMY5f3854YeES9AjuSwucEtz-Y.apk'

export default function AndroidDownload() {
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        if (!/Android/i.test(navigator.userAgent)) return
        try { if (localStorage.getItem(dismissalKey)) return } catch {}
        setVisible(true)
    }, [])
    function dismiss() {
        setVisible(false)
        try { localStorage.setItem(dismissalKey, 'yes') } catch {}
    }
    if (!visible) return null
    return <aside className="android-download" aria-label="Android app download">
        <div><strong>Take Huntarish with you.</strong><p>Android preview · v0.1.0 · Same account, same players.</p>
            <details><summary>About installing</summary><p>This is a direct APK download, not a Google Play listing. Android may ask you to allow installation from your browser. Only install if you trust this download. Updates currently need a new download. You can always keep playing here instead.</p></details>
        </div>
        <a className="button button-primary" href={apkUrl}>Download Android APK</a>
        <button className="text-button" onClick={dismiss} aria-label="Dismiss Android download banner">Not now</button>
    </aside>
}
