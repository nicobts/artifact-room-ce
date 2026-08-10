"use client";

import { useEffect, useRef, useState } from "react";
import {
  validateShimMessage,
  type ShimMessage,
} from "@/lib/viewer-shim/protocol";

// Shim-emitted types we forward to the beacon. `view` is
// deliberately absent: the sandboxed document executes — and posts its view —
// while the shell is still hydrating, so a shim-sent `view` can arrive before
// this listener exists and be lost. The shell emits the pageview itself below;
// incoming shim `view` messages (load + the 2s repost) are never queued —
// they only ever carry region-detection metadata for the shell's own view.
const PERSIST = new Set<ShimMessage["type"]>(["slide_view", "dwell"]);

/** A queued event may carry the shim's (already-validated) detection payload. */
type QueuedEvent = ShimMessage & {
  metadata?: { detection: NonNullable<ShimMessage["detection"]> };
};

/** Cookieless first-party viewer id, minted in viewer-origin storage. */
function getClientId(): string {
  try {
    const key = "ar_cid";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Mounts the artifact in a sandboxed iframe (opaque origin), validates the
 * measurement channel by SHAPE + source, batches persistable events, and flushes
 * them to the cookieless beacon (keepalive / sendBeacon on unload).
 */
export function ViewerFrame({ token }: { token: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const clientId = getClientId();
    const queue: QueuedEvent[] = [];

    function send(useBeacon = false) {
      if (queue.length === 0) return;
      const batch = queue.splice(0, queue.length);
      const body = JSON.stringify({ token, clientId, events: batch });
      try {
        if (useBeacon && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/public/beacon",
            new Blob([body], { type: "application/json" }),
          );
        } else {
          void fetch("/api/public/beacon", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        /* best-effort */
      }
    }

    // Region-detection metadata, carried on the shim's `view` message(s), is
    // stitched onto the shell's own (single, de-duped) pageview — never onto
    // a shim-sent `view`, which is dropped as an event and read only for its
    // `detection` payload. `detectionAttached` makes this idempotent across
    // the load post and the shim's 2s repost: first detection wins.
    let detection: ShimMessage["detection"] | null = null;
    let detectionAttached = false;

    // The pageview. Emitted here — not forwarded from the shim — because the
    // shell mounting the frame IS the open, and this path cannot lose the
    // hydration race (see PERSIST above). Held (unsent) for up to 2200ms —
    // past the shim's 2000ms detection repost — so a detection payload can
    // ride along on it instead of a separate later event. Whether the view
    // is still eligible to receive that metadata is answered by
    // `queue.includes(viewEvent)`, not a separate flag: any flush (the hold
    // timer, but also a "hidden" message, a full batch, or pagehide) can
    // empty the queue first, and mutating an already-sent event would be a
    // silent drop.
    const viewEvent: QueuedEvent = { v: 1, type: "view" };
    queue.push(viewEvent);
    let viewHold: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      viewHold = null;
      send();
    }, 2200);

    function onMessage(e: MessageEvent) {
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      const msg = validateShimMessage(e.data);
      if (!msg) return;
      if (msg.type === "blocked") {
        setBlocked(true);
        return;
      }
      if (msg.type === "hidden") {
        send(true);
        return;
      }
      if (msg.type === "visible") return;
      if (msg.type === "view") {
        // Detection carrier only (load + repost) — never queued as a view.
        if (msg.detection && !detectionAttached) {
          detection = msg.detection;
          if (queue.includes(viewEvent)) {
            viewEvent.metadata = { detection };
            detectionAttached = true;
            if (viewHold) {
              clearTimeout(viewHold);
              viewHold = null;
            }
            send();
          }
          // else: view already sent without it — attach to the next
          // slide_view/dwell pushed to the queue, below.
        }
        return;
      }
      if (PERSIST.has(msg.type)) {
        const event: QueuedEvent = msg;
        if (detection && !detectionAttached) {
          event.metadata = { detection };
          detectionAttached = true;
        }
        queue.push(event);
        if (queue.length >= 10) send();
      }
    }

    window.addEventListener("message", onMessage);

    const interval = setInterval(() => send(), 5000);
    const onHide = () => send(true);
    window.addEventListener("pagehide", onHide);

    return () => {
      clearInterval(interval);
      if (viewHold) clearTimeout(viewHold);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onHide);
      send(true);
    };
  }, [token]);

  return (
    <div className="relative min-h-dvh bg-background">
      {blocked && (
        <div className="absolute inset-x-0 top-0 z-10 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Some external resources in this artifact were blocked for safety.
        </div>
      )}
      <iframe
        ref={frameRef}
        title="Artifact"
        src={`/v/${token}/raw`}
        sandbox="allow-scripts"
        className="h-dvh w-full border-0"
      />
    </div>
  );
}
