const jsonHeaders = { "Content-Type": "application/json" };

function formatDetail(detail) {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  return String(detail);
}

export async function uploadDocument(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatDetail(err.detail) || res.statusText || "Upload failed");
  }
  return res.json();
}

/** @deprecated use uploadDocument */
export const uploadPdf = uploadDocument;

export async function fetchDocuments() {
  const res = await fetch("/api/documents");
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export function pdfFileUrl(serial) {
  return `/api/files/${serial}`;
}

export async function completePrompt(prompt, documentSerial) {
  const res = await fetch("/api/complete", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      prompt,
      document_serial: documentSerial,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDetail(data.detail) || res.statusText || "Request failed");
  }
  return data;
}

export async function fetchLatestRecord(documentSerial) {
  const res = await fetch(`/api/records/latest/${documentSerial}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDetail(data.detail) || res.statusText || "Load failed");
  }
  return data;
}

export async function saveRecord(payload) {
  const res = await fetch("/api/records", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDetail(data.detail) || res.statusText || "Save failed");
  }
  return data;
}
