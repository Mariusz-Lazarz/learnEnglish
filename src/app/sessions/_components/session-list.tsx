'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SessionWithLesson } from '@/db'
import { SessionCard } from './session-card'
import { DeleteSessionAlert } from './delete-session-alert'

interface SessionListProps {
  sessions: SessionWithLesson[]
}

export function SessionList({ sessions }: SessionListProps) {
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Past sessions</h1>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Lessons
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No past sessions yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={() => setDeleteSessionId(session.id)}
            />
          ))}
        </div>
      )}

      <DeleteSessionAlert
        open={deleteSessionId !== null}
        sessionId={deleteSessionId ?? ''}
        onOpenChange={(open) => {
          if (!open) setDeleteSessionId(null)
        }}
      />
    </div>
  )
}
