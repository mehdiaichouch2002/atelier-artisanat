"use client";

import { createContext, useActionState, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { Button, buttonClass } from "./ui/button";
import { cx } from "./ui/cx";
import { Notice } from "./ui/card";

type FormCtx = { state: ActionState; pending: boolean };
const FormContext = createContext<FormCtx>({ state: {}, pending: false });

/** Same limit as MAX_ATTACHMENT_BYTES on the server (kept here to avoid importing server code). */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Form bound to a server action. Shows validation errors next to fields, keeps the user's input
 * after an error, prevents double submission and sends an idempotency key so a retried request
 * is applied only once.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  successRedirect,
  showSuccess = true,
  id,
  "aria-label": ariaLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (state: ActionState) => void;
  successRedirect?: string;
  showSuccess?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const keyRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const { t } = useI18n();
  const router = useRouter();
  const handled = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.ok) {
      // The next submission is a new operation and gets a new key.
      if (keyRef.current) keyRef.current.value = "";
      onSuccess?.(state);
      const target = (state.data?.redirect as string | undefined) ?? successRedirect;
      if (target) router.push(target);
    } else if (state.error && formRef.current) {
      // Take the user straight to the problem: the first invalid field, otherwise the error message.
      const invalid = formRef.current.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (invalid) invalid.focus();
      else formRef.current.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView({ block: "center" });
    }
  }, [state, onSuccess, router, successRedirect]);

  const ctx = useMemo(() => ({ state, pending }), [state, pending]);
  return (
    <FormContext.Provider value={ctx}>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={(e) => {
          // Refuse oversized files before uploading: the host would reject the request with a generic error.
          const big = [...e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="file"]')].some((input) =>
            [...(input.files ?? [])].some((f) => f.size > MAX_UPLOAD_BYTES),
          );
          setFileTooLarge(big);
          if (big) {
            e.preventDefault();
            return;
          }
          // One key per logical operation: a repeated or retried submission reuses it.
          if (keyRef.current && !keyRef.current.value) keyRef.current.value = newKey();
        }}
        className={className}
        noValidate
        id={id}
        aria-label={ariaLabel}
        aria-busy={pending}
      >
        <input type="hidden" name="idempotencyKey" ref={keyRef} defaultValue="" />
        {fileTooLarge ? (
          <div className="mb-4">
            <Notice tone="bad">{t("errors.fileTooLarge")}</Notice>
          </div>
        ) : null}
        <FormMessage showSuccess={showSuccess} />
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function useFormState() {
  return useContext(FormContext);
}

function FormMessage({ showSuccess }: { showSuccess: boolean }) {
  const { state } = useContext(FormContext);
  const { t } = useI18n();
  if (state.error) {
    const detail = state.errorDetail ? t(`errors.detail.${state.errorDetail}`) : null;
    return (
      <div className="mb-4">
        <Notice tone="bad">
          {t(state.error)}
          {detail && detail !== `errors.detail.${state.errorDetail}` ? ` — ${detail}` : null}
        </Notice>
      </div>
    );
  }
  if (state.ok && showSuccess && state.message) {
    return (
      <div className="mb-4">
        <Notice tone="ok">{t(state.message)}</Notice>
      </div>
    );
  }
  return null;
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "copper";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={buttonClass(variant, size, className)}
    >
      {pending ? (
        <>
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {t("common.saving")}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function useField(name: string, defaultValue?: string | number | null) {
  const { state } = useContext(FormContext);
  const { t } = useI18n();
  const error = state.fieldErrors?.[name];
  const value = state.values && name in state.values ? state.values[name] : defaultValue == null ? undefined : String(defaultValue);
  return { error: error ? t(error) : undefined, value };
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="text-bad" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-ink-faint"> ({t("common.optional")})</span>
        )}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name"> & {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  defaultValue?: string | number | null;
  wrapperClassName?: string;
  suffix?: React.ReactNode;
};

export function TextField({ name, label, hint, defaultValue, required, wrapperClassName, suffix, className, ...rest }: InputProps) {
  const id = useId();
  const { error, value } = useField(name, defaultValue);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <div className="relative">
        <input
          id={id}
          name={name}
          defaultValue={value}
          required={required}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx("field-input", suffix ? "pe-12" : undefined, className)}
          {...rest}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-ink-soft" aria-hidden>
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

/**
 * Password input with a show/hide button and a Caps Lock warning. Typed passwords are never sent back
 * to the browser after an error, so the field is always empty when the page re-renders.
 */
export function PasswordField({ name, label, hint, required, wrapperClassName, autoComplete }: {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  wrapperClassName?: string;
  autoComplete: "current-password" | "new-password";
}) {
  const id = useId();
  const { t } = useI18n();
  const { error } = useField(name, null);
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const describedBy = [error ? `${id}-error` : hint ? `${id}-hint` : null, capsLock ? `${id}-caps` : null].filter(Boolean).join(" ") || undefined;
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {/* The password is always typed left to right, so the toggle stays on the right in every language. */}
      <div className="relative" dir="ltr">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="field-input pr-12"
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          title={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-soft hover:text-ink"
        >
          {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
      {capsLock ? (
        <p id={`${id}-caps`} role="status" className="mt-1 text-sm font-medium text-warn">
          {t("auth.capsLockOn")}
        </p>
      ) : null}
    </FieldShell>
  );
}

/** Amount in dirhams. Accepts "1 250,50", "1250.5"…; parsed on the server into centimes. */
export function MoneyField(props: Omit<InputProps, "type" | "inputMode">) {
  return <TextField {...props} type="text" inputMode="decimal" autoComplete="off" dir="ltr" suffix="DH" className="num text-end" />;
}

export function TextAreaField({
  name,
  label,
  hint,
  defaultValue,
  required,
  rows = 3,
  wrapperClassName,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue" | "name"> & {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  defaultValue?: string | null;
  wrapperClassName?: string;
}) {
  const id = useId();
  const { error, value } = useField(name, defaultValue);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="field-input"
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  defaultValue,
  required,
  options,
  placeholder,
  wrapperClassName,
  onChange,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "defaultValue" | "name"> & {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  placeholder?: string;
  wrapperClassName?: string;
}) {
  const id = useId();
  const { error, value } = useField(name, defaultValue);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="field-input"
        onChange={onChange}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  defaultChecked?: boolean;
}) {
  const id = useId();
  const { state } = useContext(FormContext);
  const checked = state.values ? state.values[name] === "on" : defaultChecked;
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" name={name} defaultChecked={checked} className="mt-1 size-5 accent-[var(--color-primary)]" />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-ink-soft">{hint}</span> : null}
      </label>
    </div>
  );
}

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface ComboOption {
  value: string;
  label: string;
  hint?: string | null;
}

