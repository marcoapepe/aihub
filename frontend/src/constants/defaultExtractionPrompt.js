/** Default prompt when opening a new document (Portuguese extraction instructions). */
export const DEFAULT_EXTRACTION_PROMPT = `Você é uma API de extração de dados.

Retorne APENAS um JSON válido.
Não inclua explicações, nem comentários, ou outro texto.
Retorne apenas o JSON.

JSON Schema:
{
  "name1": { "type": "string" },
  "name2": { "type": "string" },
  "name3": { "type": "string" },
  "name4": { "type": "string" },
  "name5": { "type": "string" }
}
(todos os campos são opcionais)

Pergunta:
Identifique até 5 nomes de empresas ou nomes de pessoas no documento anexado.`;

export const NAME_FIELD_KEYS = ["name1", "name2", "name3", "name4", "name5"];

export function emptyNamesState() {
  return { name1: "", name2: "", name3: "", name4: "", name5: "" };
}
