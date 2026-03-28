import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_EXTRACTION_PROMPT,
  NAME_FIELD_KEYS,
  emptyNamesState,
} from "../constants/defaultExtractionPrompt";
import { namesFromRecord, parseNamesFromModelResponse } from "../utils/parseNamesJson";
import { completePrompt, fetchLatestRecord, pdfFileUrl, saveRecord } from "../api";
import PDFRenderer from "./PDFRenderer";

/* eslint-disable react/prop-types */
const DocumentWorkspace = ({ documentMeta, onBack, onUploadAnother }) => {
  const { serial, original_name: originalName, kind: metaKind } = documentMeta;
  const fileUrl = pdfFileUrl(serial);
  const isImageDoc =
    metaKind === "image" || /\.(jpe?g|png)$/i.test(originalName || "");
  const [prompt, setPrompt] = useState("");
  const [names, setNames] = useState(emptyNamesState);
  const [rawResponse, setRawResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [contextInfo, setContextInfo] = useState(null);
  const [hydrating, setHydrating] = useState(true);
  const uploadInputRef = useRef(null);

  const setNameField = (key, value) => {
    setNames((prev) => ({ ...prev, [key]: value }));
  };

  const highlightTerms = useMemo(
    () =>
      NAME_FIELD_KEYS.map((k) => names[k].trim())
        .filter(Boolean)
        .slice(0, 5),
    [names],
  );

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    setPrompt("");
    setNames(emptyNamesState());
    setRawResponse("");
    setContextInfo(null);
    setMessage(null);
    (async () => {
      try {
        const data = await fetchLatestRecord(serial);
        if (cancelled) return;
        if (data.record) {
          setPrompt(data.record.prompt ?? "");
          setRawResponse(data.record.response ?? "");
          setNames(namesFromRecord(data.record));
        } else {
          setPrompt(DEFAULT_EXTRACTION_PROMPT);
        }
      } catch (e) {
        if (!cancelled) {
          setMessage({ type: "error", text: e.message || "Could not load saved data" });
          setPrompt(DEFAULT_EXTRACTION_PROMPT);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serial]);

  const runCompletion = async () => {
    setMessage(null);
    setContextInfo(null);
    setLoading(true);
    try {
      const data = await completePrompt(prompt, serial);
      const text = data.response || "";
      setRawResponse(text);
      setNames(parseNamesFromModelResponse(text));
      setMessage({
        type: "ok",
        text: "Resposta recebida. Revise e edite os campos abaixo antes de salvar, se quiser.",
      });
      setContextInfo({
        extracted: data.pdf_extracted_chars ?? null,
        truncated: Boolean(data.context_truncated),
        inputMode: data.input_mode || "text",
        visionPagesSent: data.vision_pages_sent ?? null,
        visionPagesTotal: data.vision_pages_total ?? null,
      });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  const persist = async () => {
    setMessage(null);
    setSaving(true);
    try {
      const data = await saveRecord({
        document_serial: serial,
        document_name: originalName,
        prompt,
        response: rawResponse,
        name1: names.name1,
        name2: names.name2,
        name3: names.name3,
        name4: names.name4,
        name5: names.name5,
      });
      setMessage({
        type: "ok",
        text:
          data.updated === false
            ? `Saved for document #${serial} (new entry in storage).`
            : `Saved for document #${serial}.`,
      });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <header className="shrink-0 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-indigo-400 hover:text-indigo-300 mb-1"
          >
            ← Home
          </button>
          <p className="text-xs text-slate-500 font-mono">#{serial}</p>
          <p className="text-sm font-medium truncate" title={originalName}>
            {originalName}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pdf,application/pdf,.jpg,.jpeg,.png,image/jpeg,image/png"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f && onUploadAnother) await onUploadAnother(f);
            }}
          />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="text-xs rounded-md px-3 py-2 border border-slate-600 hover:bg-slate-800"
          >
            Upload another file
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section className="w-[60%] min-w-0 border-r border-slate-800 flex flex-col bg-slate-900/40">
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="h-full min-h-[480px] flex items-center justify-center bg-slate-900/60">
              {isImageDoc ? (
                <img
                  key={serial}
                  src={fileUrl}
                  alt={originalName}
                  className="max-w-full max-h-[calc(100vh-8rem)] object-contain"
                />
              ) : (
                <div className="h-full w-full min-h-[480px]">
                  <PDFRenderer
                    key={serial}
                    fileUrl={fileUrl}
                    highlightTerms={highlightTerms}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="w-[40%] min-w-0 flex flex-col gap-3 p-4 overflow-y-auto">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={14}
            disabled={hydrating}
            placeholder="Instruções para o modelo…"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[200px] disabled:opacity-50"
          />
          {hydrating && (
            <p className="text-xs text-slate-500">Loading saved prompt and names…</p>
          )}
          <button
            type="button"
            disabled={hydrating || loading || !prompt.trim()}
            onClick={runCompletion}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-400"
          >
            {loading ? "Calling API…" : "Run OpenAI"}
          </button>

          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-2">
            Extracted names (edit before saving)
          </label>
          <p className="text-xs text-slate-500">
            Preenchido a partir do JSON retornado pelo modelo. Você pode corrigir antes de salvar.
            {!isImageDoc &&
              " Textos não vazios são destacados em amarelo no PDF (busca no texto do documento)."}
            {isImageDoc && " Destaque amarelo no documento não está disponível para imagens."}
          </p>
          <div className="flex flex-col gap-2">
            {NAME_FIELD_KEYS.map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <label htmlFor={key} className="text-[11px] text-slate-500 font-mono">
                  {key}
                </label>
                <input
                  id={key}
                  type="text"
                  value={names[key]}
                  onChange={(e) => setNameField(key, e.target.value)}
                  disabled={hydrating}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  placeholder="—"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>

          {contextInfo != null && contextInfo.inputMode === "vision" && (
            <p className="text-xs text-slate-500">
              <span className="text-indigo-300/90">Modo visão.</span>{" "}
              {contextInfo.visionPagesSent != null && contextInfo.visionPagesTotal != null ? (
                <>
                  Enviadas {contextInfo.visionPagesSent} de{" "}
                  {contextInfo.visionPagesTotal} página(s) como imagem ao modelo
                  {contextInfo.visionPagesTotal > contextInfo.visionPagesSent
                    ? " (limite de páginas no servidor)."
                    : "."}
                </>
              ) : (
                <>Imagem(ns) enviada(s) ao modelo.</>
              )}
            </p>
          )}
          {contextInfo != null &&
            contextInfo.inputMode === "text" &&
            contextInfo.extracted != null && (
              <p className="text-xs text-slate-500">
                Texto extraído do PDF incluído no pedido:{" "}
                {contextInfo.extracted.toLocaleString()} caracteres
                {contextInfo.truncated ? " (truncado ao limite)" : ""}.
              </p>
            )}

          <button
            type="button"
            disabled={hydrating || saving || !prompt.trim()}
            onClick={persist}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold border border-slate-600 text-slate-100 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save prompt & names to database file"}
          </button>

          {message && (
            <p
              className={
                message.type === "error" ? "text-red-400 text-sm" : "text-emerald-400 text-sm"
              }
            >
              {message.text}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
};

export default DocumentWorkspace;
