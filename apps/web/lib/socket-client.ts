import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;
let socketToken: string | null = null;

/**
 * One shared socket per access token, reused across hooks/pages instead of
 * opening a new connection per component. Requires auth (PRD §8: "Users
 * may join only authorized rooms") — anonymous visitors fall back to the
 * REST polling already built into the pages that use this.
 */
export function getSocket(accessToken: string): Socket {
  if (socket && socketToken === accessToken) return socket;
  socket?.disconnect();
  socket = io(SOCKET_URL, { auth: { token: accessToken } });
  socketToken = accessToken;
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
