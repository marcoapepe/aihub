import { NAME_FIELD_KEYS, emptyNamesState } from "../constants/defaultExtractionPrompt";

/**
 * Pull name1..name5 from model output (plain JSON or fenced markdown).
 */
export function parseNamesFromModelResponse(text) {
  const empty = emptyNamesState();
  if (!text || typeof text !== "string") return empty;
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return empty;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    const out = { ...empty };
    for (const key of NAME_FIELD_KEYS) {
      const v = obj[key];
      out[key] = v == null ? "" : String(v).trim();
    }
    return out;
  } catch {
    return empty;
  }
}

/** Build names from a saved record (explicit fields or legacy response text). */
export function namesFromRecord(record) {
  if (!record) return emptyNamesState();
  const hasExplicit = NAME_FIELD_KEYS.some((k) => {
    const v = record[k];
    return v != null && String(v).trim() !== "";
  });
  if (hasExplicit) {
    const out = emptyNamesState();
    for (const k of NAME_FIELD_KEYS) {
      out[k] = String(record[k] ?? "").trim();
    }
    return out;
  }
  return parseNamesFromModelResponse(record.response ?? "");
}
