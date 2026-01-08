import { useContext } from "react";
import { SocketContext } from "./SocketContext";

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket deve essere usato dentro <SocketProvider />");
  }
  return ctx;
}
