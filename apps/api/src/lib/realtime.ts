import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { prisma } from "@codearena/database";
import type { ApiEnv } from "@codearena/config";
import { REALTIME_CHANNEL, socketRoom, type RealtimeEvent } from "@codearena/shared";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt.js";
import { logger } from "./logger.js";

export interface RealtimeHandle {
  io: SocketIOServer;
  close: () => Promise<void>;
}

function auth(socket: Socket): AccessTokenPayload {
  return socket.data.auth as AccessTokenPayload;
}

/**
 * Sets up Socket.IO for real-time submission status and leaderboard
 * updates (PRD §8/§11). Uses the Redis adapter so `io.to(room).emit(...)`
 * reaches clients connected to any horizontally-scaled API instance, and a
 * separate plain Redis subscription on `REALTIME_CHANNEL` so judge-worker
 * — which has no Socket.IO server of its own — can trigger a broadcast on
 * whichever API instance forwards it.
 */
export function createRealtimeServer(httpServer: HttpServer, env: ApiEnv): RealtimeHandle {
  const pubClient = new Redis(env.REDIS_URL);
  const subClient = pubClient.duplicate();
  const eventsSubscriber = new Redis(env.REDIS_URL);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    adapter: createAdapter(pubClient, subClient),
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }
    try {
      socket.data.auth = verifyAccessToken(env, token);
      next();
    } catch {
      next(new Error("Invalid or expired access token"));
    }
  });

  io.on("connection", (socket) => {
    // "Users may join only authorized rooms" (PRD §8): a submission's
    // room is owner-or-admin only; a private contest's room requires
    // registration (or admin).
    socket.on("join:submission", (submissionId: unknown) => {
      void handleJoinSubmission(socket, submissionId);
    });

    socket.on("join:contest", (contestId: unknown) => {
      void handleJoinContest(socket, contestId);
    });
  });

  void eventsSubscriber
    .subscribe(REALTIME_CHANNEL)
    .catch((err) => logger.error({ err }, "Failed to subscribe to realtime channel"));

  eventsSubscriber.on("message", (_channel, message) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message) as RealtimeEvent;
    } catch (err) {
      logger.warn({ err }, "Received malformed realtime event");
      return;
    }

    if (event.type === "submission") {
      io.to(socketRoom.submission(event.submissionId)).emit("submission:update", event);
    } else if (event.type === "leaderboard") {
      io.to(socketRoom.contest(event.contestId)).emit("leaderboard:update", event);
    }
  });

  return {
    io,
    close: async () => {
      io.close();
      await Promise.allSettled([pubClient.quit(), subClient.quit(), eventsSubscriber.quit()]);
    },
  };
}

async function handleJoinSubmission(socket: Socket, submissionId: unknown): Promise<void> {
  if (typeof submissionId !== "string") return;
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { userId: true },
  });
  if (!submission) return;

  const { sub, role } = auth(socket);
  if (submission.userId !== sub && role !== "ADMIN") return;

  await socket.join(socketRoom.submission(submissionId));
}

async function handleJoinContest(socket: Socket, contestId: unknown): Promise<void> {
  if (typeof contestId !== "string") return;
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    select: { visibility: true },
  });
  if (!contest) return;

  const { sub, role } = auth(socket);
  if (contest.visibility === "PRIVATE" && role !== "ADMIN") {
    const registration = await prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId, userId: sub } },
    });
    if (!registration) return;
  }

  await socket.join(socketRoom.contest(contestId));
}
