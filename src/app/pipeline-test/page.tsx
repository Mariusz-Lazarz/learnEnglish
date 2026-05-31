'use client';

import { useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function PipelineTestPage() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const t0Ref = useRef<number>(0);

  async function startRecording() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        t0Ref.current = Date.now();
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });

    setRecording(false);

    try {
      // STT
      const formData = new FormData();
      formData.append('audio', audioBlob);
      const sttRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const { transcript: text, error: sttErr } = await sttRes.json();
      if (sttErr) throw new Error(sttErr);
      setTranscript(text);

      const userMessage: Message = { role: 'user', content: text };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);

      // Stream LLM
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!chatRes.ok) throw new Error(`Chat error ${chatRes.status}`);
      if (!chatRes.body) throw new Error('No response body');

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      setStreamingText('');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingText(fullText);
      }

      setMessages([...nextMessages, { role: 'assistant', content: fullText }]);
      setStreamingText('');

      // TTS
      await playTTS(fullText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function playTTS(text: string) {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`TTS error ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onplay = () => setLatencyMs(Date.now() - t0Ref.current);
    await audio.play();
  }

  const latencyDisplay =
    latencyMs !== null ? `Response in ${(latencyMs / 1000).toFixed(1)}s` : '—';

  return (
    <main style={{ fontFamily: 'monospace', maxWidth: 700, margin: '40px auto', padding: '0 20px' }}>
      <h1>Voice Pipeline Test</h1>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={recording ? stopRecording : startRecording}
          style={{
            padding: '10px 24px',
            fontSize: 16,
            background: recording ? '#c0392b' : '#27ae60',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {recording ? 'Stop' : 'Record'}
        </button>
        <span style={{ marginLeft: 16, color: '#555' }}>{latencyDisplay}</span>
      </div>

      {transcript && (
        <p><strong>You:</strong> {transcript}</p>
      )}

      {error && (
        <p style={{ color: '#c0392b' }}><strong>Error:</strong> {error}</p>
      )}

      <div>
        {messages.map((m, i) => (
          <p key={i}>
            <strong>{m.role === 'user' ? 'You' : 'Teacher'}:</strong> {m.content}
          </p>
        ))}
        {streamingText && (
          <p><strong>Teacher:</strong> {streamingText}<span style={{ opacity: 0.4 }}>▋</span></p>
        )}
      </div>
    </main>
  );
}
