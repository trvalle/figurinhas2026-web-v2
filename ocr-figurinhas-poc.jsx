import { useState, useRef, useEffect, useCallback } from "react";

const PAISES_VALIDOS = [
  "BRA","ARG","FRA","ENG","ESP","GER","ITA","POR","NED","BEL",
  "URU","COL","MEX","USA","CAN","AUS","JPN","KOR","SEN","MAR",
  "CRO","SUI","DEN","SWE","NOR","POL","CZE","AUT","SCO","WAL",
  "ECU","PER","CHL","PAR","BOL","VEN","CRI","HON","JAM","TRI",
  "CMR","GHA","NGA","CIV","EGY","ALG","TUN","MOR","ANG","ZIM",
  "IRN","SAU","QAT","UAE","JOR","IRQ","CHN","THA","VIE","IND",
  "RUS","UKR","TUR","GRE","ROU","BUL","SRB","SVK","SVN","HUN"
];

function extrairFigurinhas(texto) {
  const regex = /\b([A-Z]{3})\s?(\d{1,3})\b/g;
  const resultados = [];
  let match;
  while ((match = regex.exec(texto)) !== null) {
    const pais = match[1];
    const numero = match[2];
    const valido = PAISES_VALIDOS.includes(pais);
    if (!resultados.find(r => r.pais === pais && r.numero === numero)) {
      resultados.push({ pais, numero, valido });
    }
  }
  return resultados;
}

