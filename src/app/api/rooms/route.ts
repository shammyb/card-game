import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
    const { roomId, playerName } = await req.json()

    const room = await prisma.room.findUnique({
        where: { id: roomId },
    })

    if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    const player = await prisma.player.create({
        data: {
            name: playerName,
            roomId,
        },
    })

    return NextResponse.json({ player })
}
