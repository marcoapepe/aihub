import { useCallback, useRef, useState } from "react";
import { uploadDocument } from "./api";
import DocumentListScreen from "./components/DocumentListScreen";
import DocumentWorkspace from "./components/DocumentWorkspace";
import HomeScreen from "./components/HomeScreen";

function App() {
  const [view, setView] = useState("home");
  const [documentMeta, setDocumentMeta] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const homeFileInputRef = useRef(null);

  const openWorkspace = useCallback((meta) => {
    setDocumentMeta(meta);
    setView("workspace");
    setUploadError(null);
  }, []);

  const handleUploadFile = useCallback(
    async (file) => {
      if (!file) return;
      setUploadError(null);
      try {
        const data = await uploadDocument(file);
        openWorkspace({
          serial: data.serial,
          original_name: data.original_name,
          kind: data.kind,
        });
      } catch (e) {
        setUploadError(e.message || "Upload failed");
      }
    },
    [openWorkspace],
  );

  return (
    <>
      <input
        ref={homeFileInputRef}
        type="file"
        accept=".pdf,application/pdf,.jpg,.jpeg,.png,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          handleUploadFile(f);
        }}
      />

      {view === "home" && (
        <div>
          <HomeScreen
            onUploadClick={() => homeFileInputRef.current?.click()}
            onListClick={() => {
              setUploadError(null);
              setView("list");
            }}
          />
          {uploadError && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-md w-[90%] rounded-lg bg-red-950 border border-red-800 text-red-200 text-sm px-4 py-3">
              {uploadError}
            </div>
          )}
        </div>
      )}

      {view === "list" && (
        <DocumentListScreen
          onBack={() => setView("home")}
          onSelect={(d) =>
            openWorkspace({
              serial: d.serial,
              original_name: d.original_name,
              kind: d.kind,
            })
          }
        />
      )}

      {view === "workspace" && documentMeta && (
        <DocumentWorkspace
          key={documentMeta.serial}
          documentMeta={documentMeta}
          onBack={() => {
            setView("home");
            setDocumentMeta(null);
          }}
          onUploadAnother={handleUploadFile}
        />
      )}
    </>
  );
}

export default App;
