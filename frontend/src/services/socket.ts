import { io } from "socket.io-client";

export const socket = io("http://localhost:3000", {
  autoConnect: false,
});

// helper per settare token prima di connect()
export function setSocketToken(token: string) {
  socket.auth = { token };
}
