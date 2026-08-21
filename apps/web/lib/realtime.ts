"use client";

import { useEffect, useRef } from "react";
import type { LeaderboardRealtimeEvent, SubmissionRealtimeEvent } from "@codearena/shared";
import { getSocket } from "./socket-client";

/**
 * Instant push on top of (not instead of) each page's REST polling: a
 * dropped/never-established socket just means the poll interval keeps
 * things eventually consistent, so there's no hard dependency on sockets
 * actually connecting.
 */
export function useSubmissionRealtime(
  accessToken: string | null,
  submissionId: string | null,
  onUpdate: (event: SubmissionRealtimeEvent) => void,
): void {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  useEffect(() => {
    if (!accessToken || !submissionId) return;
    const socket = getSocket(accessToken);
    socket.emit("join:submission", submissionId);

    const handler = (event: SubmissionRealtimeEvent) => {
      if (event.submissionId === submissionId) handlerRef.current(event);
    };
    socket.on("submission:update", handler);
    return () => {
      socket.off("submission:update", handler);
    };
  }, [accessToken, submissionId]);
}

export function useLeaderboardRealtime(
  accessToken: string | null,
  contestId: string | null,
  onUpdate: (event: LeaderboardRealtimeEvent) => void,
): void {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  useEffect(() => {
    if (!accessToken || !contestId) return;
    const socket = getSocket(accessToken);
    socket.emit("join:contest", contestId);

    const handler = (event: LeaderboardRealtimeEvent) => {
      if (event.contestId === contestId) handlerRef.current(event);
    };
    socket.on("leaderboard:update", handler);
    return () => {
      socket.off("leaderboard:update", handler);
    };
  }, [accessToken, contestId]);
}
