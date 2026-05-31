'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Mic, MicOff } from 'lucide-react'
import type { Message } from '@/db'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { saveTranscriptAction, endSessionAction } from '@/app/actions/sessions'

interface ConversationClientProps {
  sessionId: string
  lessonName: string
  systemPrompt: string
  initialMessages?: Message[]
}

type TurnState = 'idle' | 'recording' | 'processing' | 'error'

export function ConversationClient({
  sessionId,
  lessonName,
  systemPrompt,
  initialMessages,
}: ConversationClientProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [turnState, setTurnState] = useState<TurnState>('idle')
  const [streamingText, setStreamingText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const greetingRanRef = useRef(false)

  const playTTS = useCallback(async (text: string) => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`TTS error ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    await new Audio(url).play()
  }, [])

  const runAIGreeting = useCallback(async () => {
    setTurnState('processing')
    try {
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Start' }],
          systemPrompt,
        }),
      })
      if (!chatRes.ok) throw new Error(`Chat error ${chatRes.status}`)
      if (!chatRes.body) throw new Error('No response body')

      const reader = chatRes.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      setStreamingText('')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setStreamingText(fullText)
      }

      await playTTS(fullText)

      const greetingMessage: Message = {
        role: 'assistant',
        content: fullText,
        timestamp: new Date().toISOString(),
      }
      const updated = [greetingMessage]
      setStreamingText('')
      setMessages(updated)
      void saveTranscriptAction(sessionId, updated)
      setTurnState('idle')
    } catch (err) {
      setTurnState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to get AI greeting.')
    }
  }, [sessionId, systemPrompt, playTTS])

  const runResumeAcknowledgment = useCallback(async () => {
    if (!initialMessages || initialMessages.length === 0) return
    setTurnState('processing')
    try {
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...initialMessages.map(({ role, content }) => ({ role, content })),
            { role: 'user', content: 'Resume our previous conversation.' },
          ],
          systemPrompt,
        }),
      })
      if (!chatRes.ok) throw new Error(`Chat error ${chatRes.status}`)
      if (!chatRes.body) throw new Error('No response body')

      const reader = chatRes.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      setStreamingText('')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setStreamingText(fullText)
      }

      await playTTS(fullText)

      const assistantMessage: Message = {
        role: 'assistant',
        content: fullText,
        timestamp: new Date().toISOString(),
      }
      const updated = [...initialMessages, assistantMessage]
      setStreamingText('')
      setMessages(updated)
      void saveTranscriptAction(sessionId, updated)
      setTurnState('idle')
    } catch (err) {
      setTurnState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resume conversation.')
    }
  }, [sessionId, systemPrompt, initialMessages, playTTS])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const runInitialTurn = useCallback(async () => {
    if (initialMessages && initialMessages.length > 0) {
      await runResumeAcknowledgment()
    } else {
      await runAIGreeting()
    }
  }, [initialMessages, runAIGreeting, runResumeAcknowledgment])

  useEffect(() => {
    if (greetingRanRef.current) return
    greetingRanRef.current = true
    void runInitialTurn()
  }, [runInitialTurn])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.start()
      mediaRecorderRef.current = recorder
      setTurnState('recording')
    } catch (err) {
      setTurnState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Microphone access denied.')
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
      recorder.stop()
      recorder.stream.getTracks().forEach((t) => t.stop())
    })

    setTurnState('processing')

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob)
      const sttRes = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const { transcript, error: sttErr } = await sttRes.json()
      if (sttErr) throw new Error(sttErr)

      const currentMessages = messages
      const nextMessages: Message[] = [
        ...currentMessages,
        { role: 'user', content: transcript, timestamp: new Date().toISOString() },
      ]
      setMessages(nextMessages)

      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          systemPrompt,
        }),
      })
      if (!chatRes.ok) throw new Error(`Chat error ${chatRes.status}`)
      if (!chatRes.body) throw new Error('No response body')

      const reader = chatRes.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      setStreamingText('')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setStreamingText(fullText)
      }

      await playTTS(fullText)

      const updated: Message[] = [
        ...nextMessages,
        { role: 'assistant', content: fullText, timestamp: new Date().toISOString() },
      ]
      setStreamingText('')
      setMessages(updated)
      void saveTranscriptAction(sessionId, updated)
      setTurnState('idle')
    } catch (err) {
      setTurnState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  async function handleEndSession() {
    setIsEnding(true)
    setEndError(null)
    const result = await endSessionAction(sessionId, messages)
    if (result?.error) {
      setEndError(result.error)
      setIsEnding(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto px-4">
      {/* Header */}
      <header className="flex items-center gap-3 py-4 border-b shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-semibold text-lg truncate flex-1">{lessonName}</h1>
        <AlertDialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={turnState === 'processing'}
            >
              End session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End session?</AlertDialogTitle>
              <AlertDialogDescription>
                Your conversation transcript will be saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {endError && (
              <p className="text-destructive text-sm">{endError}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isEnding}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isEnding}
                onClick={(e) => {
                  e.preventDefault()
                  void handleEndSession()
                }}
              >
                {isEnding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                End session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm bg-muted text-foreground">
              {streamingText}
              <span className="opacity-40">▋</span>
            </div>
          </div>
        )}

        {turnState === 'processing' && !streamingText && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2 bg-muted">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {turnState === 'error' && errorMessage && (
          <div className="flex justify-center">
            <div className="rounded-lg px-4 py-3 bg-destructive/10 text-destructive text-sm flex items-center gap-3">
              <span>{errorMessage}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTurnState('idle')
                  setErrorMessage(null)
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom controls */}
      <div className="py-4 border-t shrink-0 flex justify-center">
        <Button
          size="lg"
          className={`rounded-full w-16 h-16 ${turnState === 'recording' ? 'bg-red-600 hover:bg-red-700' : ''}`}
          disabled={turnState === 'processing' || turnState === 'error'}
          onClick={turnState === 'recording' ? stopRecording : startRecording}
        >
          {turnState === 'recording' ? (
            <MicOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
      </div>
    </div>
  )
}