export default function OCRFigurinhasPOC() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const tesseractRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | loading | scanning | result | error
  const [tesseractReady, setTesseractReady] = useState(false);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [textoOCR, setTextoOCR] = useState("");
  const [figurinhas, setFigurinhas] = useState([]);
  const [confianca, setConfianca] = useState(0);
  const [log, setLog] = useState([]);
  const [frameCount, setFrameCount] = useState(0);

  const addLog = useCallback((msg, tipo = "info") => {
    const ts = new Date().toLocaleTimeString("pt-BR");
    setLog(prev => [...prev.slice(-6), { msg, tipo, ts }]);
  }, []);

  // Carrega Tesseract via CDN
  useEffect(() => {
    if (window.Tesseract) {
      setTesseractReady(true);
      addLog("Tesseract.js já carregado", "ok");
      return;
    }
    setStatus("loading");
    addLog("Carregando Tesseract.js...", "info");
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = async () => {
      try {
        const worker = await window.Tesseract.createWorker("eng", 1, {
          logger: m => {
            if (m.status === "recognizing text") {
              addLog(`OCR: ${Math.round(m.progress * 100)}%`, "info");
            }
          }
        });
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
          tessedit_pageseg_mode: "6",
        });
        tesseractRef.current = worker;
        setTesseractReady(true);
        setStatus("idle");
        addLog("Tesseract pronto ✓", "ok");
      } catch (e) {
        setStatus("error");
        addLog("Erro ao inicializar Tesseract", "error");
      }
    };
    script.onerror = () => {
      setStatus("error");
      addLog("Falha ao carregar Tesseract.js", "error");
    };
    document.head.appendChild(script);
  }, [addLog]);

  const iniciarCamera = async () => {
    try {
      addLog("Acessando câmera...", "info");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraAtiva(true);
      setStatus("idle");
      addLog("Câmera ativa ✓", "ok");
    } catch (e) {
      addLog(`Erro câmera: ${e.message}`, "error");
      setStatus("error");
    }
  };

  const pararCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraAtiva(false);
    setStatus("idle");
    setFigurinhas([]);
    setTextoOCR("");
    addLog("Câmera desativada", "info");
  };

  const capturarEAnalisar = useCallback(async () => {
    if (!tesseractRef.current || !videoRef.current || !canvasRef.current) return;
    if (status === "scanning") return;

    setStatus("scanning");
    setFrameCount(prev => prev + 1);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Pré-processamento: aumenta contraste
    ctx.filter = "contrast(1.4) brightness(1.1) grayscale(1)";
    ctx.drawImage(video, 0, 0);
    ctx.filter = "none";

    try {
      const { data } = await tesseractRef.current.recognize(canvas);
      const textoLimpo = data.text.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").trim();
      const conf = Math.round(data.confidence);

      setTextoOCR(textoLimpo);
      setConfianca(conf);

      const encontradas = extrairFigurinhas(textoLimpo);
      if (encontradas.length > 0) {
        setFigurinhas(encontradas);
        addLog(`${encontradas.length} figurinha(s) detectada(s) — conf. ${conf}%`, "ok");
      } else {
        addLog(`Nenhum padrão encontrado — conf. ${conf}%`, "warn");
      }
      setStatus("result");
    } catch (e) {
      addLog(`Erro OCR: ${e.message}`, "error");
      setStatus("idle");
    }
  }, [status, addLog]);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (tesseractRef.current) tesseractRef.current.terminate();
    };
  }, []);

  const statusColor = { idle: "#6B7280", loading: "#F59E0B", scanning: "#3B82F6", result: "#10B981", error: "#EF4444" };
  const statusLabel = { idle: "Aguardando", loading: "Carregando...", scanning: "Analisando...", result: "Concluído", error: "Erro" };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A0A0F",
      color: "#E2E8F0",
      fontFamily: "'Courier New', monospace",
      padding: "0"
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        borderBottom: "1px solid #2D3748",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "#4A9EFF", letterSpacing: "3px", marginBottom: "2px" }}>
            ADMIN / OCR
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "#FFF", letterSpacing: "1px" }}>
            Scanner de Figurinhas
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "#1E2433", borderRadius: "20px", padding: "6px 14px",
          border: `1px solid ${statusColor[status]}33`
        }}>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: statusColor[status],
            boxShadow: `0 0 6px ${statusColor[status]}`,
            animation: status === "scanning" ? "pulse 1s infinite" : "none"
          }} />
          <span style={{ fontSize: "11px", color: statusColor[status], letterSpacing: "1px" }}>
            {statusLabel[status]}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "0", height: "calc(100vh - 61px)" }}>
        {/* Área da câmera */}
        <div style={{ position: "relative", background: "#050508", display: "flex", flexDirection: "column" }}>
          {/* Viewfinder */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <video
              ref={videoRef}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                display: cameraAtiva ? "block" : "none"
              }}
              muted playsInline
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {!cameraAtiva && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: "16px"
              }}>
                <div style={{ fontSize: "64px", opacity: 0.15 }}>📷</div>
                <div style={{ fontSize: "13px", color: "#4B5563", letterSpacing: "2px" }}>
                  CÂMERA INATIVA
                </div>
              </div>
            )}

            {/* Overlay de scanning */}
            {cameraAtiva && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {/* Crosshair */}
                <div style={{
                  position: "absolute",
                  top: "50%", left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "220px", height: "120px",
                  border: "2px solid rgba(74, 158, 255, 0.6)",
                  borderRadius: "4px"
                }}>
                  {/* Cantos */}
                  {[{top:"-2px",left:"-2px"},{top:"-2px",right:"-2px"},{bottom:"-2px",left:"-2px"},{bottom:"-2px",right:"-2px"}].map((pos, i) => (
                    <div key={i} style={{
                      position: "absolute", ...pos,
                      width: "16px", height: "16px",
                      borderColor: "#4A9EFF",
                      borderStyle: "solid",
                      borderWidth: i < 2 ? "2px 0 0 2px" : "0 2px 2px 0",
                      ...(i === 1 ? { borderWidth: "2px 2px 0 0" } : {}),
                      ...(i === 3 ? { borderWidth: "0 2px 2px 0" } : {}),
                    }} />
                  ))}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%,-50%)",
                    fontSize: "10px", color: "rgba(74,158,255,0.7)",
                    letterSpacing: "2px", whiteSpace: "nowrap"
                  }}>
                    APONTE PARA A FIGURINHA
                  </div>
                </div>

                {/* Scan line */}
                {status === "scanning" && (
                  <div style={{
                    position: "absolute", left: 0, right: 0, height: "2px",
                    background: "linear-gradient(90deg, transparent, #4A9EFF, transparent)",
                    animation: "scanline 1.5s linear infinite",
                  }} />
                )}

                {/* Frame counter */}
                <div style={{
                  position: "absolute", top: "12px", right: "12px",
                  fontSize: "10px", color: "rgba(74,158,255,0.5)",
                  letterSpacing: "1px"
                }}>
                  FRAME #{frameCount.toString().padStart(4, "0")}
                </div>

                {/* Confiança */}
                {confianca > 0 && (
                  <div style={{
                    position: "absolute", bottom: "12px", left: "12px",
                    fontSize: "11px", color: confianca > 60 ? "#10B981" : "#F59E0B",
                    letterSpacing: "1px"
                  }}>
                    CONF. {confianca}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controles */}
          <div style={{
            padding: "16px 24px",
            background: "#0D0D17",
            borderTop: "1px solid #1E2433",
            display: "flex", gap: "12px", alignItems: "center"
          }}>
            {!cameraAtiva ? (
              <button
                onClick={iniciarCamera}
                disabled={!tesseractReady}
                style={{
                  flex: 1, padding: "12px",
                  background: tesseractReady ? "linear-gradient(135deg, #1D4ED8, #3B82F6)" : "#1E2433",
                  color: tesseractReady ? "#FFF" : "#4B5563",
                  border: "none", borderRadius: "8px",
                  fontSize: "13px", letterSpacing: "2px",
                  cursor: tesseractReady ? "pointer" : "not-allowed",
                  fontFamily: "'Courier New', monospace"
                }}
              >
                {tesseractReady ? "▶ INICIAR CÂMERA" : "⟳ CARREGANDO..."}
              </button>
            ) : (
              <>
                <button
                  onClick={capturarEAnalisar}
                  disabled={status === "scanning" || status === "loading"}
                  style={{
                    flex: 2, padding: "12px",
                    background: status === "scanning"
                      ? "#1E2433"
                      : "linear-gradient(135deg, #065F46, #10B981)",
                    color: "#FFF", border: "none", borderRadius: "8px",
                    fontSize: "13px", letterSpacing: "2px",
                    cursor: status === "scanning" ? "not-allowed" : "pointer",
                    fontFamily: "'Courier New', monospace"
                  }}
                >
                  {status === "scanning" ? "⟳ ANALISANDO..." : "⊙ CAPTURAR"}
                </button>
                <button
                  onClick={pararCamera}
                  style={{
                    flex: 1, padding: "12px",
                    background: "#1E2433",
                    color: "#EF4444", border: "1px solid #EF444433",
                    borderRadius: "8px", fontSize: "13px", letterSpacing: "2px",
                    cursor: "pointer", fontFamily: "'Courier New', monospace"
                  }}
                >
                  ■ PARAR
                </button>
              </>
            )}
          </div>
        </div>

        {/* Painel lateral */}
        <div style={{
          background: "#0D0D17",
          borderLeft: "1px solid #1E2433",
          display: "flex", flexDirection: "column",
          overflow: "hidden"
        }}>
          {/* Resultado OCR */}
          <div style={{ padding: "20px", borderBottom: "1px solid #1E2433" }}>
            <div style={{ fontSize: "10px", color: "#4B5563", letterSpacing: "3px", marginBottom: "12px" }}>
              FIGURINHAS DETECTADAS
            </div>

            {figurinhas.length === 0 ? (
              <div style={{
                padding: "24px 16px", textAlign: "center",
                border: "1px dashed #1E2433", borderRadius: "8px",
                color: "#374151", fontSize: "12px", letterSpacing: "1px"
              }}>
                Nenhuma figurinha<br />detectada ainda
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {figurinhas.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px",
                    background: f.valido ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
                    border: `1px solid ${f.valido ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                    borderRadius: "8px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{
                        fontSize: "20px", fontWeight: "bold",
                        color: f.valido ? "#10B981" : "#F59E0B",
                        letterSpacing: "1px"
                      }}>
                        {f.pais}
                      </span>
                      <span style={{
                        fontSize: "24px", fontWeight: "bold", color: "#E2E8F0"
                      }}>
                        #{f.numero}
                      </span>
                    </div>
                    <div style={{
                      fontSize: "10px", letterSpacing: "1px",
                      color: f.valido ? "#10B981" : "#F59E0B",
                      padding: "3px 8px",
                      border: `1px solid ${f.valido ? "#10B98133" : "#F59E0B33"}`,
                      borderRadius: "4px"
                    }}>
                      {f.valido ? "VÁLIDA" : "REVISAR"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Texto bruto OCR */}
          <div style={{ padding: "20px", borderBottom: "1px solid #1E2433" }}>
            <div style={{ fontSize: "10px", color: "#4B5563", letterSpacing: "3px", marginBottom: "8px" }}>
              TEXTO BRUTO (OCR)
            </div>
            <div style={{
              padding: "10px 12px",
              background: "#050508",
              border: "1px solid #1E2433",
              borderRadius: "6px",
              fontSize: "12px", color: "#6B7280",
              minHeight: "60px", wordBreak: "break-all",
              fontFamily: "'Courier New', monospace"
            }}>
              {textoOCR || "—"}
            </div>
          </div>

          {/* Log */}
          <div style={{ padding: "20px", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "10px", color: "#4B5563", letterSpacing: "3px", marginBottom: "8px" }}>
              LOG DO SISTEMA
            </div>
            <div style={{
              flex: 1, overflow: "auto",
              display: "flex", flexDirection: "column", gap: "4px"
            }}>
              {log.length === 0 ? (
                <div style={{ fontSize: "11px", color: "#374151" }}>Aguardando eventos...</div>
              ) : (
                [...log].reverse().map((l, i) => (
                  <div key={i} style={{
                    fontSize: "10px", letterSpacing: "0.5px",
                    color: l.tipo === "ok" ? "#10B981" : l.tipo === "error" ? "#EF4444" : l.tipo === "warn" ? "#F59E0B" : "#6B7280",
                    display: "flex", gap: "8px"
                  }}>
                    <span style={{ opacity: 0.4, flexShrink: 0 }}>{l.ts}</span>
                    <span>{l.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dica */}
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid #1E2433",
            fontSize: "10px", color: "#374151",
            letterSpacing: "0.5px", lineHeight: "1.6"
          }}>
            💡 Padrão detectado: <span style={{ color: "#4A9EFF" }}>XXX 00</span> — sigla país + número
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes scanline {
          0% { top: 30%; }
          100% { top: 70%; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0D0D17; }
        ::-webkit-scrollbar-thumb { background: #1E2433; }
      `}</style>
    </div>
  );
}
