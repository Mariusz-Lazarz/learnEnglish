import { getAllSessions } from '@/db'
import { SessionList } from './_components/session-list'

export const dynamic = 'force-dynamic'

export default async function SessionsPage() {
  const sessions = await getAllSessions()
  return <SessionList sessions={sessions} />
}
