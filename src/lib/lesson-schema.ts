import { z } from 'zod'

export const lessonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  subject: z.string().min(1, 'Subject is required'),
  conversationGoal: z.string().min(1, 'Conversation goal is required'),
  vocabulary: z.string().optional(),
})

export type LessonFormData = z.infer<typeof lessonSchema>
