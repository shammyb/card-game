'use client'

import { useState } from 'react'

export default function JoinRoom() {
    const [roomId, setRoomId] = useState('')
    const [name, setName] = useState('')
    const [status, setStatus] = useState('')

    const joinRoom = async () => {
        const res = await fetch('/api/rooms/join', {
            method: 'POST',
            body: JSON.stringify({ roomId, playerName: name }),
        })

        const data = await res.json()
        if (res.ok) {
            setStatus(`Joined room! Welcome, ${data.player.name}`)
        } else {
            setStatus(data.error || 'Failed to join')
        }
    }

    return (
        <div className="space-y-2">
            <input
                className="border p-2"
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
            />
            <input
                className="border p-2"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <button onClick={joinRoom} className="p-2 bg-green-600 text-white rounded">
                Join Room
            </button>
            {status && <p>{status}</p>}
        </div>
    )
}