/** Searchable picker (ARIA combobox) with a hidden input carrying the selected id. */
export function ComboboxField({
  name,
  label,
  options,
  defaultValue,
  required,
  placeholder,
  hint,
  onSelect,
  wrapperClassName,
}: {
  name: string;
  label: React.ReactNode;
  options: ComboOption[];
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
  onSelect?: (value: string | null) => void;
  wrapperClassName?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const { t } = useI18n();
  const { error, value: initial } = useField(name, defaultValue);
  const [selected, setSelected] = useState<string>(initial ?? "");
  const selectedLabel = options.find((o) => o.value === selected)?.label ?? "";
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { state } = useContext(FormContext);

  // Keep the visible text in sync after the form resets following a successful submission.
  const lastState = useRef(state);
  useEffect(() => {
    if (lastState.current !== state && state.ok) {
      const next = defaultValue ?? "";
      setSelected(next);
      setQuery(options.find((o) => o.value === next)?.label ?? "");
    }
    lastState.current = state;
  }, [state, defaultValue, options]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q || (selected && query === selectedLabel)) return options.slice(0, 50);
    return options.filter((o) => normalize(`${o.label} ${o.hint ?? ""}`).includes(q)).slice(0, 50);
  }, [query, options, selected, selectedLabel]);

  function choose(o: ComboOption | null) {
    setSelected(o?.value ?? "");
    setQuery(o?.label ?? "");
    setOpen(false);
    onSelect?.(o?.value ?? null);
  }

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <div className="relative">
        <input type="hidden" name={name} value={selected} />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-required={required}
          autoComplete="off"
          className="field-input"
          placeholder={placeholder ?? t("common.searchPlaceholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            if (selected) {
              setSelected("");
              onSelect?.(null);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (filtered[active]) choose(filtered[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-soft">{t("common.noResults")}</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={o.value === selected}
                  className={cx(
                    "cursor-pointer px-3 py-2",
                    i === active ? "bg-primary-soft" : undefined,
                    o.value === selected ? "font-semibold" : undefined,
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  {o.label}
                  {o.hint ? <span className="ms-2 text-sm text-ink-soft">{o.hint}</span> : null}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </FieldShell>
  );
}

/** Modal dialog using the native <dialog> element (focus trap, Escape, backdrop). */
export function Dialog({
  trigger,
  title,
  children,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerClassName,
  disabled,
}: {
  trigger: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Disables the trigger but keeps an open dialog (and its confirmation message) mounted. */
  disabled?: boolean;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "copper";
  triggerSize?: "sm" | "md" | "lg";
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  // Remount the content each time the dialog opens so forms start fresh.
  const [mounted, setMounted] = useState(0);
  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setMounted((m) => m + 1);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(36rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => ref.current?.close()} aria-label={t("common.close")}>
            ✕
          </Button>
        </div>
        <div className="px-4 py-4" key={mounted}>
          {mounted > 0 ? children : null}
        </div>
      </dialog>
    </>
  );
}

/** Button that asks for confirmation before submitting its form. */
export function ConfirmSubmit({
  children,
  message,
  variant = "danger",
  size = "md",
}: {
  children: React.ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "danger" | "copper";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" disabled={pending} className={buttonClass(variant, size)} onClick={() => ref.current?.showModal()}>
        {pending ? t("common.saving") : children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {t("common.confirmTitle")}
        </h2>
        <p className="mt-2 text-ink-soft">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            {t("common.cancel")}
          </Button>
          <button
            ref={btn}
            type="submit"
            className={buttonClass(variant, "md")}
            onClick={() => ref.current?.close()}
          >
            {t("common.confirm")}
          </button>
        </div>
      </dialog>
    </>
  );
}
