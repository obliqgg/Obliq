"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { BOOT_SEQUENCE } from "@/lib/boot-sequence";
import type { BootLine } from "@/lib/types";
import { useTerminalMobileComposer } from "@/components/use-terminal-mobile-composer";

const CHAR_DELAY = 35;
const LINE_PAUSE = 250;
const FINAL_PAUSE = 500;
const CURSOR_BLINK_MS = 530;

type TerminalLine = {
  text: string;
  color?: string;
  highlights?: Array<{ word: string; color: string }>;
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

function renderHighlightedText(
  text: string,
  defaultColor: string,
  highlights?: Array<{ word: string; color: string }>
) {
  if (!highlights?.length) {
    return <span style={{ color: defaultColor }}>{text}</span>;
  }

  const nodes: ReactNode[] = [];
  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    let earliest = rest.length;
    let match: { word: string; color: string } | null = null;

    for (const item of highlights) {
      const location = rest.indexOf(item.word);
      if (location !== -1 && location < earliest) {
        earliest = location;
        match = item;
      }
    }

    if (!match || earliest === rest.length) {
      nodes.push(
        <span key={index++} style={{ color: defaultColor }}>
          {rest}
        </span>
      );
      break;
    }

    if (earliest > 0) {
      nodes.push(
        <span key={index++} style={{ color: defaultColor }}>
          {rest.slice(0, earliest)}
        </span>
      );
    }

    nodes.push(
      <span key={index++} style={{ color: match.color }}>
        {match.word}
      </span>
    );

    rest = rest.slice(earliest + match.word.length);
  }

  return <>{nodes}</>;
}

type TerminalSurfaceProps = {
  fullHeight?: boolean;
  shell?: "public" | "archon" | "directive";
  phaseSlug?: string;
  initialLines?: readonly string[];
};

