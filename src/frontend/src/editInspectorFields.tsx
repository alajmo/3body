import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";

export function InspectorSection({
  title,
  note,
  children,
  collapsible = false,
  defaultOpen = true,
  onReset,
  resetDisabled = false,
}: {
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  note?: string;
  onReset?: () => void;
  resetDisabled?: boolean;
  title: string;
}) {
  const resetLabel = `Reset ${title}`;
  const handleResetClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onReset?.();
  };
  const headerContent = (
    <div className="edit-inspector__section-header">
      <div className="edit-inspector__section-header-row">
        <div className="edit-inspector__section-heading">
          <div className="edit-inspector__section-title">{title}</div>
          {note ? (
            <div className="edit-inspector__section-note">{note}</div>
          ) : null}
        </div>
        {onReset ? (
          <button
            type="button"
            className="edit-action-button edit-inspector__section-reset"
            disabled={resetDisabled}
            onClick={handleResetClick}
          >
            {resetLabel}
          </button>
        ) : null}
        {collapsible ? (
          <span
            aria-hidden="true"
            className="edit-inspector__section-disclosure"
          />
        ) : null}
      </div>
    </div>
  );

  if (collapsible) {
    return (
      <details
        className="edit-inspector__section edit-inspector__section--collapsible"
        open={defaultOpen}
      >
        <summary className="edit-inspector__section-summary">
          {headerContent}
        </summary>
        <div className="edit-inspector__field-grid">{children}</div>
      </details>
    );
  }

  return (
    <section className="edit-inspector__section">
      {headerContent}
      <div className="edit-inspector__field-grid">{children}</div>
    </section>
  );
}

export function InspectorSubheading({ label }: { label: string }) {
  return <div className="edit-inspector__subheading">{label}</div>;
}

export function NumberField(props: {
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  onPreviewChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const { label, onCommit, step, value } = props;
  const [draft, setDraft] = useState(value.toString());

  useEffect(() => {
    setDraft(value.toString());
  }, [value]);

  const commit = () => {
    const nextValue = Number(draft);
    if (!Number.isFinite(nextValue)) {
      setDraft(value.toString());
      return;
    }

    onCommit(nextValue);
  };

  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="number"
        className="edit-field__input"
        max={props.max}
        min={props.min}
        step={step}
        value={draft}
        onBlur={commit}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function SelectField<TValue extends string>({
  label,
  onCommit,
  options,
  value,
}: {
  label: string;
  onCommit: (value: TValue) => void;
  options: readonly {
    label: string;
    value: TValue;
  }[];
  value: TValue;
}) {
  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <select
        className="edit-field__input"
        value={value}
        onChange={(event) => onCommit(event.currentTarget.value as TValue)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColorField(props: {
  label: string;
  onCommit: (value: string) => void;
  onPreviewChange: (value: string) => void;
  value: string;
}) {
  const { label, onCommit, value } = props;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="edit-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="color"
        className="edit-field__input edit-field__input--color"
        value={draft}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
    </label>
  );
}

export function ToggleField({
  label,
  onCommit,
  value,
}: {
  label: string;
  onCommit: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <label className="edit-toggle-field">
      <span className="edit-field__label">{label}</span>
      <input
        type="checkbox"
        className="edit-toggle-field__input"
        checked={value}
        onChange={(event) => onCommit(event.currentTarget.checked)}
      />
    </label>
  );
}
