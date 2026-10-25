"use client";

import { useEffect, useRef } from "react";

type HeliosSphereLoaderProps = {
  size?: number;
  color?: string;
  lineCount?: number;
  cycleMs?: number;
  lineWidth?: number;
  className?: string;
  ariaLabel?: string;
};

export function HeliosSphereLoader({
  size = 120,
  color = "#f4f7fb",
  lineCount = 32,
  cycleMs = 5200,
  lineWidth = 1.15,
  className,
  ariaLabel = "Helios lädt",
}: Readonly<HeliosSphereLoaderProps>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element;

    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    let animationFrame = 0;
    let start = performance.now();

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const samples = 360;
    const radius = size * 0.42;
    const cyclesAcrossWidth = 1.0;
    const travelSpeed = 3.6;
    const maxPhaseSpread = Math.PI;

    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);

      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function phaseSpreadForTime(elapsed: number) {
      if (prefersReducedMotion.matches) {
        // Static sphere for reduced-motion users.
        return 1;
      }

      const progress = (elapsed % cycleMs) / cycleMs;

      // 1 = sphere
      // 0 = all curves exactly overlap and look like a single curve
      // 1 = sphere again
      return 0.5 + 0.5 * Math.cos(progress * Math.PI * 2);
    }

    function draw(now: number) {
      const elapsed = now - start;
      const phaseAmount = phaseSpreadForTime(elapsed);

      const width = size;
      const height = size;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      const commonPhase = prefersReducedMotion.matches
        ? 0
        : -(elapsed / 1000) * travelSpeed;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.78;

      for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        /*
         * Midpoint distribution is intentional:
         * it avoids drawing both -PI and +PI, which would be
         * equivalent curves and would make one line look brighter.
         */
        const linePosition = (lineIndex + 0.5) / lineCount;

        const normalizedLine = linePosition * 2 - 1;

        const phaseOffset = normalizedLine * maxPhaseSpread * phaseAmount;

        ctx.beginPath();

        for (let sample = 0; sample < samples; sample++) {
          const q = sample / (samples - 1);
          const nx = q * 2 - 1;

          const x = cx + nx * radius;

          const envelope = radius * Math.sqrt(Math.max(0, 1 - nx * nx));

          const angle =
            q * Math.PI * 2 * cyclesAcrossWidth + commonPhase + phaseOffset;

          const y = cy + Math.sin(angle) * envelope;

          if (sample === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      if (!prefersReducedMotion.matches && !document.hidden) {
        animationFrame = requestAnimationFrame(draw);
      }
    }

    resizeCanvas();
    draw(performance.now());

    const handleVisibilityChange = () => {
      cancelAnimationFrame(animationFrame);
      if (!document.hidden) draw(performance.now());
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleMotionChange = () => {
      cancelAnimationFrame(animationFrame);
      start = performance.now();
      draw(performance.now());
    };

    prefersReducedMotion.addEventListener("change", handleMotionChange);

    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      prefersReducedMotion.removeEventListener("change", handleMotionChange);
    };
  }, [size, color, lineCount, cycleMs, lineWidth]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="status"
      aria-label={ariaLabel}
      width={size}
      height={size}
      style={{
        display: "block",
        width: size,
        height: size,
      }}
    />
  );
}

export default HeliosSphereLoader;
