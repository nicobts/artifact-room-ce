import { cn } from "@/lib/utils";

/**
 * Artifact Room brand mark — "an artifact in the room."
 *
 * A rounded-square room frame (the sandboxed viewer) holds the Material
 * Symbols `art_track` glyph — a framed artwork beside its gallery rails.
 * The room frame, artwork frame, and rails use `currentColor`, so the mark
 * adapts to its surface (dark on the light auth pages, light on the navy
 * console sidebar), while the mountains — the artwork itself — stay
 * ember. Decorative by default — always paired with the "Artifact Room"
 * wordmark, so it is marked aria-hidden.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-6", className)}
    >
      {/* the "room" / sandbox frame */}
      <rect
        x="2.75"
        y="2.75"
        width="18.5"
        height="18.5"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {/* the artwork (Material Symbols art_track, viewBox 0 -960 960 960) */}
      <g transform="translate(4.56 19.44) scale(0.0155)">
        {/* artwork frame + rails */}
        <path
          fill="currentColor"
          d="M120-200q-33 0-56.5-23.5T40-280v-400q0-33 23.5-56.5T120-760h400q33 0 56.5 23.5T600-680v400q0 33-23.5 56.5T520-200H120Zm0-80h400v-400H120v400Zm560 80v-560h80v560h-80Zm160 0v-560h80v560h-80Z"
        />
        {/* ember accent — the mountains, the artifact in the frame */}
        <path
          className="fill-ember"
          d="M160-360h320L376-500l-76 100-56-74-84 114Z"
        />
      </g>
    </svg>
  );
}
