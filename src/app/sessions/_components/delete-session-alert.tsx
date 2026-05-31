'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { deleteSessionAction } from '@/app/actions/sessions'
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

interface DeleteSessionAlertProps {
  sessionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteSessionAlert({ sessionId, open, onOpenChange }: DeleteSessionAlertProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteSessionAction(sessionId)
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
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          setError(null)
          onOpenChange(false)
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete session</AlertDialogTitle>
          <AlertDialogDescription>
            Delete this session? This cannot be undone.
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
