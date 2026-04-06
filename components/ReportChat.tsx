"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/lib/types";

const SUGGESTED_QUESTIONS = [
  "Why is BDNF flagged as a key biomarker?",
  "What is the mechanism of action of XYL-1001?",
  "What CRO screening criteria should be prioritized?",
  "How does this patient compare to psilocybin trial responders?",
  "What does the Bayesian prior tell us about subtype probability?",
];

export default function ReportChat({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    // Prepare history for multi-turn (exclude last user msg — it's in the request)
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`/api/runs/${runId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) throw new Error("Chat request failed");
      if (!res.body) throw new Error("No response body");

      // Stream the response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let sources = 0;

      // Add empty assistant message to update in place
      setMessages(prev => [...prev, { role: "assistant", content: "", corpus_sources: 0 }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.sources !== undefined) sources = parsed.sources;
            if (parsed.token) {
              assistantContent += parsed.token;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  corpus_sources: sources,
                };
                return updated;
              });
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 pb-10 w-full">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-sm text-brand-core hover:text-text-heading transition-colors mb-4"
      >
        <span className="text-lg">{open ? "▼" : "▶"}</span>
        Ask the corpus — Q&A about this report
        {messages.length > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-brand-core/12 text-brand-core text-xs">
            {messages.filter(m => m.role === "assistant").length} answer{messages.filter(m => m.role === "assistant").length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="bg-bg-surface border border-border-subtle rounded-2xl overflow-hidden">
          <div className="px-5 pt-4 pb-2 border-b border-border-subtle flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full border border-status-warning/25 bg-status-warning/6 text-status-warning font-medium">◆ AI Estimate</span>
            <span className="text-text-muted text-xs">Answers are synthesized by Claude from the report and corpus — always verify against primary sources.</span>
          </div>
          {/* Messages */}
          <div className="h-96 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div>
                <p className="text-text-muted text-sm mb-4">Ask anything about this report or the underlying corpus.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => send(q)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border-subtle text-text-muted hover:border-brand-core hover:text-brand-core transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-brand-core text-white"
                    : "bg-bg-page border border-border-subtle text-text-heading"
                }`}>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === "assistant" && msg.corpus_sources !== undefined && msg.corpus_sources > 0 && (
                    <p className="text-text-muted text-xs mt-2 border-t border-border-subtle pt-2">
                      Grounded in {msg.corpus_sources} corpus source{msg.corpus_sources !== 1 ? "s" : ""}
                    </p>
                  )}
                  {msg.role === "assistant" && loading && i === messages.length - 1 && !msg.content && (
                    <span className="inline-block animate-pulse">▋</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border-subtle p-4 flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Ask about biomarkers, mechanism, screening criteria…"
              disabled={loading}
              className="flex-1 bg-bg-page border border-border-subtle rounded-lg px-4 py-2.5 text-text-heading text-sm placeholder-text-muted focus:outline-none focus:border-brand-core transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-brand-core hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "⟳" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
