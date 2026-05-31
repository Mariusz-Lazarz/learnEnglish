'use client'

import type { Lesson } from '@/db'

export function LessonList({ lessons }: { lessons: Lesson[] }) {
  return <div>{lessons.length}</div>
}
