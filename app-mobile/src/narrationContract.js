const TOKEN = /\{\{([A-Z_]+)\}\}/g;
const ALLOWED = new Set(["RESULT", "FOLLOW_UP"]);

export function validateNarrationTemplate(template, maxLength = 600) {
  const value = String(template ?? "");
  if (!value || value.length > maxLength) return { valid: false, reason: "length" };
  const names = [...value.matchAll(TOKEN)].map((match) => match[1]);
  if (names.some((name) => !ALLOWED.has(name))) return { valid: false, reason: "unknown-placeholder" };
  if (names.length !== 2 || new Set(names).size !== 2) return { valid: false, reason: "placeholder-count" };
  if (value.replace(TOKEN, "").replace(/[\s.,:;—-]/g, "")) return { valid: false, reason: "literal-content" };
  return { valid: true, template: value };
}

export function renderNarration(plan, candidateTemplate) {
  const checked = validateNarrationTemplate(candidateTemplate);
  if (!checked.valid) return { text: plan.fallback, usedModel: false, rejection: checked.reason };
  const slots = Object.fromEntries(plan.narrationSlots.map(({ name, value }) => [name, value]));
  return {
    text: checked.template.replace(TOKEN, (_, name) => slots[name]),
    usedModel: true,
    rejection: null,
  };
}
