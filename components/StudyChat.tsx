"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface StudyChatProps {
  studyId: string;
  drugName: string;
  suggestions: string[];
}

export default function StudyChat({ studyId, drugName, suggestions }: StudyChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Focus input when opening with no messages
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = { role: "user", content: text };
    const history = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/studies/${studyId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated, streaming: true };
          return updated;
        });
      }

      // Finalize — remove streaming flag
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: accumulated };
        return updated;
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [studyId, messages, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsOpen(false);
  };

  const showSuggestions = messages.length === 0 && suggestions.length > 0;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => isOpen ? handleClose() : setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 print-hide ${
          isOpen
            ? "bg-[#1E3A5F] text-[#8BA3C7] hover:bg-[#2A4A70]"
            : "bg-[#4F8EF7] text-white hover:bg-[#3A7AE8]"
        }`}
        title={isOpen ? "Close AI Chat" : `Ask AI about ${drugName}`}
      >
        {isOpen ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-22 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] flex flex-col bg-[#070F1E] border border-[#1E3A5F] rounded-2xl shadow-2xl print-hide"
          style={{ height: "520px", bottom: "5rem" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E3A5F] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#4F8EF7]/20 border border-[#4F8EF7]/40 flex items-center justify-center">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4F8EF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-[#F0F4FF] text-xs font-semibold">Ask AI</p>
                <p className="text-[#4A6580] text-[10px]">Grounded in this analysis</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-[10px] text-[#4A6580] hover:text-[#8BA3C7] transition-colors px-2 py-1 rounded border border-[#1E3A5F] hover:border-[#4F8EF7]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Welcome + suggestions */}
            {showSuggestions && (
              <div>
                <p className="text-[#8BA3C7] text-xs mb-3 leading-relaxed">
                  I have the full pre-clinical analysis in context. Ask me anything about the responder phenotype, efficacy signals, safety, or the methodology.
                </p>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg bg-[#0F1F3D] border border-[#1E3A5F] text-[#8BA3C7] hover:text-[#F0F4FF] hover:border-[#4F8EF7] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message thread */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#4F8EF7] text-white"
                    : "bg-[#0F1F3D] border border-[#1E3A5F] text-[#D0DCF0]"
                }`}>
                  {msg.content || (msg.streaming ? (
                    <span className="flex items-center gap-1.5 text-[#4A6580]">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>●</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>●</span>
                    </span>
                  ) : "")}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-[#1E3A5F]">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the analysis…"
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none bg-[#0F1F3D] border border-[#1E3A5F] rounded-xl px-3 py-2 text-xs text-[#F0F4FF] placeholder-[#4A6580] focus:outline-none focus:border-[#4F8EF7] transition-colors disabled:opacity-50"
                style={{ minHeight: "36px", maxHeight: "100px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#4F8EF7] text-white flex items-center justify-center hover:bg-[#3A7AE8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-[#2A4060] mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      )}
    </>
  );
}
