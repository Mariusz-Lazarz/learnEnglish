'use client'

import { useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import type { z } from 'zod'

import type { Lesson } from '@/db'
import { lessonSchema } from '@/lib/lesson-schema'
import { createLessonAction, updateLessonAction } from '@/app/actions/lessons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type LessonFormValues = z.infer<typeof lessonSchema>

interface LessonFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lesson?: Lesson | null
}

export function LessonFormModal({ open, onOpenChange, lesson }: LessonFormModalProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      name: '',
      subject: '',
      conversationGoal: '',
      vocabulary: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset(
        lesson
          ? {
              name: lesson.name,
              subject: lesson.subject,
              conversationGoal: lesson.conversationGoal,
              vocabulary: lesson.vocabulary ?? '',
            }
          : { name: '', subject: '', conversationGoal: '', vocabulary: '' }
      )
    }
  }, [open, lesson, form])

  function onSubmit(data: LessonFormValues) {
    startTransition(async () => {
      const result = lesson
        ? await updateLessonAction(lesson.id, data)
        : await createLessonAction(data)

      if (result?.error) {
        form.setError('root', { message: result.error })
      } else {
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lesson ? 'Edit lesson' : 'New lesson'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Lesson name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. General topics" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conversationGoal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conversation goal</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="What should the conversation focus on?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vocabulary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vocabulary <span className="text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Words or phrases to practice" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" />}
                {lesson ? 'Save changes' : 'Create lesson'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
