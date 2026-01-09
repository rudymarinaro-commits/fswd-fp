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

  // Solo per callee: offer ricevuta (gestita da Chat.tsx)
  incomingOffer?: IncomingOffer | null;

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
  return isRecord(x);
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

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // ✅ Evita setRemoteDescription concorrenti (answer duplicata ravvicinata)
  const applyingAnswerRef = useRef<boolean>(false);

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
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
    }

    pcRef.current = null;

    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
    }

    localStreamRef.current = null;
    applyingAnswerRef.current = false;
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
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
    }

    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      socket.emit("webrtc:ice", { roomId, candidate: ev.candidate }, () => {
        // ack ignored
      });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams?.[0];
      if (!stream) return;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
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
      if (ack.ok === false) setError(ack.error || "Offer non consegnata");
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
          if (ack.ok === false) setError(ack.error || "Answer non consegnata");
        }
      );

      setPhase("IN_CALL");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore accept()";
      setError(msg);
    }
  }, [incomingOffer, roomId, setupPeerConnection, socket]);

  // Listener answer (caller) ✅ anti-doppio + anti-concorrenza
  useEffect(() => {
    const onAnswer = async (payload: unknown) => {
      if (role !== "caller") return;

      const pc = pcRef.current;
      if (!pc) return;

      if (!isRecord(payload)) return;
      if (typeof payload.roomId !== "number") return;
      if (payload.roomId !== roomId) return;
      if (!isSdpLike(payload.sdp)) return;

      if (applyingAnswerRef.current) return;
      if (pc.currentRemoteDescription?.type === "answer") return;
      if (pc.signalingState !== "have-local-offer") return;

      applyingAnswerRef.current = true;
      try {
        await pc.setRemoteDescription(payload.sdp);
        setPhase("IN_CALL");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore answer";
        setError(msg);
      } finally {
        applyingAnswerRef.current = false;
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
    void startCallerFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const title =
    role === "caller"
      ? `Video call a ${otherLabel}`
      : `Video call da ${otherLabel}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              roomId={roomId} — fase: {phase}
            </div>
            {error && (
              <div style={{ marginTop: 8, color: "crimson", fontSize: 12 }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {phase === "RINGING" && role === "callee" && (
              <button
                onClick={() => void accept()}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Accetta
              </button>
            )}

            <button
              onClick={hangup}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Chiudi
            </button>
          </div>
        </div>

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
              muted
              autoPlay
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
      </div>
    </div>
  );
}
