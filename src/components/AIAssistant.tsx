'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context: 'financeiro' })
      })
      const data = await res.json()
      setMessages([...newMessages, { role: 'assistant', content: data.content || data.error || 'Erro ao responder.' }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Erro de conexão.' }])
    }
    setLoading(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      {open && (
        <div style={{
          width: 380, height: 520, background: 'var(--brave-dark)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)', marginBottom: 12
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>Assistente Prism</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Powered by Claude</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                Olá! Sou o assistente financeiro do Prism.<br />
                Pergunte sobre seu DRE, contas ou lançamentos.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.role === 'user' ? 'var(--brave-yellow)' : 'rgba(255,255,255,0.08)',
                  color: m.role === 'user' ? '#1a1a2e' : '#fff',
                  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap'
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Respondendo...</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pergunte sobre seus dados financeiros..."
              rows={1}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                padding: '8px 12px', color: '#fff', fontSize: 13, resize: 'none',
                outline: 'none', fontFamily: 'inherit'
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: 'var(--brave-yellow)', border: 'none', borderRadius: 8,
                padding: '8px 14px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: 16, color: '#1a1a2e',
                opacity: loading || !input.trim() ? 0.5 : 1
              }}
            >
              →
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 52, height: 52, borderRadius: '50%', background: 'var(--brave-yellow)',
          border: 'none', cursor: 'pointer', fontSize: 22, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginLeft: 'auto'
        }}
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  )
}
