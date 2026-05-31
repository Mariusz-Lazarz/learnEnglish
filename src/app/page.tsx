import { getAllLessons } from '@/db'
import { LessonList } from './_components/lesson-list'

export default async function Home() {
  const lessons = await getAllLessons()

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">My Lessons</h1>
      <LessonList lessons={lessons} />
    </main>
  )
}
