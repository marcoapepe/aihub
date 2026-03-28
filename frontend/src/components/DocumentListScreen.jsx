import { useEffect, useState } from "react";
import { fetchDocuments } from "../api";

/* eslint-disable react/prop-types */
const DocumentListScreen = ({ onSelect, onBack }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDocuments();
        if (!cancelled) setDocs(data.documents || []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load list");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Uploaded files</h1>
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            ← Back
          </button>
        </div>

        {loading && <p className="text-slate-400 text-sm">Loading…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {!loading && !error && docs.length === 0 && (
          <p className="text-slate-400 text-sm">No files yet. Upload one from the home screen.</p>
        )}

        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 overflow-hidden">
          {docs.map((d) => (
            <li key={d.serial}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className="w-full text-left px-4 py-3 hover:bg-slate-900 flex justify-between items-start gap-4"
              >
                <span className="font-mono text-indigo-400 shrink-0">#{d.serial}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-slate-200">{d.original_name}</span>
                  {d.saved_names_preview ? (
                    <span
                      className="block text-xs text-slate-500 truncate mt-1"
                      title={d.saved_names_preview}
                    >
                      {d.saved_names_preview}
                    </span>
                  ) : (
                    <span className="block text-xs text-slate-600 mt-1">No saved names yet</span>
                  )}
                </span>
                <span className="text-slate-500 text-xs shrink-0 pt-0.5">Open</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default DocumentListScreen;
