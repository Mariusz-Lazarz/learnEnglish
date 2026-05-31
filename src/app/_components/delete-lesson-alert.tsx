'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'

import { deleteLessonAction } from '@/app/actions/lessons'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DeleteLessonAlertProps {
  lesson: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}

export function DeleteLessonAlert({ lesson, onOpenChange }: DeleteLessonAlertProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    if (!lesson) return
    startTransition(async () => {
      const result = await deleteLessonAction(lesson.id)
      if (result?.error) {
        setError(result.error)
      } else {
        setError(null)
        onOpenChange(false)
      }
    })
  }

  return (
    <AlertDialog
      open={lesson !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null)
          onOpenChange(false)
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete lesson</AlertDialogTitle>
          <AlertDialogDescription>
            Delete &ldquo;{lesson?.name}&rdquo;? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
