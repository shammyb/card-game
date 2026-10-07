// 'use client'
//
// import { useEffect } from 'react'
// import { io } from 'socket.io-client'
//
// const socket = io('http://localhost:3001')
//
// export default function GameClient() {
//     useEffect(() => {
//         socket.emit('joinRoom', {
//             roomId: 'abc123',
//             playerName: 'Shammy',
//         })
//
//         socket.on('playerJoined', (data) => {
//             console.log(`🎉 ${data.playerName} joined your room`)
//         })
//
//         socket.on('moveMade', (move) => {
//             console.log('🃏 Move made:', move)
//         })
//
//         return () => {
//             socket.disconnect()
//         }
//     }, [])
//
//     return <div>Connected to game server. Check the console!</div>
// }
