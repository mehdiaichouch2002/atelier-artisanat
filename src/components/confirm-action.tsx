"use client";
import { ActionForm, ConfirmSubmit, SubmitButton } from "./forms";
import type { ActionState } from "@/lib/action";

/** A one-button form posting hidden fields to a server action, optionally behind a confirmation. */
export function ActionButton({
  action,
  fields,
  label,
  confirm,
  variant = "secondary",
  size = "md",
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: React.ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "danger" | "copper";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <ActionForm action={action} className="inline-block">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {confirm ? (
        <ConfirmSubmit message={confirm} variant={variant} size={size}>
          {label}
        </ConfirmSubmit>
      ) : (
        <SubmitButton variant={variant} size={size}>
          {label}
        </SubmitButton>
      )}
    </ActionForm>
  );
}
