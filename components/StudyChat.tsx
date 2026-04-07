"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  corpusSources?: number;
}

interface StudyChatProps {
  studyId: string;
  drugName: string;
  topBiomarker?: string;       // e.g. "BDNF" — from phase1 report rank 1
  predictedSubtype?: string;   // e.g. "Subtype A" — from phase2 ML result
}

// ── Page-specific skeptical suggestion chips ──────────────────────────────────
function getSuggestions(
  pathname: string,
  drugName: string,
  topBiomarker: string,
  predictedSubtype: string | null
): string[] {
  if (pathname.includes("/phase1/processing")) {
    return [
      "How do you ensure the corpus retrieval actually surfaces the most relevant science, rather than just text that matches surface keywords?",
      "The Bayesian priors are computed from keyword mentions in retrieved chunks — how is that a valid proxy for actual response rates?",
      "Why four search aspects? What's the justification for that decomposition, and what might it miss?",
      "What stops Claude from drawing on its training data rather than the retrieved corpus when synthesizing phenotypes?",
      "How was the 1.20× source weight for clinical trial documents calibrated?",
    ];
  }

  if (pathname.includes("/phase1/report")) {
    return [
      `What specific corpus text actually supports the ${topBiomarker} threshold — can you cite the document and passage?`,
      "The confidence score reflects how consistent the corpus evidence is, not clinical validation — so what meaningful decision does it support?",
      "How much of this responder profile is grounded in the XYL-1001 IND documents specifically, versus analogous drugs in the broader corpus?",
      "Which of these efficacy signals has the weakest supporting evidence, and why was it still included?",
      // SCIENCE-FEEDBACK: P1-A
      "How would you expect these Planning Phase phenotype predictions to hold up in a human Phase 1 cohort?",
    ];
  }

  if (pathname.includes("/phase2/subtyping")) {
    return [
      "How stable are these subtype assignments — would enrolling 10 additional patients meaningfully shift them?",
      `What's the biological basis for distinguishing${predictedSubtype ? ` ${predictedSubtype}` : " the subtypes"} — are these clusters truly distinct or a continuous spectrum forced into categories?`,
      "How do the SHAP attributions from the clinical model compare to what the Planning Phase analysis predicted would matter?",
      "What's the estimated misclassification rate given this cohort size?",
      "Where did the clinical subtype assignments agree with and diverge from the Planning Phase predictions?",
    ];
  }

  if (pathname.includes("/phase2/patients")) {
    return [
      "How representative is this patient cohort of the broader MDD population you'd want to enroll?",
      "Which patients are most likely to be subtype boundary cases — and how does that affect confidence in the subtype model?",
      "Are there demographic confounders in this cohort that could bias the biomarker analysis?",
      "What's the MADRS trajectory variance within each subtype — are the subtypes actually clinically homogeneous?",
      `How does the inflammatory profile distribution here compare to what the ${drugName} Planning Phase analysis predicted?`,
    ];
  }

  if (pathname.includes("/phase2/report") || pathname.includes("/phase2/processing")) {
    return [
      "How should a CRO interpret these prompts — are they inclusion criteria, hypotheses to test, or exploratory add-ons?",
      `What's the projected responder rate if enrollment was restricted to the predicted responder subtype for ${drugName}?`,
      "How do the final CRO recommendations compare to what the Planning Phase analysis predicted — where did the clinical data shift the conclusion?",
      "Which recommendation has the weakest evidential support, and what would strengthen it?",
      "If Phase 2 results differed significantly from Planning Phase predictions, what would that tell us about the corpus and model?",
    ];
  }

  if (pathname.includes("/phase2")) {
    return [
      "Is logistic regression on this cohort size statistically defensible for subtype prediction?",
      "How do the Phase 1 Bayesian priors propagate into the Phase 2 ML model — and could they introduce bias?",
      "What's the confidence interval on the predicted subtype assignment given N patients?",
      `How does adding the clinical data change your confidence in ${drugName}'s responder profile relative to the Planning Phase prediction?`,
      "At what sample size would you consider the subtype model sufficiently validated?",
    ];
  }

  // Default (corpus, history, or unknown page)
  return [
    `What specific corpus evidence supports the ${topBiomarker} signal — can you cite the document?`,
    `What are the key uncertainties in the ${drugName} Planning Phase analysis that clinical data will need to resolve?`,
    "Which pipeline step introduces the most potential for error, and why?",
    "How does adding the neuroplastigen and ketamine regulatory documents change the analysis versus the earlier corpus?",
    "What would make you more or less confident in the exploratory biomarker hypotheses?",
  ];
}

