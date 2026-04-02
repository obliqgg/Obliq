"use client";

import { useEffect, useRef, useState } from "react";
import { useTerminalMobileComposer } from "@/components/use-terminal-mobile-composer";

const CHAR_DELAY = 18;
const LINE_PAUSE = 120;

type StaticTerminalPageProps = {
  lines: readonly string[];
  returnPath?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function focusTerminalInput(input: HTMLInputElement | null) {
  if (!input) {
    return;
  }

  input.focus({ preventScroll: true });
  const caret = input.value.length;
  input.setSelectionRange(caret, caret);
}

export function StaticTerminalPage({
  lines,
  returnPath = "/",
}: StaticTerminalPageProps) {
  const [renderedLines, setRenderedLines] = useState<string[]>([]);
  const [typingLine, setTypingLine] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [interactive, setInteractive] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const { composerRef, composerStyle, floatingComposer, frameStyle } =
    useTerminalMobileComposer<HTMLFormElement>(interactive);

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [renderedLines]);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    const typeLines = async () => {
      for (const line of lines) {
        if (!line) {
          setRenderedLines((value) => [...value, ""]);
          await sleep(LINE_PAUSE);
          continue;
        }

        let text = "";
        for (const char of line) {
          text += char;
          setTypingLine(text);
          await sleep(CHAR_DELAY);
        }

        setTypingLine("");
        setRenderedLines((value) => [...value, line]);
        await sleep(LINE_PAUSE);
      }

      setInteractive(true);
      window.setTimeout(() => focusTerminalInput(inputRef.current), 50);
    };

    void typeLines();
  }, [lines]);

  useEffect(() => {
    const onFocusAttempt = () => {
      if (interactive) {
        focusTerminalInput(inputRef.current);
      }
    };

    window.addEventListener("click", onFocusAttempt);
    window.addEventListener("touchstart", onFocusAttempt, { passive: true });
    return () => {
      window.removeEventListener("click", onFocusAttempt);
      window.removeEventListener("touchstart", onFocusAttempt);
    };
  }, [interactive]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = inputValue.trim().toLowerCase().replace(/^[>/]+/, "").trim();
    if (!normalized) {
      return;
    }

    if (normalized === "enter" || normalized === "exit") {
      window.location.href = returnPath;
      return;
    }

    setRenderedLines((value) => [...value, `> ${inputValue}`, "type enter to return"]);
    setInputValue("");
  }

  return (
    <main className="terminal-home-shell">
      <section className="terminal-panel terminal-panel-full">
        <div className="terminal-frame terminal-frame-full" ref={viewportRef} style={frameStyle}>
          {renderedLines.map((line, index) => (
            <div key={`${line}-${index}`} className="terminal-line">
              {line || "\u00A0"}
            </div>
          ))}

          {typingLine ? <div className="terminal-line">{typingLine}</div> : null}
        </div>

        {interactive ? (
          <form
            ref={composerRef}
            className={floatingComposer ? "terminal-composer terminal-composer-floating" : "terminal-composer"}
            style={composerStyle}
            onSubmit={handleSubmit}
          >
            <span className="terminal-prompt terminal-composer-prompt">{">"}</span>
            <input
              ref={inputRef}
              className="terminal-composer-input"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="send"
              autoFocus
              aria-label="Terminal command input"
            />
          </form>
        ) : null}
      </section>
    </main>
  );
}
