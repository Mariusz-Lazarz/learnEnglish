'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { SessionWithLesson } from '@/db'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { resumeSessionAction } from '@/app/actions/sessions'

interface SessionCardProps {
  session: SessionWithLesson
  onDelete: () => void
}

export function SessionCard({ session, onDelete }: SessionCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [resumeError, setResumeError] = useState<string | null>(null)

  const isActive = session.endedAt === null
  const label = session.lessonName ?? 'Free conversation'
  const date = new Date(session.startedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })

  function handleContinue() {
    router.push('/session/' + session.id)
  }

  function handleResume() {
    setResumeError(null)
    startTransition(async () => {
      const result = await resumeSessionAction(session.id)
      if ('sessionId' in result) {
        router.push('/session/' + result.sessionId)
      } else {
        setResumeError(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="flex-1">{label}</CardTitle>
          {isActive && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              Active
            </span>
          )}
        </div>
        <CardDescription>{date}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{session.messageCount} messages</p>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          {isActive ? (
            <Button size="sm" onClick={handleContinue}>
              Continue
            </Button>
          ) : (
            <Button size="sm" disabled={isPending} onClick={handleResume}>
              {isPending && <Loader2 className="animate-spin" />}
              Resume
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
        {resumeError && <p className="text-sm text-destructive">{resumeError}</p>}
      </CardFooter>
    </Card>
  )
}
