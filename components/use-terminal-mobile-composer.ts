"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type ComposerMetrics = {
  bottomInset: number;
  height: number;
};

function getViewportBottomInset() {
  if (typeof window === "undefined") {
    return 0;
  }

  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return 0;
  }

  return Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop);
}

export function useTerminalMobileComposer<T extends HTMLElement>(active: boolean) {
  const composerRef = useRef<T>(null);
  const [floatingComposer, setFloatingComposer] = useState(false);
  const [metrics, setMetrics] = useState<ComposerMetrics>({ bottomInset: 0, height: 0 });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 980px), (pointer: coarse)");
    const updateFloatingComposer = () => setFloatingComposer(mediaQuery.matches);

    updateFloatingComposer();
    mediaQuery.addEventListener("change", updateFloatingComposer);
    return () => mediaQuery.removeEventListener("change", updateFloatingComposer);
  }, []);

  useEffect(() => {
    if (!active || !floatingComposer || typeof window === "undefined") {
      setMetrics({ bottomInset: 0, height: 0 });
      return;
    }

    const updateMetrics = () => {
      const nextMetrics = {
        bottomInset: getViewportBottomInset(),
        height: composerRef.current?.offsetHeight ?? 0,
      };

      setMetrics((current) =>
        current.bottomInset === nextMetrics.bottomInset && current.height === nextMetrics.height
          ? current
          : nextMetrics
      );
    };

    updateMetrics();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", updateMetrics);
    visualViewport?.addEventListener("scroll", updateMetrics);
    window.addEventListener("resize", updateMetrics);
    const composerElement = composerRef.current;

    const resizeObserver =
      typeof ResizeObserver === "undefined" || !composerElement
        ? null
        : new ResizeObserver(() => updateMetrics());

    if (resizeObserver && composerElement) {
      resizeObserver.observe(composerElement);
    }

    return () => {
      visualViewport?.removeEventListener("resize", updateMetrics);
      visualViewport?.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
      resizeObserver?.disconnect();
    };
  }, [active, floatingComposer]);

  const frameStyle = useMemo<CSSProperties | undefined>(() => {
    if (!floatingComposer) {
      return undefined;
    }

    return {
      "--terminal-mobile-composer-space": `${metrics.height + metrics.bottomInset}px`,
    } as CSSProperties;
  }, [floatingComposer, metrics.bottomInset, metrics.height]);

  const composerStyle = useMemo<CSSProperties | undefined>(() => {
    if (!floatingComposer) {
      return undefined;
    }

    return {
      "--terminal-mobile-composer-offset": `${metrics.bottomInset}px`,
    } as CSSProperties;
  }, [floatingComposer, metrics.bottomInset]);

  return {
    composerRef,
    composerStyle,
    floatingComposer,
    frameStyle,
  };
}
