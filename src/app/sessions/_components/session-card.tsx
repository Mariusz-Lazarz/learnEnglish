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

  const label = session.lessonName ?? 'Free conversation'
  const date = new Date(session.startedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{date}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{session.messageCount} messages</p>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => {
              setResumeError(null)
              startTransition(async () => {
                const result = await resumeSessionAction(session.id)
                if ('newSessionId' in result) {
                  router.push('/session/' + result.newSessionId)
                } else {
                  setResumeError(result.error)
                }
              })
            }}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Resume
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
        {resumeError && <p className="text-sm text-destructive">{resumeError}</p>}
      </CardFooter>
    </Card>
  )
}
