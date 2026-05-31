'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { Lesson } from '@/db'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { startSessionAction } from '@/app/actions/sessions'

interface LessonCardProps {
  lesson: Lesson
  onEdit: (lesson: Lesson) => void
  onDelete: (id: string, name: string) => void
}

export function LessonCard({ lesson, onEdit, onDelete }: LessonCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [startError, setStartError] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lesson.name}</CardTitle>
        <CardDescription>{lesson.subject}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="truncate text-sm">{lesson.conversationGoal}</p>
        {lesson.vocabulary && (
          <p className="truncate text-sm text-muted-foreground">
            {lesson.vocabulary}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => {
              setStartError(null)
              startTransition(async () => {
                const result = await startSessionAction(lesson.id)
                if ('sessionId' in result) {
                  router.push('/session/' + result.sessionId)
                } else {
                  setStartError(result.error)
                }
              })
            }}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start conversation
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(lesson)}>
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(lesson.id, lesson.name)}
          >
            Delete
          </Button>
        </div>
        {startError && (
          <p className="text-destructive text-sm">{startError}</p>
        )}
      </CardFooter>
    </Card>
  )
}
