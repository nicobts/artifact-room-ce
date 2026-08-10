import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * BetterAuth handler (app origin only — blocked on the viewer origin by
 * proxy.ts). Handles /api/auth/* for the creator identity system.
 */
export const { GET, POST } = toNextJsHandler(auth);
