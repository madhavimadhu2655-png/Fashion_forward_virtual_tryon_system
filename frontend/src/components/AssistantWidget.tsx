import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalogue } from "../hooks/useCatalogue";
import { answerQuestion, type AssistantAnswer } from "../lib/assistant";
import Icon from "./Icon";
import ProductImage from "./ProductImage";
import { formatINR } from "./ui";

const SUGGESTIONS = ["Black tops under ₹800", "Something for the gym", "Party tops on sale", "Relaxed linen"];

interface Turn {
  question: string;
  answer: AssistantAnswer;
}

/** Catalogue assistant. Rule-based and fully local: no AI service is called. */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const { items } = useCatalogue();
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    setTurns((current) => [...current.slice(-9), { question: q, answer: answerQuestion(q, items) }]);
    setInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        className="fixed bottom-20 left-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-ivory shadow-lift transition-transform hover:-translate-y-0.5 lg:bottom-6 lg:left-6"
      >
        <Icon name={open ? "close" : "message"} size={18} />
        <span className="hidden sm:inline">{open ? "Close" : "Ask the catalogue"}</span>
        <span className="sr-only sm:hidden">{open ? "Close assistant" : "Ask the catalogue"}</span>
      </button>

      {open && (
        <section
          id="assistant-panel"
          aria-label="Catalogue assistant"
          className="sheet-up fixed bottom-36 left-4 right-4 z-40 flex max-h-[min(72vh,560px)] flex-col overflow-hidden rounded-card border border-line bg-porcelain shadow-lift lg:bottom-24 sm:left-6 sm:right-auto sm:w-[380px]"
        >
          <header className="border-b border-line px-5 py-4">
            <p className="font-display text-lg">Catalogue assistant</p>
            <p className="mt-0.5 text-xs leading-5 text-stone">
              Answers only from real product data — colours, styles, fabric, fit and price. Runs in your browser; no AI
              service.
            </p>
          </header>
          <div ref={logRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-4" aria-live="polite">
            {turns.length === 0 && (
              <div>
                <p className="text-sm text-stone">Try one of these:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="chip min-h-0 py-1.5 text-xs" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, index) => (
              <div key={index} className="space-y-2.5">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-ivory">{turn.question}</p>
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-canvas px-3.5 py-2.5 text-sm text-ink">
                  <p>{turn.answer.text}</p>
                  {turn.answer.understood.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-stone">Understood: {turn.answer.understood.join(" · ")}</p>
                  )}
                </div>
                {turn.answer.products.length > 0 && (
                  <ul className="space-y-1.5">
                    {turn.answer.products.map((p) => (
                      <li key={p.id}>
                        <Link
                          to={`/product/${p.id}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 rounded-control p-1.5 transition-colors hover:bg-canvas"
                        >
                          <ProductImage src={p.thumbnail_url} alt="" className="h-12 w-10 shrink-0 rounded-md" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.name}</span>
                            <span className="text-xs text-stone">
                              {formatINR(p.discount_price ?? p.price)} · {p.colors.map((c) => c.color_name).join(", ")}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Ask about the catalogue
            </label>
            <input
              id="assistant-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="field h-10 rounded-full"
              placeholder="e.g. pink ribbed under ₹900"
              maxLength={160}
            />
            <button type="submit" className="btn btn-primary h-10 w-10 shrink-0 px-0" aria-label="Ask" disabled={!input.trim()}>
              <Icon name="send" size={16} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
