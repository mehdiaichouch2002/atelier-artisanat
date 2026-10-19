// Kept free of server-only imports so it can be used from any server module and tests.
export function pgCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "constraint_name" in err
    ? String((err as { constraint_name: unknown }).constraint_name)
    : undefined;
}
