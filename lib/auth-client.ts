"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Client-side BetterAuth handle for the creator surface. Same-origin (app
 * origin); never imported by `app/(viewer)` code.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
