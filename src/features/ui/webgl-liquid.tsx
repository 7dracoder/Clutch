"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_colorDeep;
uniform vec3 u_colorMid;
uniform vec3 u_colorHighlight;
uniform float u_speed;
uniform float u_flowStrength;
uniform float u_grain;
uniform float u_contrast;
uniform float u_opacity;
uniform float u_reveal;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.86, 0.51, -0.51, 0.86);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

vec3 applyContrast(vec3 c, float contrast) {
  return clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float t = u_time * (0.14 * u_speed);
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect;

  vec2 flowP = vec2(p.x * 1.1, p.y - t * 0.35);
  float n1 = fbm(flowP * 2.8 + vec2(0.0, t * 0.2));
  float n2 = fbm((flowP + n1 * 0.45) * 4.0 - vec2(0.0, t * 0.35));
  float n3 = fbm((flowP + n2 * 0.4) * 6.5 + vec2(t * 0.15, 0.0));

  float structure = n3 * 1.15 + (n2 - 0.5) * 0.5;
  structure += (n1 - 0.5) * 0.3 * u_flowStrength;

  float lowBand = smoothstep(0.18, 0.6, structure);
  float highBand = smoothstep(0.62, 1.08, structure);
  vec3 col = mix(u_colorDeep, u_colorMid, lowBand);
  col = mix(col, u_colorHighlight, highBand);

  float glow = smoothstep(0.52, 0.95, structure) * (0.35 + 0.5 * u_flowStrength);
  col += glow * u_colorHighlight * 0.35;

  float verticalMask = smoothstep(1.05, 0.05, uv.y);
  verticalMask = pow(verticalMask, 1.1);

  float vignette = smoothstep(1.28, 0.36, length(uv - 0.5));
  col *= mix(0.9, 1.05, vignette);

  col = applyContrast(col, u_contrast);

  float dither = (hash(gl_FragCoord.xy + t * 10.0) - 0.5) * u_grain;
  col += dither;

  float alpha = mix(0.72, 1.0, verticalMask * smoothstep(0.05, 0.9, structure));
  alpha *= smoothstep(0.0, 0.22, u_reveal - uv.x * 0.85);
  alpha *= u_opacity;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`;

const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{6}$/;
const FALLBACK_DEEP = "#04050b";
const FALLBACK_MID = "#134d93";
const FALLBACK_HIGHLIGHT = "#8cecff";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sanitizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return fallback;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function hexToRgb01(hex: string): [number, number, number] {
  const normalized = sanitizeHexColor(hex, FALLBACK_DEEP).replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export interface WebGLLiquidProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  description?: string;
  colorDeep?: string;
  colorMid?: string;
  colorHighlight?: string;
  speed?: number;
  flowStrength?: number;
  grain?: number;
  contrast?: number;
  opacity?: number;
  reveal?: boolean;
  delayMs?: number;
  revealDuration?: number;
  /** Background-only layer (no hero copy). */
  backgroundOnly?: boolean;
  children?: ReactNode;
}

function LiquidFallback({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("webgl-liquid-fallback", className)}
    />
  );
}

export function WebGLLiquid({
  title,
  subtitle,
  description,
  colorDeep = FALLBACK_DEEP,
  colorMid = FALLBACK_MID,
  colorHighlight = FALLBACK_HIGHLIGHT,
  speed = 1,
  flowStrength = 1,
  grain = 0.05,
  contrast = 1.1,
  opacity = 0.95,
  reveal = true,
  delayMs = 0,
  revealDuration = 1.2,
  backgroundOnly = false,
  className,
  children,
  style,
  ...props
}: WebGLLiquidProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hasWebGLError, setHasWebGLError] = useState(false);

  const settings = useMemo(
    () => ({
      colorDeep,
      colorMid,
      colorHighlight,
      speed,
      flowStrength,
      grain,
      contrast,
      opacity,
      reveal,
      delayMs,
      revealDuration,
    }),
    [
      colorDeep,
      colorMid,
      colorHighlight,
      speed,
      flowStrength,
      grain,
      contrast,
      opacity,
      reveal,
      delayMs,
      revealDuration,
    ],
  );

  useEffect(() => {
    if (hasWebGLError) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setHasWebGLError(true);
      return;
    }

    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    try {
      const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
      if (!gl) {
        setHasWebGLError(true);
        return;
      }

      const compileShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vertexShader || !fragmentShader) {
        setHasWebGLError(true);
        return;
      }

      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        setHasWebGLError(true);
        return;
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        setHasWebGLError(true);
        return;
      }

      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const positionLocation = gl.getAttribLocation(program, "position");
      const quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      const uRes = gl.getUniformLocation(program, "u_res");
      const uTime = gl.getUniformLocation(program, "u_time");
      const uColorDeep = gl.getUniformLocation(program, "u_colorDeep");
      const uColorMid = gl.getUniformLocation(program, "u_colorMid");
      const uColorHighlight = gl.getUniformLocation(program, "u_colorHighlight");
      const uSpeed = gl.getUniformLocation(program, "u_speed");
      const uFlowStrength = gl.getUniformLocation(program, "u_flowStrength");
      const uGrain = gl.getUniformLocation(program, "u_grain");
      const uContrast = gl.getUniformLocation(program, "u_contrast");
      const uOpacity = gl.getUniformLocation(program, "u_opacity");
      const uReveal = gl.getUniformLocation(program, "u_reveal");

      if (
        !uRes ||
        !uTime ||
        !uColorDeep ||
        !uColorMid ||
        !uColorHighlight ||
        !uSpeed ||
        !uFlowStrength ||
        !uGrain ||
        !uContrast ||
        !uOpacity ||
        !uReveal
      ) {
        gl.deleteBuffer(quadBuffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        setHasWebGLError(true);
        return;
      }

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = host.getBoundingClientRect();
        const width = Math.max(
          rect.width,
          host.clientWidth,
          window.innerWidth,
          1,
        );
        const height = Math.max(
          rect.height,
          host.clientHeight,
          window.innerHeight,
          1,
        );
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
      };

      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      window.addEventListener("resize", resize);

      let rafId = 0;
      const start = performance.now();

      const render = (now: number) => {
        const elapsedSec = Math.max(0, (now - start - settings.delayMs) / 1000);
        const revealProgress = settings.reveal
          ? Math.min(1, elapsedSec / Math.max(settings.revealDuration, 0.05))
          : 1;

        const deep = hexToRgb01(settings.colorDeep);
        const mid = hexToRgb01(settings.colorMid);
        const highlight = hexToRgb01(settings.colorHighlight);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.uniform1f(uTime, elapsedSec);
        gl.uniform3f(uColorDeep, deep[0], deep[1], deep[2]);
        gl.uniform3f(uColorMid, mid[0], mid[1], mid[2]);
        gl.uniform3f(uColorHighlight, highlight[0], highlight[1], highlight[2]);
        gl.uniform1f(uSpeed, settings.speed);
        gl.uniform1f(uFlowStrength, settings.flowStrength);
        gl.uniform1f(uGrain, settings.grain);
        gl.uniform1f(uContrast, settings.contrast);
        gl.uniform1f(uOpacity, settings.opacity);
        gl.uniform1f(uReveal, revealProgress);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        rafId = requestAnimationFrame(render);
      };

      rafId = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        window.removeEventListener("resize", resize);
        gl.deleteBuffer(quadBuffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      };
    } catch {
      setHasWebGLError(true);
      return;
    }
  }, [hasWebGLError, settings]);

  const showCopy = Boolean(title || subtitle || description || children);
  const mergedStyle: CSSProperties = {
    containerType: "size",
    ...style,
  };

  const body = (
    <>
      {hasWebGLError ? (
        <LiquidFallback className="absolute inset-0 h-full w-full" />
      ) : (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/35 via-black/15 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_65%_40%,rgba(255,255,255,0.16),transparent_45%)]" />
      {showCopy ? (
        <div className="relative z-10 mx-auto w-full max-w-[1240px] px-6 py-20 md:px-10 md:py-28">
          <div className="max-w-[760px]">
            {title ? (
              <h1 className="pb-[0.08em] text-[11cqi] leading-[0.92] font-semibold tracking-[-0.03em] text-white md:text-[7cqi] lg:text-[5.5cqi]">
                {title}
              </h1>
            ) : null}
            {subtitle ? (
              <h2 className="mt-2 text-[11cqi] leading-[0.9] font-bold tracking-[-0.03em] text-white/95 md:text-[7cqi] lg:text-[5.5cqi]">
                {subtitle}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-6 max-w-[620px] text-base leading-relaxed text-white/75 md:text-xl">
                {description}
              </p>
            ) : null}
            {children ? <div className="mt-10">{children}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div
      ref={hostRef}
      className={cn(
        backgroundOnly
          ? "webgl-liquid-bg dash-liquid-bg"
          : "relative flex min-h-screen w-full items-center overflow-hidden bg-[#02040b] text-white",
        className,
      )}
      style={mergedStyle}
      {...props}
    >
      {body}
    </div>
  );
}

/** Fixed full-page liquid field for Clutch slate / command center. */
export function WebGLLiquidBackground({
  className,
}: {
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <WebGLLiquid
      backgroundOnly
      aria-hidden="true"
      className={cn("dash-liquid-bg webgl-liquid-bg", className)}
      colorDeep="#04050b"
      colorMid="#0f3d74"
      colorHighlight="#5eb8d4"
      speed={0.85}
      flowStrength={0.85}
      grain={0.04}
      contrast={1.02}
      opacity={0.48}
      reveal={false}
      revealDuration={0.01}
    />,
    document.body,
  );
}

export default WebGLLiquid;