export default function StudyChat({ studyId, drugName, topBiomarker = "BDNF", predictedSubtype }: StudyChatProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Recompute chips when page changes; clear messages so new chips show
  const suggestions = getSuggestions(pathname, drugName, topBiomarker, predictedSubtype ?? null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
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

      const corpusSources = parseInt(res.headers.get("X-Corpus-Sources") ?? "0", 10);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated, streaming: true, corpusSources };
          return updated;
        });
      }

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: accumulated, corpusSources };
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

  const showSuggestions = messages.length === 0;

  // Page label for header context
  const pageLabel = pathname.includes("/phase1/processing") ? "Processing"
    : pathname.includes("/phase1/report") ? "Planning Phase Report"
    : pathname.includes("/phase2/subtyping") ? "Subtyping Results"
    : pathname.includes("/phase2/patients") ? "Patient Population"
    : pathname.includes("/phase2/report") ? "Final Report"
    : pathname.includes("/phase2") ? "Clinical Analysis"
    : "Analysis";

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => isOpen ? handleClose() : setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 print-hide ${
          isOpen
            ? "bg-nav-item-active-bg text-text-muted hover:bg-nav-item-active-bg"
            : "bg-brand-core text-white hover:bg-brand-hover"
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
        <div
          className="fixed z-50 w-[440px] max-w-[calc(100vw-2rem)] flex flex-col bg-bg-overlay border border-border-subtle rounded-2xl shadow-2xl print-hide"
          style={{ height: "560px", bottom: "5rem", right: "1.5rem" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-brand-core/20 border border-brand-core/40 flex items-center justify-center">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--brand-core)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-text-heading text-xs font-semibold">Ask AI · {pageLabel}</p>
                <p className="text-text-secondary text-[10px]">Live corpus retrieval · Grounded answers</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-[10px] text-text-secondary hover:text-text-muted transition-colors px-2 py-1 rounded border border-border-subtle hover:border-brand-core"
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {showSuggestions && (
              <div>
                <p className="text-text-secondary text-[10px] uppercase tracking-wider mb-2">Questions to consider</p>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg bg-bg-surface border border-border-subtle text-text-muted hover:text-text-heading hover:border-brand-core transition-colors leading-relaxed"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-nav-item-muted text-[10px] mt-3">
                  Each response retrieves live passages from the scientific corpus.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-brand-core text-white"
                    : "bg-bg-surface border border-border-subtle text-text-body"
                }`}>
                  {msg.content || (msg.streaming ? (
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>●</span>
                      <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>●</span>
                    </span>
                  ) : "")}
                </div>
                {msg.role === "assistant" && !msg.streaming && !!msg.corpusSources && (
                  <p className="text-[10px] text-nav-item-muted mt-1 flex items-center gap-1">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    Grounded in {msg.corpusSources} corpus source{msg.corpusSources !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-border-subtle">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the analysis…"
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none bg-bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-heading placeholder-text-secondary focus:outline-none focus:border-brand-core transition-colors disabled:opacity-50"
                style={{ minHeight: "36px", maxHeight: "100px" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-core text-white flex items-center justify-center hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-nav-item-muted mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      )}
    </>
  );
}
