'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lesson } from '@/db'
import { Button } from '@/components/ui/button'
import { LessonCard } from './lesson-card'
import { LessonFormModal } from './lesson-form-modal'
import { DeleteLessonAlert } from './delete-lesson-alert'

interface LessonListProps {
  lessons: Lesson[]
}

export function LessonList({ lessons }: LessonListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editLesson, setEditLesson] = useState<Lesson | null>(null)
  const [deleteLesson, setDeleteLesson] = useState<{ id: string; name: string } | null>(null)

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/sessions">Past sessions</Link>
        </Button>
        <Button onClick={() => setIsCreateOpen(true)}>New lesson</Button>
      </div>

      {lessons.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-muted-foreground">No lessons yet.</p>
          <Button onClick={() => setIsCreateOpen(true)}>Create your first lesson</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onEdit={(l) => setEditLesson(l)}
              onDelete={(id, name) => setDeleteLesson({ id, name })}
            />
          ))}
        </div>
      )}

      <LessonFormModal
        open={isCreateOpen || editLesson !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setEditLesson(null)
          }
        }}
        lesson={editLesson}
      />

      <DeleteLessonAlert
        lesson={deleteLesson}
        onOpenChange={(open) => {
          if (!open) setDeleteLesson(null)
        }}
      />
    </div>
  )
}
