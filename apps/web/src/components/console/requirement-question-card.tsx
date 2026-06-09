"use client";

const OPTION_LABELS = ["A", "B", "C"] as const;
const CUSTOM_OPTION = "D";

export function RequirementQuestionCard({
  index,
  question,
  suggestedAnswers,
  value = "",
  onChange,
}: {
  index: number;
  question: string;
  suggestedAnswers: string[];
  value?: string;
  onChange: (answer: string) => void;
}) {
  const options = suggestedAnswers.slice(0, 3);
  const selectedIndex = options.findIndex((option) => option === value);
  const isCustom = value.length > 0 && selectedIndex < 0;

  return (
    <article
      className="rounded-md border border-[var(--oc-accent-primary)] bg-[var(--oc-accent-soft)] p-3"
      data-testid="stream-item-requirement.question"
    >
      <header className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-text-muted)]">
        Question {index + 1}
      </header>
      <p className="mt-1 text-sm font-medium">{question}</p>
      <div className="mt-3 space-y-2">
        {options.map((option, optionIndex) => {
          const label = OPTION_LABELS[optionIndex] ?? "?";
          const checked = selectedIndex === optionIndex;
          return (
            <label
              key={label}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                checked
                  ? "border-[var(--oc-accent-primary)] bg-[var(--oc-surface-base)]"
                  : "border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)]"
              }`}
            >
              <input
                type="radio"
                name={`question-${index}`}
                checked={checked}
                onChange={() => onChange(option)}
                className="mt-1"
              />
              <span>
                <span className="mr-2 font-semibold text-[var(--oc-accent-primary)]">{label}.</span>
                {option}
              </span>
            </label>
          );
        })}
        <label
          className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            isCustom || (value.length > 0 && selectedIndex < 0)
              ? "border-[var(--oc-accent-primary)] bg-[var(--oc-surface-base)]"
              : "border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)]"
          }`}
        >
          <input
            type="radio"
            name={`question-${index}`}
            checked={isCustom || (value.length > 0 && selectedIndex < 0)}
            onChange={() => onChange("")}
            className="mt-1"
          />
          <span className="font-semibold text-[var(--oc-accent-primary)]">{CUSTOM_OPTION}.</span>
          <input
            type="text"
            value={isCustom ? value : ""}
            placeholder="自己填写"
            onFocus={() => {
              if (!isCustom) {
                onChange("");
              }
            }}
            onChange={(event) => onChange(event.target.value)}
            className="min-w-0 flex-1 rounded border border-[var(--oc-border-muted)] px-2 py-1 text-sm"
            data-testid={`question-${index}-custom`}
          />
        </label>
      </div>
    </article>
  );
}
