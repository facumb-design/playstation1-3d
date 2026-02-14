import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════
   SHARED UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useVideoTime(videoRef) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef(null);
  const lastSecRef = useRef(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.duration && isFinite(video.duration)) setDuration(video.duration);
    setCurrentTime(video.currentTime);
    lastSecRef.current = Math.floor(video.currentTime);

    const onMeta = () => {
      if (isFinite(video.duration)) setDuration(video.duration);
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);

    let running = true;
    const tick = () => {
      if (!running) return;
      const sec = Math.floor(video.currentTime);
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;
        setCurrentTime(video.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
    };
  }, [videoRef]);

  return { currentTime, duration };
}

/* ═══════════════════════════════════════════════════════════════════
   NOISE TEXTURES
   ═══════════════════════════════════════════════════════════════════ */

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`;

/* ═══════════════════════════════════════════════════════════════════
   CSS – hover/active + static animation
   ═══════════════════════════════════════════════════════════════════ */

const INJECTED_CSS = `
  .vhs-btn {
    transition: filter 0.1s, transform 0.05s, box-shadow 0.1s;
  }
  .vhs-btn:hover {
    filter: brightness(1.12);
  }
  .vhs-btn:active {
    filter: brightness(0.95);
    transform: translateY(1px);
    box-shadow:
      0 1px 2px rgba(0,0,0,0.5),
      inset 0 2px 3px rgba(0,0,0,0.25) !important;
  }
  .vhs-fader-knob {
    transition: transform 0.1s;
  }
  .vhs-fader-knob:hover {
    transform: scaleY(1.1);
  }
  .vhs-round-btn {
    transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.12s ease;
  }
  .vhs-round-btn:hover {
    transform: translateY(-1px);
    filter: brightness(1.08);
  }
  .vhs-round-btn:active {
    transform: translateY(1px);
    filter: brightness(0.95);
  }
