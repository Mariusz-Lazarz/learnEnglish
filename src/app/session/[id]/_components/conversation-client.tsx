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
import { saveTranscriptAction, endSessionAction, updateSummaryAction } from '@/app/actions/sessions'
import { buildAIContext, SUMMARY_EVERY_N_MESSAGES } from '@/lib/context-window'

interface ConversationClientProps {
  sessionId: string
  lessonName: string
  systemPrompt: string
  initialMessages?: Message[]
  initialSummary?: string
}

type TurnState = 'idle' | 'recording' | 'processing' | 'error'

export function ConversationClient({
  sessionId,
  lessonName,
  systemPrompt,
  initialMessages,
  initialSummary,
}: ConversationClientProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [rollingSummary, setRollingSummary] = useState<string | null>(initialSummary ?? null)
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
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
        mediaRecorderRef.current = null
      }
    }
  }, [])

  const playTTS = useCallback(async (text: string, onPlay?: () => void) => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`TTS error ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    await new Promise<void>((resolve, reject) => {
      audio.onplay = () => onPlay?.()
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        reject(new Error('Audio playback failed'))
      }
      audio.play().catch(reject)
    })
  }, [])

  // Generates a rolling summary when message count crosses the threshold.
  // Called fire-and-forget after each turn that lands on the threshold.
  const maybeRefreshSummary = useCallback(
    async (allMessages: Message[], currentSummary: string | null) => {
      if (allMessages.length === 0 || allMessages.length % SUMMARY_EVERY_N_MESSAGES !== 0) return
      try {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: buildAIContext(allMessages, currentSummary),
          }),
        })
        if (!res.ok) return
        const { summary } = await res.json()
        setRollingSummary(summary)
        void updateSummaryAction(sessionId, summary)
      } catch {
        // non-critical; silently skip
      }
    },
    [sessionId]
  )

  const callChat = useCallback(
    async (contextMessages: { role: 'user' | 'assistant'; content: string }[]) => {
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: contextMessages, systemPrompt }),
      })
      if (!chatRes.ok) throw new Error(`Chat error ${chatRes.status}`)
      if (!chatRes.body) throw new Error('No response body')

      const reader = chatRes.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
      }
      return fullText
    },
    [systemPrompt]
  )

  const runAIGreeting = useCallback(async () => {
    setTurnState('processing')
    try {
      const fullText = await callChat([{ role: 'user', content: 'Start' }])
      await playTTS(fullText, () => setStreamingText(fullText))

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
  }, [sessionId, callChat, playTTS])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const runInitialTurn = useCallback(async () => {
    if (initialMessages && initialMessages.length > 0) return
    await runAIGreeting()
  }, [initialMessages, runAIGreeting])

  useEffect(() => {
    if (greetingRanRef.current) return
    greetingRanRef.current = true
    void runInitialTurn()
  }, [runInitialTurn])

  function getSupportedMimeType(): string {
    const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg']
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
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
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
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

      const userMessage: Message = { role: 'user', content: transcript, timestamp: new Date().toISOString() }
      const withUser = [...messages, userMessage]
      setMessages(withUser)

      const contextMessages = buildAIContext(withUser, rollingSummary)
      const fullText = await callChat(contextMessages)

      await playTTS(fullText, () => setStreamingText(fullText))

      const updated: Message[] = [
        ...withUser,
        { role: 'assistant', content: fullText, timestamp: new Date().toISOString() },
      ]
      setStreamingText('')
      setMessages(updated)
      void saveTranscriptAction(sessionId, updated)
      void maybeRefreshSummary(updated, rollingSummary)
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
      <div className="py-4 border-t shrink-0 flex flex-col items-center gap-2">
        <Button
          aria-label={turnState === 'recording' ? 'Release to send' : 'Hold to speak'}
          size="lg"
          className={`rounded-full w-16 h-16 select-none touch-none ${turnState === 'recording' ? 'bg-red-600 hover:bg-red-700' : ''}`}
          disabled={turnState === 'processing' || turnState === 'error'}
          onMouseDown={() => { if (turnState === 'idle') void startRecording() }}
          onMouseUp={() => { if (turnState === 'recording') void stopRecording() }}
          onMouseLeave={() => { if (turnState === 'recording') void stopRecording() }}
          onTouchStart={(e) => { e.preventDefault(); if (turnState === 'idle') void startRecording() }}
          onTouchEnd={(e) => { e.preventDefault(); if (turnState === 'recording') void stopRecording() }}
        >
          {turnState === 'recording' ? (
            <MicOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          {turnState === 'recording' ? 'Release to send' : 'Hold to speak'}
        </span>
      </div>
    </div>
  )
}
