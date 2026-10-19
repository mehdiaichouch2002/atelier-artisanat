export type Messages = { [key: string]: string | Messages };
export type TParams = Record<string, string | number>;
export type TFunction = (key: string, params?: TParams) => string;

function lookup(messages: Messages, key: string): string | undefined {
  let cur: string | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Creates a translator. Missing keys fall back to French, then to the key itself. */
export function createTranslator(messages: Messages, fallback?: Messages): TFunction {
  return (key, params) => {
    let s = lookup(messages, key) ?? (fallback ? lookup(fallback, key) : undefined) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };
}

export function hasKey(messages: Messages, key: string): boolean {
  return lookup(messages, key) !== undefined;
}
