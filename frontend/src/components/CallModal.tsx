// frontend/src/components/CallModal.tsx
// Video-call only (fase 5 base). Rimossi tutti i riferimenti alla call voce.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { User } from "../types/api";

export type IncomingOffer = {
  roomId: number;
  fromUserId: number;
  sdp: RTCSessionDescriptionInit;
};

type Props = {
  role: "caller" | "callee";
  roomId: number;
  otherUser: User | null;
  socket: Socket;
  incomingOffer: IncomingOffer | null;
  onClose: () => void;
};

type Phase = "IDLE" | "CALLING" | "RINGING" | "IN_CALL";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isSdpLike(x: unknown): x is RTCSessionDescriptionInit {
  if (!isRecord(x)) return false;
  const t = x.type;
  return t === "offer" || t === "answer";
}

function isIceLike(x: unknown): x is RTCIceCandidateInit {
  return isRecord(x); // permissivo
}

export default function CallModal({
  role,
  roomId,
  otherUser,
  socket,
  incomingOffer,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>(() =>
    role === "callee" ? "RINGING" : "CALLING"
  );
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const otherLabel = otherUser
    ? otherUser.email || `User #${otherUser.id}`
    : "altro utente";

  const rtcConfig = useMemo<RTCConfiguration>(
    () => ({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    }),
    []
  );

  const mediaConstraints = useMemo<MediaStreamConstraints>(
    () => ({ audio: true, video: true }),
    []
  );

  const cleanup = useCallback(() => {
    // ❌ niente optional chaining in assegnazione (TS2779)
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // ignore
      }
    }
    pcRef.current = null;

    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
    }
    localStreamRef.current = null;

    if (remoteStreamRef.current) {
      for (const t of remoteStreamRef.current.getTracks()) t.stop();
    }
    remoteStreamRef.current = null;

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const hangup = useCallback(() => {
    try {
      socket.emit("webrtc:hangup", { roomId });
    } catch {
      // ignore
    }
    cleanup();
    onClose();
  }, [cleanup, onClose, roomId, socket]);

  const setupPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      socket.emit("webrtc:ice", { roomId, candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams?.[0];
      if (!stream) return;
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed") {
        hangup();
      }
    };

    const localStream = await navigator.mediaDevices.getUserMedia(
      mediaConstraints
    );
    localStreamRef.current = localStream;

    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }

    return pc;
  }, [hangup, mediaConstraints, roomId, rtcConfig, socket]);

  const startCallerFlow = useCallback(async () => {
    setError(null);

    const pc = await setupPeerConnection();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("webrtc:offer", { roomId, sdp: offer }, (ackRaw: unknown) => {
      if (!ackRaw || typeof ackRaw !== "object") return;
      const ack = ackRaw as { ok?: boolean; error?: string };
      if (ack.ok === false) {
        setError(ack.error || "Offer non consegnata");
      }
    });

    setPhase("CALLING");
  }, [roomId, setupPeerConnection, socket]);

  const accept = useCallback(async () => {
    if (!incomingOffer) return;

    setError(null);
    const pc = await setupPeerConnection();

    try {
      await pc.setRemoteDescription(incomingOffer.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit(
        "webrtc:answer",
        { roomId, sdp: answer },
        (ackRaw: unknown) => {
          if (!ackRaw || typeof ackRaw !== "object") return;
          const ack = ackRaw as { ok?: boolean; error?: string };
          if (ack.ok === false) {
            setError(ack.error || "Answer non consegnata");
          }
        }
      );

      setPhase("IN_CALL");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore accept()";
      setError(msg);
    }
  }, [incomingOffer, roomId, setupPeerConnection, socket]);

  // Listener answer (caller) ✅ ignora duplicati
  useEffect(() => {
    const onAnswer = async (payload: unknown) => {
      // ✅ solo il caller deve processare answer
      if (role !== "caller") return;

      const pc = pcRef.current;
      if (!pc) return;

      if (!isRecord(payload)) return;
      if (typeof payload.roomId !== "number") return;
      if (payload.roomId !== roomId) return;
      if (!isSdpLike(payload.sdp)) return;

      // ✅ anti-doppio answer
      if (pc.currentRemoteDescription?.type === "answer") return;
      if (pc.signalingState === "stable") return;

      try {
        await pc.setRemoteDescription(payload.sdp);
        setPhase("IN_CALL");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore answer";
        setError(msg);
      }
    };

    socket.on("webrtc:answer", onAnswer);
    return () => {
      socket.off("webrtc:answer", onAnswer);
    };
  }, [role, roomId, socket]);

  // Listener ICE
  useEffect(() => {
    const onIce = async (payload: unknown) => {
      const pc = pcRef.current;
      if (!pc) return;
      if (!isRecord(payload)) return;
      if (typeof payload.roomId !== "number") return;
      if (payload.roomId !== roomId) return;
      if (!isIceLike(payload.candidate)) return;

      try {
        await pc.addIceCandidate(payload.candidate);
      } catch {
        // ignore
      }
    };

    socket.on("webrtc:ice", onIce);
    return () => {
      socket.off("webrtc:ice", onIce);
    };
  }, [roomId, socket]);

  // Listener hangup
  useEffect(() => {
    const onHangup = (payload: unknown) => {
      if (!isRecord(payload)) return;
      if (typeof payload.roomId !== "number") return;
      if (payload.roomId !== roomId) return;

      cleanup();
      onClose();
    };

    socket.on("webrtc:hangup", onHangup);
    return () => {
      socket.off("webrtc:hangup", onHangup);
    };
  }, [cleanup, onClose, roomId, socket]);

  // Auto-start caller
  useEffect(() => {
    if (role !== "caller") return;
    const t = window.setTimeout(() => {
      void startCallerFlow();
    }, 0);
    return () => window.clearTimeout(t);
  }, [role, startCallerFlow]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(1000px, 100%)",
          background: "white",
          borderRadius: 12,
          padding: 14,
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>
              Video call {role === "caller" ? "a" : "da"} {otherLabel}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              roomId={roomId} — fase: {phase}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {role === "callee" && phase === "RINGING" && (
              <button onClick={() => void accept()}>Accetta</button>
            )}
            <button onClick={hangup}>Chiudi</button>
          </div>
        </div>

        {error && (
          <div style={{ color: "red", marginTop: 10, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 12,
          }}
        >
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              background: "#0b0b0b",
              aspectRatio: "16/9",
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
              background: "#0b0b0b",
              aspectRatio: "16/9",
            }}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Nota: la call voce è stata rimossa. Qui resta solo la video call.
        </div>
      </div>
    </div>
  );
}
