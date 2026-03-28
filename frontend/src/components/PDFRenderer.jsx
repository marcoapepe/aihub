import { Viewer, Worker } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import { searchPlugin } from "@react-pdf-viewer/search";
import { useEffect, useRef } from "react";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import "@react-pdf-viewer/search/lib/styles/index.css";

// eslint-disable-next-line react/prop-types
export const PDFRenderer = ({ fileUrl, highlightTerms = [] }) => {
  const layoutPluginInstance = defaultLayoutPlugin();
  const searchPluginInstance = searchPlugin({ enableShortcuts: false });
  const searchRef = useRef(searchPluginInstance);
  searchRef.current = searchPluginInstance;

  const termsSig = (highlightTerms || [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\u0000");

  useEffect(() => {
    if (!fileUrl) {
      searchRef.current.clearHighlights();
      return;
    }

    const trimmed = termsSig
      ? termsSig.split("\u0000").filter(Boolean)
      : [];

    let cancelled = false;

    const apply = async () => {
      if (cancelled) return;
      if (trimmed.length === 0) {
        searchRef.current.clearHighlights();
        return;
      }
      const keywords = trimmed.map((keyword) => ({
        keyword,
        matchCase: false,
        wholeWords: false,
      }));
      try {
        const matches = await searchRef.current.highlight(keywords);
        if (!cancelled && matches.length === 0 && trimmed.length > 0) {
          await new Promise((r) => setTimeout(r, 750));
          if (!cancelled) await searchRef.current.highlight(keywords);
        }
      } catch {
        /* viewer may not be ready yet */
      }
    };

    const debounceMs = 380;
    const timer = setTimeout(() => {
      void apply();
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fileUrl, termsSig]);

  return (
    <div className="h-full w-full [&_.rpv-core__viewer]:min-h-[70vh] pdf-viewer-names-highlight">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
        {fileUrl ? (
          <Viewer
            fileUrl={fileUrl}
            plugins={[layoutPluginInstance, searchPluginInstance]}
          />
        ) : null}
      </Worker>
    </div>
  );
};

export default PDFRenderer;
