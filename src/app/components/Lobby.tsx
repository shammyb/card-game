'use client'

import { useEffect, useState } from 'react'
import { socket } from '@/lib/gameSocket'
import { v4 as uuidv4 } from 'uuid'

export default function Lobby() {
    const [name, setName] = useState('')
    const [roomId, setRoomId] = useState('')
    const [joined, setJoined] = useState(false)
    const [players, setPlayers] = useState<string[]>([])

    const handleJoin = () => {
        if (!roomId || !name) return
        socket.emit('joinRoom', { playerName: name, roomId })
        setJoined(true)
    }

    const handleCreateRoom = () => {
        const newRoomId = uuidv4().slice(0, 6)
        setRoomId(newRoomId)
    }

    useEffect(() => {
        socket.on('roomPlayers', (roomPlayers) => {
            setPlayers(roomPlayers.map((p:  {name:string} ) => (p).name))
        })

        return () => {
            socket.off('roomPlayers')
        }
    }, [])

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Lobby</h2>

            {!joined ? (
                <>
                    <input
                        type="text"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="border p-2 w-full"
                    />
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Room ID"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            className="border p-2 flex-grow"
                        />
                        <button onClick={handleCreateRoom} className="bg-gray-600 text-white px-4 rounded">
                            Create
                        </button>
                    </div>
                    <button onClick={handleJoin} className="bg-blue-600 text-white p-2 rounded w-full">
                        Join Room
                    </button>
                </>
            ) : (
                <div>
                    <p>✅ Joined room <strong>{roomId}</strong> as <strong>{name}</strong></p>
                    <h3 className="mt-4 font-semibold">Players in room:</h3>
                    <ul className="list-disc pl-5">
                        {players.map((player) => (
                            <li key={player}>{player}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
