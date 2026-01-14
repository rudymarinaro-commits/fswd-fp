import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import type { User } from "../types/api";
import styles from "./CallModal.module.css";

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
  const [phase, setPhase] = useState<Phase>(role === "caller" ? "CALLING" : "RINGING");
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const otherLabel = otherUser ? otherUser.email || `User #${otherUser.id}` : "altro utente";

  const rtcConfig = useMemo<RTCConfiguration>(
    () => ({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }),
    []
  );

  const mediaConstraints = useMemo<MediaStreamConstraints>(
    () => ({ audio: true, video: true }),
    []
  );

  const cleanup = useCallback(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
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

  const ensureMediaAndPc = useCallback(async () => {
    setError(null);

    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }

    if (!pcRef.current) {
      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      for (const track of localStreamRef.current!.getTracks()) {
        pc.addTrack(track, localStreamRef.current!);
      }

      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (remoteVideoRef.current && stream) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit("webrtc:ice", { roomId, ice: ev.candidate.toJSON() });
        }
      };
    }

    return pcRef.current!;
  }, [mediaConstraints, roomId, rtcConfig, socket]);

  const startCaller = useCallback(async () => {
    try {
      const pc = await ensureMediaAndPc();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("webrtc:offer", { roomId, sdp: offer });

      setPhase("CALLING");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore avvio chiamata";
      setError(msg);
    }
  }, [ensureMediaAndPc, roomId, socket]);

  const accept = useCallback(async () => {
    try {
      if (!incomingOffer?.sdp) {
        setError("Offerta mancante");
        return;
      }

      const pc = await ensureMediaAndPc();

      await pc.setRemoteDescription(incomingOffer.sdp);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc:answer", { roomId, sdp: answer });

      setPhase("IN_CALL");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore accettazione chiamata";
      setError(msg);
    }
  }, [ensureMediaAndPc, incomingOffer?.sdp, roomId, socket]);

  // Caller starts immediately
  useEffect(() => {
    if (role !== "caller") return;
    void startCaller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC chiude
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Socket listeners
  useEffect(() => {
    const onAnswer = async (payload: unknown) => {
      if (!isRecord(payload)) return;
      const sdp = payload.sdp;
      if (!isSdpLike(sdp)) return;

      try {
        const pc = await ensureMediaAndPc();
        await pc.setRemoteDescription(sdp);
        setPhase("IN_CALL");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore set answer";
        setError(msg);
      }
    };

    const onIce = async (payload: unknown) => {
      if (!isRecord(payload)) return;
      const ice = payload.ice;
      if (!isIceLike(ice)) return;

      try {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.addIceCandidate(ice);
      } catch {
        // ignore
      }
    };

    const onHangup = () => {
      cleanup();
      onClose();
    };

    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice", onIce);
    socket.on("webrtc:hangup", onHangup);

    return () => {
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice", onIce);
      socket.off("webrtc:hangup", onHangup);
    };
  }, [cleanup, ensureMediaAndPc, onClose, socket]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const title = role === "caller" ? `Video call a ${otherLabel}` : `Video call da ${otherLabel}`;

  const phaseLabel =
    phase === "CALLING"
      ? "Sto chiamando…"
      : phase === "RINGING"
      ? "Sta squillando…"
      : phase === "IN_CALL"
      ? "In chiamata"
      : "Pronto";

  const phaseClass =
    phase === "CALLING"
      ? styles.phaseCalling
      : phase === "RINGING"
      ? styles.phaseRinging
      : phase === "IN_CALL"
      ? styles.phaseInCall
      : styles.phaseIdle;

  const node = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // chiudi cliccando fuori (opzionale ma comodo)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.title}>{title}</div>

            <div className={styles.metaRow}>
              <div className={styles.meta}>roomId={roomId}</div>

              <span className={`${styles.phase} ${phaseClass}`}>
                <span className={styles.phaseDot} aria-hidden="true" />
                {phaseLabel}
              </span>
            </div>

            {error && <div className={styles.error}>{error}</div>}
          </div>

          <div className={styles.headerRight}>
            <div className={styles.btnRow}>
              {phase === "RINGING" && role === "callee" && (
                <button
                  type="button"
                  onClick={() => void accept()}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  Accetta
                </button>
              )}

              <button type="button" onClick={hangup} className={`${styles.btn} ${styles.btnDanger}`}>
                Riaggancia
              </button>

              <button type="button" onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
                Chiudi
              </button>
            </div>
          </div>
        </div>

        <div className={styles.videos}>
          <div className={styles.videoFrame}>
            <div className={styles.videoLabel}>Tu</div>
            <video ref={localVideoRef} muted autoPlay playsInline className={styles.video} />
          </div>

          <div className={styles.videoFrame}>
            <div className={styles.videoLabel}>{otherLabel}</div>
            <video ref={remoteVideoRef} autoPlay playsInline className={styles.video} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
