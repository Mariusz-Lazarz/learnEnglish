'use server'

import { revalidatePath } from 'next/cache'
import { createLesson, updateLesson, deleteLesson } from '@/db'
import { lessonSchema, type LessonFormData } from '@/lib/lesson-schema'

export async function createLessonAction(
  data: LessonFormData
): Promise<{ error: string } | undefined> {
  const parsed = lessonSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  try {
    await createLesson({
      name: parsed.data.name,
      subject: parsed.data.subject,
      conversationGoal: parsed.data.conversationGoal,
      vocabulary: parsed.data.vocabulary ?? null,
    })
    revalidatePath('/')
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}

export async function updateLessonAction(
  id: string,
  data: LessonFormData
): Promise<{ error: string } | undefined> {
  const parsed = lessonSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  try {
    await updateLesson(id, {
      name: parsed.data.name,
      subject: parsed.data.subject,
      conversationGoal: parsed.data.conversationGoal,
      vocabulary: parsed.data.vocabulary ?? null,
    })
    revalidatePath('/')
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}

export async function deleteLessonAction(
  id: string
): Promise<{ error: string } | undefined> {
  try {
    await deleteLesson(id)
    revalidatePath('/')
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}
