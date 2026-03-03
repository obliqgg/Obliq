"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BOOT_SEQUENCE } from "@/lib/boot-sequence";
import { BootLine, CommandResponse } from "@/lib/types";

const CHAR_DELAY = 35;
const LINE_PAUSE_BASE = 250;
const LINE_PAUSE_VARIANCE = 150;
const FINAL_PAUSE = 500;
const STATUS_WORD_PAUSE = 100;
const CURSOR_BLINK_MS = 530;

type TerminalLine = {
  text: string;
  color?: string;
  highlights?: Array<{ word: string; color: string }>;
};

function renderHighlightedText(
  text: string,
  defaultColor: string,
  highlights?: Array<{ word: string; color: string }>
) {
  if (!highlights || highlights.length === 0) {
    return <span style={{ color: defaultColor }}>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let earliestIndex = remaining.length;
    let matchedHighlight: { word: string; color: string } | null = null;

    for (const h of highlights) {
      const idx = remaining.indexOf(h.word);
      if (idx !== -1 && idx < earliestIndex) {
        earliestIndex = idx;
        matchedHighlight = h;
      }
    }

    if (matchedHighlight && earliestIndex < remaining.length) {
      if (earliestIndex > 0) {
        parts.push(
          <span key={key++} style={{ color: defaultColor }}>
            {remaining.slice(0, earliestIndex)}
          </span>
        );
      }
      parts.push(
        <span key={key++} style={{ color: matchedHighlight.color }}>
          {matchedHighlight.word}
        </span>
      );
      remaining = remaining.slice(earliestIndex + matchedHighlight.word.length);
    } else {
      parts.push(
        <span key={key++} style={{ color: defaultColor }}>
          {remaining}
        </span>
      );
      remaining = "";
    }
  }

  return <>{parts}</>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentTyping, setCurrentTyping] = useState<{
    text: string;
    color?: string;
    highlights?: Array<{ word: string; color: string }>;
  } | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCursor, setShowCursor] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(crypto.randomUUID());
  const bootRanRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  // Cursor blink
  useEffect(() => {
    if (!showCursor) return;
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, CURSOR_BLINK_MS);
    return () => clearInterval(interval);
  }, [showCursor]);

  // Auto-scroll
  useEffect(() => {
    scrollToBottom();
  }, [lines, currentTyping, scrollToBottom]);

  // Focus input on click
  useEffect(() => {
    const handleClick = () => {
      if (interactive && inputRef.current) {
        inputRef.current.focus();
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [interactive]);

  // Type out a single line character by character
  const typeLine = useCallback(
    async (line: BootLine): Promise<void> => {
      if (line.text === "") {
        setLines((prev) => [...prev, { text: "" }]);
        await sleep(line.postDelay ?? LINE_PAUSE_BASE);
        return;
      }

      const charDelay = line.charDelay ?? CHAR_DELAY;
      const dotDelay = line.dotDelay ?? charDelay;
      let typed = "";

      const dotMatch = line.text.match(/^(.+?)(\s)(\.{3,})(\s+)(\S+)$/);

      if (dotMatch) {
        const [, prefix, space1, dots, space2, statusWord] = dotMatch;

        for (const char of prefix + space1) {
          typed += char;
          setCurrentTyping({
            text: typed,
            color: line.color,
            highlights: line.highlights,
          });
          scrollToBottom();
          await sleep(charDelay);
        }

        for (const char of dots) {
          typed += char;
          setCurrentTyping({
            text: typed,
            color: line.color,
            highlights: line.highlights,
          });
          scrollToBottom();
          await sleep(dotDelay);
        }

        typed += space2;
        setCurrentTyping({
          text: typed,
          color: line.color,
          highlights: line.highlights,
        });
        scrollToBottom();

        await sleep(STATUS_WORD_PAUSE);

        typed += statusWord;
        setCurrentTyping({
          text: typed,
          color: line.color,
          highlights: line.highlights,
        });
        scrollToBottom();
      } else {
        for (const char of line.text) {
          typed += char;
          setCurrentTyping({
            text: typed,
            color: line.color,
            highlights: line.highlights,
          });
          scrollToBottom();
          await sleep(charDelay);
        }
      }

      setLines((prev) => [
        ...prev,
        {
          text: line.text,
          color: line.color,
          highlights: line.highlights,
        },
      ]);
      setCurrentTyping(null);
    },
    [scrollToBottom]
  );

  const typeResponse = useCallback(
    async (text: string): Promise<void> => {
      const responseLines = text.split("\n");
      for (let i = 0; i < responseLines.length; i++) {
        const rLine = responseLines[i];
        if (rLine === "") {
          setLines((prev) => [...prev, { text: "" }]);
          await sleep(LINE_PAUSE_BASE);
          continue;
        }

        let typed = "";
        for (const char of rLine) {
          typed += char;
          setCurrentTyping({ text: typed });
          scrollToBottom();
          await sleep(CHAR_DELAY);
        }
        setLines((prev) => [...prev, { text: rLine }]);
        setCurrentTyping(null);

        if (i < responseLines.length - 1) {
          await sleep(
            LINE_PAUSE_BASE + Math.random() * LINE_PAUSE_VARIANCE
          );
        }
      }
    },
    [scrollToBottom]
  );

  // Boot sequence — runs on mount
  useEffect(() => {
    if (bootRanRef.current) return;
    bootRanRef.current = true;

    (async () => {
      for (let i = 0; i < BOOT_SEQUENCE.length; i++) {
        await typeLine(BOOT_SEQUENCE[i]);
        if (i < BOOT_SEQUENCE.length - 1 && BOOT_SEQUENCE[i].text !== "") {
          await sleep(
            LINE_PAUSE_BASE + Math.random() * LINE_PAUSE_VARIANCE
          );
        }
      }

      await sleep(FINAL_PAUSE);
      setShowCursor(true);
      setInteractive(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    })();
  }, [typeLine]);

  const handleSubmit = async () => {
    if (!inputValue.trim() || isSubmitting) return;

    const input = inputValue;
    setInputValue("");
    setShowCursor(false);
    setIsSubmitting(true);

    setLines((prev) => [
      ...prev,
      { text: `> ${input}`, color: "#d0d0d0" },
    ]);

    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          session_id: sessionIdRef.current,
        }),
      });

      const data: CommandResponse = await res.json();

      if (data.matched) {
        await typeResponse(data.response);
      } else {
        setLines((prev) => [...prev, { text: data.response }]);
      }
    } catch {
      setLines((prev) => [
        ...prev,
        { text: "connection error. try again." },
      ]);
    }

    setIsSubmitting(false);
    setShowCursor(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      ref={terminalRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000000",
        overflowY: "auto",
        scrollbarWidth: "none",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          padding: "32px 32px",
          marginLeft: 32,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          lineHeight: 1.6,
        }}
        className="terminal-content"
      >
        {lines.map((line, i) => (
          <div key={i} style={{ minHeight: "1.6em" }}>
            {line.text === "" ? (
              "\u00A0"
            ) : (
              renderHighlightedText(
                line.text,
                line.color || "#a0a0a0",
                line.highlights
              )
            )}
          </div>
        ))}

        {currentTyping && (
          <div style={{ minHeight: "1.6em" }}>
            {renderHighlightedText(
              currentTyping.text,
              currentTyping.color || "#a0a0a0",
              currentTyping.highlights
            )}
          </div>
        )}

        {interactive && !isSubmitting && (
          <div style={{ minHeight: "1.6em", display: "flex" }}>
            <span style={{ color: "#d0d0d0" }}>{">"}&nbsp;</span>
            <span style={{ color: "#a0a0a0" }}>{inputValue}</span>
            {showCursor && (
              <span
                style={{
                  display: "inline-block",
                  width: "8.4px",
                  height: "1.15em",
                  background: cursorVisible ? "#d0d0d0" : "transparent",
                  verticalAlign: "text-bottom",
                }}
              />
            )}
          </div>
        )}

        {isSubmitting && (
          <div style={{ minHeight: "1.6em" }}>
            <span style={{ color: "#d0d0d0" }}>&nbsp;</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!interactive || isSubmitting}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            position: "absolute",
            left: "-9999px",
            opacity: 0,
            width: 0,
            height: 0,
          }}
        />
      </div>

      <style jsx global>{`
        .terminal-content {
          font-size: 14px;
        }
        @media (max-width: 768px) {
          .terminal-content {
            font-size: 13px !important;
            padding: 16px !important;
            margin-left: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function Page() {
  const [phase, setPhase] = useState<"video" | "terminal">("video");

  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      {phase === "video" ? (
        <video
          src="/glitch.mp4"
          autoPlay
          muted
          playsInline
          style={{ width: "100%", height: "100vh", objectFit: "cover" }}
          onEnded={() => setPhase("terminal")}
        />
      ) : (
        <Terminal />
      )}
    </div>
  );
}
