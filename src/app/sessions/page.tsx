import { getAllEndedSessions } from '@/db'
import { SessionList } from './_components/session-list'

export default async function SessionsPage() {
  const sessions = await getAllEndedSessions()
  return <SessionList sessions={sessions} />
}