`;

/* ═══════════════════════════════════════════════════════════════════
   COLORS
   ═══════════════════════════════════════════════════════════════════ */

const VHS = {
  body: "#141414",
  bodyGrad: "linear-gradient(180deg, #1e1e1e 0%, #141414 40%, #111 100%)",
  chrome: "linear-gradient(180deg, #888 0%, #555 50%, #777 100%)",
  led: "#ff3333",
  ledDim: "#441111",
  ledBg: "#080808",
  btnFace: "#2a2a2a",
  btnBorder: "#3a3a3a",
  text: "#777",
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function VideoControls({
  videoRef,
  isPlaying,
  currentVideoIndex,
  videos,
  onPlayPause,
  onSeek,
  onSwitchVideo,
  onHide,
  onResetAll,
  actionLayout = "rightTransport",
}) {
  const { currentTime, duration } = useVideoTime(videoRef);
  const [volume, setVolume] = useState(1);
  const lastNonZeroVolumeRef = useRef(1);

  // Sync volume on mount
  useEffect(() => {
    if (videoRef.current) {
      setVolume(videoRef.current.volume);
    }
  }, [videoRef]);

  // ── Hide handler ────────────────────────────────────────────
  const startHide = useCallback(() => {
    onHide?.();
  }, [onHide]);

  // ── H key to hide (works in all modes) ──────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "h" || e.key === "H") startHide();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startHide]);

  // ── Handlers ────────────────────────────────────────────────
  const handleVolumeChange = useCallback(
    (newVol) => {
      const clamped = Math.max(0, Math.min(1, newVol));
      setVolume(clamped);
      if (videoRef.current) videoRef.current.volume = clamped;
    },
    [videoRef],
  );

  const handleProgressClick = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      if (videoRef.current && duration) {
        videoRef.current.currentTime = ratio * duration;
      }
    },
    [videoRef, duration],
  );

  const progress = duration > 0 ? currentTime / duration : 0;
  const currentVideo = videos[currentVideoIndex];

  const handlePrevVideo = useCallback(() => {
    const prev = (currentVideoIndex - 1 + videos.length) % videos.length;
    onSwitchVideo(prev);
  }, [currentVideoIndex, videos.length, onSwitchVideo]);

  const handleNextVideo = useCallback(() => {
    const next = (currentVideoIndex + 1) % videos.length;
    onSwitchVideo(next);
  }, [currentVideoIndex, videos.length, onSwitchVideo]);

  const handleVolClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    handleVolumeChange(ratio);
  };

  const handleVolLabelClick = useCallback(() => {
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
      handleVolumeChange(0);
      return;
    }
    const restored =
      lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 1;
    handleVolumeChange(restored);
  }, [volume, handleVolumeChange]);

  /* ── Styles ──────────────────────────────────────────────────── */

  const panel = {
    background: VHS.bodyGrad,
    backgroundImage: NOISE_SVG,
    backgroundBlendMode: "overlay",
    border: "1px solid #2a2a2a",
    borderRadius: 5,
    padding: 0,
    width: 380,
    boxShadow:
      "0 8px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
    overflow: "hidden",
    position: "relative",
  };

  const trinitronStrip = {
    height: 2,
    background:
      "linear-gradient(90deg, #e22 0%, #e22 33.3%, #2d2 33.3%, #2d2 66.6%, #44f 66.6%, #44f 100%)",
  };

  const chromeTrim = {
    height: 2,
    background: VHS.chrome,
  };

  const ledPanel = {
    margin: "10px 12px 8px",
    padding: "8px 12px",
    background: VHS.ledBg,
    borderRadius: 3,
    border: "1px solid #1a1a1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow:
      "inset 0 2px 6px rgba(0,0,0,0.9), inset 0 0 12px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.03)",
  };

  const ledText = {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 16,
    color: VHS.led,
    letterSpacing: 2,
    textShadow: "0 0 6px rgba(255,51,51,0.7), 0 0 14px rgba(255,51,51,0.3)",
  };

  const ledLabel = {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: VHS.led,
    opacity: 0.7,
    letterSpacing: 1,
    maxWidth: 170,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textShadow: "0 0 4px rgba(255,51,51,0.4)",
  };

  const statusDot = {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: isPlaying ? VHS.led : VHS.ledDim,
    boxShadow: isPlaying
      ? `0 0 4px ${VHS.led}, 0 0 10px rgba(255,51,51,0.4)`
      : "none",
    marginRight: 6,
    flexShrink: 0,
  };

  const tapeBar = {
    margin: "0 12px 8px",
    height: 4,
    background: "#060606",
    borderRadius: 2,
    cursor: "pointer",
    position: "relative",
    border: "1px solid #1a1a1a",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
  };

  const tapeFill = {
    width: `${progress * 100}%`,
    height: "100%",
    background: `linear-gradient(90deg, ${VHS.led}, #ff6644)`,
    borderRadius: 2,
    transition: "width 0.1s linear",
    boxShadow: "0 0 4px rgba(255,51,51,0.3)",
  };

  const transportArea = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "12px 12px 10px",
  };

  const makeVhsBtn = () => ({
    width: 42,
    height: 34,
    border: "none",
    borderRadius: 3,
    background: `linear-gradient(180deg, #353535 0%, ${VHS.btnFace} 40%, #222 100%)`,
    color: "#ccc",
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), inset -1px -1px 0 rgba(0,0,0,0.3), inset 1px 0 0 rgba(255,255,255,0.04)",
    lineHeight: 1,
  });

  const seekBtnWrapper = {
    position: "relative",
    display: "flex",
    alignItems: "center",
  };

  const seekLabel = {
    position: "absolute",
    top: -14,
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    color: VHS.text,
    letterSpacing: 0.5,
    whiteSpace: "nowrap",
  };

  const chSection = {
    display: "flex",
    alignItems: "center",
    marginLeft: 20,
    paddingLeft: 16,
    paddingRight: 16,
    borderLeft: "1px solid #252525",
    borderRight: "1px solid #252525",
    borderTop: "none",
    borderBottom: "none",
    borderImage: "none",
  };

  const chInner = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 2,
  };

  const chLabel = {
    position: "absolute",
    top: -14,
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    color: VHS.text,
    letterSpacing: 1,
    whiteSpace: "nowrap",
  };

  const chArrow = {
    width: 26,
    height: 20,
    border: "none",
    borderRadius: 2,
    background: `linear-gradient(180deg, #303030 0%, ${VHS.btnFace} 40%, #1e1e1e 100%)`,
    color: "#bbb",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08), inset -1px -1px 0 rgba(0,0,0,0.25)",
  };

  const faderRow = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px 10px",
  };

  const faderLabel = {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: VHS.text,
    letterSpacing: 1,
    minWidth: 30,
  };

  const faderTrack = {
    flex: 1,
    height: 8,
    background: "#060606",
    borderRadius: 4,
    position: "relative",
    cursor: "pointer",
    border: "1px solid #1a1a1a",
    boxShadow: "inset 0 1px 4px rgba(0,0,0,0.6)",
  };

  const faderFill = {
    width: `${volume * 100}%`,
    height: "100%",
    background: "linear-gradient(90deg, #444, #888)",
    borderRadius: 4,
    position: "relative",
  };

  const faderKnob = {
    position: "absolute",
    right: -5,
    top: -4,
    width: 10,
    height: 16,
    background: "linear-gradient(180deg, #aaa 0%, #666 50%, #888 100%)",
    borderRadius: 2,
    border: "1px solid #555",
    boxShadow: "0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
  };

  const roundActionBtn = {
    width: 28,
    height: 28,
    border: "1px solid #333",
    borderRadius: "50%",
    background: "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)",
    color: "#8a8a8a",
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
    lineHeight: 1,
    padding: 0,
  };

  /* ── Render ──────────────────────────────────────────────────── */
  const renderActionButtons = (extraStyle = {}) => (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, ...extraStyle }}
    >
      <button
        className="vhs-round-btn"
        onClick={startHide}
        style={roundActionBtn}
        title="Hide panel (H)"
      >
        -
      </button>
      <button
        className="vhs-round-btn"
        onClick={() => onResetAll?.()}
        style={roundActionBtn}
        title="Reset all (day + default scene)"
      >
        ⏻
      </button>
    </div>
  );

  const topRightPair = actionLayout === "topRightPair";
  const rightTransport = actionLayout === "rightTransport";
  const bottomActionRow = actionLayout === "bottomActionRow";

  return (
    <div>
      <style>{INJECTED_CSS}</style>

      <div style={panel}>
        {/* Top-right pair option */}
        {topRightPair &&
          renderActionButtons({
            position: "absolute",
            top: 8,
            right: 10,
            zIndex: 25,
          })}

        {/* Trinitron RGB accent */}
        <div style={trinitronStrip} />

        {/* VFD display panel */}
        <div style={ledPanel}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={statusDot} />
            <span style={ledLabel}>
              {isPlaying ? "PLAY" : "PAUSE"} - {currentVideo.label}
            </span>
          </div>
          <span style={ledText}>{formatTime(currentTime)}</span>
        </div>

        {/* Tape progress */}
        <div style={tapeBar} onClick={handleProgressClick}>
          <div style={tapeFill} />
        </div>

        {/* Transport buttons + Channel switcher */}
        <div style={transportArea}>
          <div style={seekBtnWrapper}>
            <span style={seekLabel}>-10</span>
            <button
              className="vhs-btn"
              style={makeVhsBtn()}
              onClick={() => onSeek(-10)}
              title="Rewind 10s"
            >
              ◂◂
            </button>
          </div>

          <button
            className="vhs-btn"
            style={{ ...makeVhsBtn(), width: 48 }}
            onClick={onPlayPause}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "▮▮" : "▶"}
          </button>

          <div style={seekBtnWrapper}>
            <span style={seekLabel}>+10</span>
            <button
              className="vhs-btn"
              style={makeVhsBtn()}
              onClick={() => onSeek(10)}
              title="Forward 10s"
            >
              ▸▸
            </button>
          </div>

          <div style={chSection}>
            <div style={chInner}>
              <span style={chLabel}>CH</span>
              <button
                className="vhs-btn"
                style={chArrow}
                onClick={handleNextVideo}
                title="Next video"
              >
                ▼
              </button>
              <button
                className="vhs-btn"
                style={chArrow}
                onClick={handlePrevVideo}
                title="Previous video"
              >
                ▲
              </button>
            </div>
          </div>

          {rightTransport &&
            renderActionButtons({ marginLeft: 12, marginRight: 0 })}
        </div>

        {/* Volume fader */}
        <div style={faderRow}>
          <span
            style={{ ...faderLabel, cursor: "pointer" }}
            onClick={handleVolLabelClick}
            title="Toggle mute"
          >
            VOL
          </span>
          <div style={faderTrack} onClick={handleVolClick}>
            <div style={faderFill}>
              <div className="vhs-fader-knob" style={faderKnob} />
            </div>
          </div>
          <span style={{ ...faderLabel, textAlign: "right" }}>
            {Math.round(volume * 100)}
          </span>
        </div>

        {bottomActionRow && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "0 12px 10px",
            }}
          >
            {renderActionButtons()}
          </div>
        )}

        {/* Bottom chrome trim */}
        <div style={chromeTrim} />
      </div>
    </div>
  );
}