export function TerminalSurface({
  fullHeight = false,
  shell = "public",
  phaseSlug,
  initialLines = [],
}: TerminalSurfaceProps) {
  const [showIntroGlitch, setShowIntroGlitch] = useState(shell === "public");
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [typingLine, setTypingLine] = useState<TerminalLine | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [interactive, setInteractive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmittedCommand, setHasSubmittedCommand] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bootStartedRef = useRef(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const introDismissedRef = useRef(false);
  const { composerRef, composerStyle, floatingComposer, frameStyle } =
    useTerminalMobileComposer<HTMLFormElement>(interactive);

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  useEffect(() => {
    if (bootStartedRef.current) {
      return;
    }

    const runBoot = async () => {
      bootStartedRef.current = true;
      const current = new Date();
      const header = `[${current.toISOString().replace("T", " ").slice(0, 19)} UTC] ARCHON v3.1.0 // INIT`;
      const sequence =
        shell !== "public"
          ? [
              { ...BOOT_SEQUENCE[0], text: header },
              BOOT_SEQUENCE[8],
            ]
          : BOOT_SEQUENCE.map((line, index) =>
              index === 0 ? { ...line, text: header } : line
            );

      for (const line of sequence) {
        await typeLine(line);
        if (line.text) {
          await sleep(LINE_PAUSE);
        }
      }

      await sleep(FINAL_PAUSE);
      if (initialLines.length) {
        setLines((value) => [...value, ...initialLines.map((text) => ({ text }))]);
      }
      setInteractive(true);
      window.setTimeout(() => focusTerminalInput(inputRef.current), 50);
    };

    const typeLine = async (line: BootLine) => {
      if (!line.text) {
        setLines((value) => [...value, { text: "" }]);
        return;
      }

      let text = "";
      for (const char of line.text) {
        text += char;
        setTypingLine({ text, color: line.color, highlights: line.highlights });
        await sleep(char === "." ? line.dotDelay ?? CHAR_DELAY : line.charDelay ?? CHAR_DELAY);
      }

      setTypingLine(null);
      setLines((value) => [
        ...value,
        { text: line.text, color: line.color, highlights: line.highlights },
      ]);
    };

    if (shell === "public" && showIntroGlitch) {
      const introTimer = window.setTimeout(() => {
        if (introDismissedRef.current) {
          return;
        }
        introDismissedRef.current = true;
        setShowIntroGlitch(false);
      }, 5000);

      return () => window.clearTimeout(introTimer);
    }

    void runBoot();
  }, [shell, showIntroGlitch, initialLines.length]);

  useEffect(() => {
    const onFocusAttempt = () => {
      if (interactive && !submitting) {
        focusTerminalInput(inputRef.current);
      }
    };

    window.addEventListener("click", onFocusAttempt);
    window.addEventListener("touchstart", onFocusAttempt, { passive: true });
    return () => {
      window.removeEventListener("click", onFocusAttempt);
      window.removeEventListener("touchstart", onFocusAttempt);
    };
  }, [interactive, submitting]);

  async function handleSubmit(commandOverride?: string) {
    const submittedInput = commandOverride ?? inputValue;
    if (!submittedInput.trim() || submitting) {
      return;
    }

    const pendingInput = submittedInput;
    const normalizedInput = pendingInput.trim().toLowerCase().replace(/^[>/]+/, "").trim();
    const suppressLocalEcho = normalizedInput === "enter" || normalizedInput === "login";
    setInputValue("");
    setSubmitting(true);
    setHasSubmittedCommand(true);
    if (!suppressLocalEcho) {
      setLines((value) => [...value, { text: `> ${pendingInput}`, color: "#d8d5cd" }]);
    }

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: pendingInput,
          session_id: sessionIdRef.current,
          shell,
          phase_slug: phaseSlug,
        }),
      });

      const data: {
        response: string;
        action?: "x_login" | "logout" | "payment";
        clear?: boolean;
        redirectTo?: string;
      } = await response.json();
      if (data.action === "x_login") {
        if (data.clear) {
          setLines([]);
        }
        setTypingLine(null);
        setLines([{ text: data.response }]);
        window.setTimeout(() => {
          void signIn("twitter", { callbackUrl: "/archon" });
        }, 120);
        return;
      }

      if (data.clear) {
        setLines([]);
      }
      setTypingLine(null);
      setLines((value) => [
        ...value,
        ...data.response.split("\n").map((line) => ({ text: line })),
      ]);

      if (data.action === "logout") {
        await sleep(300);
        await signOut({ callbackUrl: "/" });
      } else if (data.redirectTo) {
        await sleep(220);
        window.location.href = data.redirectTo;
      } else if (data.action === "payment") {
        await sleep(300);
        window.location.href = "/enter";
      }
    } catch {
      setLines((value) => [...value, { text: "connection error. try again." }]);
    }

    setSubmitting(false);
    window.setTimeout(() => focusTerminalInput(inputRef.current), 50);
  }

  return (
    <>
      {showIntroGlitch ? (
        <section className="terminal-glitch-intro" aria-label="ARCHON glitch intro">
          <video
            className="terminal-glitch-video"
            src="/glitch.mp4"
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => {
              if (introDismissedRef.current) {
                return;
              }
              introDismissedRef.current = true;
              setShowIntroGlitch(false);
            }}
          />
        </section>
      ) : null}

      <section className={fullHeight ? "terminal-panel terminal-panel-full" : "terminal-panel"}>
      <div
        className={fullHeight ? "terminal-frame terminal-frame-full" : "terminal-frame"}
        ref={viewportRef}
        style={frameStyle}
      >
        {lines.map((line, index) => (
          <div key={`${line.text}-${index}`} className="terminal-line">
            {line.text
              ? renderHighlightedText(
                  line.text,
                  line.color || "#a7a39b",
                  line.highlights
                )
              : "\u00A0"}
          </div>
        ))}

        {shell === "public" && interactive && lines.length === 0 && !hasSubmittedCommand ? (
          <div className="terminal-line terminal-hint-line">type help for available commands</div>
        ) : null}

        {typingLine ? (
          <div className="terminal-line">
            {renderHighlightedText(
              typingLine.text,
              typingLine.color || "#a7a39b",
              typingLine.highlights
            )}
          </div>
        ) : null}

      </div>

      {interactive ? (
        <form
          ref={composerRef}
          className={floatingComposer ? "terminal-composer terminal-composer-floating" : "terminal-composer"}
          style={composerStyle}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <span className="terminal-prompt terminal-composer-prompt">{">"}</span>
          <input
            ref={inputRef}
            id="terminal-command-input"
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
            placeholder=""
            aria-label="Terminal command input"
          />
        </form>
      ) : null}
      </section>
    </>
  );
}
