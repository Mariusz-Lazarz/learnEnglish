'use client'

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

interface LessonCardProps {
  lesson: Lesson
  onEdit: (lesson: Lesson) => void
  onDelete: (id: string, name: string) => void
}

export function LessonCard({ lesson, onEdit, onDelete }: LessonCardProps) {
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
      <CardFooter className="gap-2">
        <Button
          disabled
          title="Coming soon"
          size="sm"
        >
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
      </CardFooter>
    </Card>
  )
}
