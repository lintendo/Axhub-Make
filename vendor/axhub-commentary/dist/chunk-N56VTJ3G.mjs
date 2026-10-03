// src/ui/runtime/prompt-card-skills.ts
var IMPECCABLE_README_URL = "https://github.com/pbakaus/impeccable#readme";
function buildImpeccablePrompt(command, instruction) {
  return [
    `\u8BF7\u7528 Impeccable \u7684\u300C${command}\u300D\u80FD\u529B\u6765\u5904\u7406\u5F53\u524D\u6279\u6CE8\u3002`,
    `\u5B98\u65B9\u6280\u80FD\u8BF4\u660E\uFF1A${IMPECCABLE_README_URL}`,
    "\u5982\u679C\u5F53\u524D\u73AF\u5883\u8FD8\u6CA1\u6709\u5B89\u88C5 Impeccable\uFF0C\u8BF7\u5148\u8FD0\u884C\uFF1A",
    "npx impeccable install",
    "\u5982\u679C\u5DF2\u7ECF\u5B89\u88C5\uFF0C\u76F4\u63A5\u7EE7\u7EED\u5373\u53EF\u3002",
    `\u6267\u884C\u65F6\u4F7F\u7528\u5B98\u65B9\u547D\u4EE4\uFF1A/impeccable ${command}`,
    "\u5F00\u59CB\u524D\u8BF7\u5148\u9605\u8BFB\u5F53\u524D\u9879\u76EE\u7684 DESIGN.md\uFF0C\u6240\u6709\u89C6\u89C9\u51B3\u7B56\u90FD\u4EE5\u5B83\u4E3A\u51C6\u3002",
    instruction
  ].join("\n");
}
var PROMPT_CARD_SKILLS = [
  {
    id: "explore-options",
    label: "\u591A\u65B9\u6848\u63A2\u7D22",
    description: "\u540C\u65F6\u751F\u6210\u51E0\u79CD\u4E0D\u540C\u65B9\u6848\uFF0C\u6BD4\u8F83\u540E\u518D\u9009\u4E00\u5957",
    keywords: "\u591A\u65B9\u6848\u751F\u6210 \u65B9\u6848\u5BF9\u6BD4 \u8BBE\u8BA1\u51B3\u7B56 \u591A\u65B9\u6848\u5BF9\u6BD4",
    prompt: "\u8BF7\u5148\u56F4\u7ED5\u5F53\u524D\u6279\u6CE8\u548C\u9875\u9762\u76EE\u6807\uFF0C\u63D0\u51FA 2-3 \u4E2A\u65B9\u5411\u660E\u663E\u4E0D\u540C\u7684\u65B9\u6848\uFF0C\u7B80\u8981\u8BF4\u660E\u5404\u81EA\u53D6\u820D\uFF0C\u9009\u51FA\u6700\u9002\u5408\u7684\u4E00\u5957\u540E\u518D\u5F00\u59CB\u4FEE\u6539\u3002"
  },
  {
    id: "prototype-annotation",
    label: "\u539F\u578B\u6807\u6CE8",
    description: "\u7ED3\u5408\u5F53\u524D\u539F\u578B\u6279\u6CE8\uFF0C\u51C6\u786E\u7406\u89E3\u8981\u6539\u54EA\u91CC\u3001\u4E3A\u4EC0\u4E48\u6539",
    prompt: "\u8BF7\u5148\u7ED3\u5408\u5F53\u524D\u539F\u578B\u548C\u6279\u6CE8\uFF0C\u786E\u8BA4\u8981\u6539\u7684\u533A\u57DF\u3001\u5B58\u5728\u7684\u95EE\u9898\u548C\u60F3\u8FBE\u5230\u7684\u6548\u679C\uFF0C\u518D\u5904\u7406\u6279\u6CE8\u5BF9\u5E94\u7684\u5185\u5BB9\u3002"
  },
  {
    id: "impeccable-polish",
    label: "\u4F18\u5316",
    description: "\u6574\u4F53\u6253\u78E8\u89C6\u89C9\u7EC6\u8282\uFF0C\u8BA9\u754C\u9762\u66F4\u7CBE\u81F4\uFF0C\u4F46\u4E0D\u6539\u53D8\u9875\u9762\u7ED3\u6784\u548C\u4E1A\u52A1\u542B\u4E49",
    prompt: buildImpeccablePrompt(
      "polish",
      "\u8BF7\u628A\u5F53\u524D\u6279\u6CE8\u6307\u5411\u7684\u533A\u57DF\u6253\u78E8\u5F97\u66F4\u7CBE\u81F4\u3001\u7EDF\u4E00\u3001\u597D\u7528\uFF0C\u4E5F\u53EF\u4EE5\u987A\u624B\u5904\u7406\u7D27\u90BB\u7684\u5FC5\u8981\u7EC6\u8282\uFF1B\u4E0D\u8981\u6539\u53D8\u9875\u9762\u7ED3\u6784\u6216\u4E1A\u52A1\u542B\u4E49\uFF0C\u4E5F\u4E0D\u8981\u91CD\u505A\u6574\u9875\u3002"
    )
  },
  {
    id: "impeccable-layout",
    label: "\u5E03\u5C40",
    description: "\u8C03\u6574\u7A7A\u95F4\u3001\u5BF9\u9F50\u3001\u5C3A\u5BF8\u548C\u54CD\u5E94\u5F0F\u7ED3\u6784\uFF0C\u89E3\u51B3\u62E5\u6324\u3001\u9519\u4F4D\u6216\u6BD4\u4F8B\u5931\u8861",
    prompt: buildImpeccablePrompt(
      "layout",
      "\u8BF7\u91CD\u70B9\u8C03\u6574\u5F53\u524D\u533A\u57DF\u7684\u7A7A\u95F4\u5173\u7CFB\uFF1A\u4F4D\u7F6E\u3001\u95F4\u8DDD\u3001\u5BF9\u9F50\u3001\u5C3A\u5BF8\u548C\u54CD\u5E94\u5F0F\u8868\u73B0\uFF1B\u53EA\u6539\u4E0E\u6279\u6CE8\u76F8\u5173\u7684\u8303\u56F4\uFF0C\u4E0D\u6539\u53D8\u4E1A\u52A1\u542B\u4E49\u3002"
    )
  },
  {
    id: "impeccable-typeset",
    label: "\u6392\u7248",
    description: "\u8C03\u6574\u5B57\u4F53\u3001\u5B57\u53F7\u3001\u884C\u9AD8\u3001\u5B57\u91CD\u548C\u6587\u5B57\u5C42\u7EA7\uFF0C\u8BA9\u5185\u5BB9\u66F4\u6613\u8BFB",
    prompt: buildImpeccablePrompt(
      "typeset",
      "\u8BF7\u8BA9\u5F53\u524D\u533A\u57DF\u7684\u6587\u5B57\u66F4\u597D\u8BFB\uFF1A\u8C03\u6574\u5B57\u4F53\u3001\u5B57\u53F7\u3001\u884C\u9AD8\u3001\u5B57\u91CD\u548C\u4FE1\u606F\u5C42\u7EA7\uFF1B\u4E0D\u8981\u6539\u53D8\u6587\u6848\u542B\u4E49\u3002"
    )
  },
  {
    id: "impeccable-distill",
    label: "\u7CBE\u7B80",
    description: "\u53BB\u6389\u591A\u4F59\u88C5\u9970\u3001\u91CD\u590D\u4FE1\u606F\u548C\u89C6\u89C9\u566A\u97F3\uFF0C\u8BA9\u754C\u9762\u66F4\u6E05\u723D",
    prompt: buildImpeccablePrompt(
      "distill",
      "\u8BF7\u5220\u6389\u5F53\u524D\u533A\u57DF\u91CC\u591A\u4F59\u7684\u88C5\u9970\u3001\u91CD\u590D\u4FE1\u606F\u548C\u89C6\u89C9\u566A\u97F3\uFF0C\u8BA9\u91CD\u70B9\u66F4\u7A81\u51FA\uFF1B\u4FDD\u7559\u4E1A\u52A1\u4FE1\u606F\u548C\u5FC5\u8981\u72B6\u6001\u3002"
    )
  },
  {
    id: "impeccable-clarify",
    label: "\u6587\u6848",
    description: "\u6539\u5199\u6309\u94AE\u3001\u63D0\u793A\u548C\u8BF4\u660E\uFF0C\u8BA9\u7528\u6237\u66F4\u5FEB\u7406\u89E3\u5E76\u77E5\u9053\u4E0B\u4E00\u6B65",
    prompt: buildImpeccablePrompt(
      "clarify",
      "\u8BF7\u628A\u5F53\u524D\u533A\u57DF\u7684\u6309\u94AE\u3001\u63D0\u793A\u548C\u8BF4\u660E\u5199\u5F97\u66F4\u6E05\u695A\u3001\u66F4\u5177\u4F53\uFF0C\u8BA9\u7528\u6237\u77E5\u9053\u4E0B\u4E00\u6B65\u600E\u4E48\u505A\uFF1B\u4E0D\u8981\u6539\u53D8\u4E1A\u52A1\u542B\u4E49\u3002"
    )
  },
  {
    id: "impeccable-animate",
    label: "\u52A8\u6548",
    description: "\u8865\u5145\u52A0\u8F7D\u3001\u60AC\u505C\u3001\u5207\u6362\u548C\u53CD\u9988\u52A8\u753B\uFF0C\u8BA9\u4EA4\u4E92\u66F4\u6709\u56DE\u5E94",
    prompt: buildImpeccablePrompt(
      "animate",
      "\u8BF7\u4E3A\u5F53\u524D\u533A\u57DF\u8865\u4E0A\u5FC5\u8981\u7684\u52A0\u8F7D\u3001\u5207\u6362\u548C\u64CD\u4F5C\u53CD\u9988\uFF0C\u8BA9\u4EA4\u4E92\u66F4\u81EA\u7136\uFF1B\u52A8\u6548\u8981\u514B\u5236\uFF0C\u5E76\u5C0A\u91CD\u7528\u6237\u7684\u51CF\u5C11\u52A8\u6548\u8BBE\u7F6E\u3002"
    )
  },
  {
    id: "impeccable-adapt",
    label: "\u9002\u914D",
    description: "\u68C0\u67E5\u684C\u9762\u3001\u5E73\u677F\u3001\u624B\u673A\u548C\u4E0D\u540C\u8F93\u5165\u65B9\u5F0F\u4E0B\u7684\u663E\u793A\u4E0E\u64CD\u4F5C",
    prompt: buildImpeccablePrompt(
      "adapt",
      "\u8BF7\u68C0\u67E5\u5F53\u524D\u533A\u57DF\u5728\u684C\u9762\u3001\u5E73\u677F\u3001\u624B\u673A\u3001\u6A2A\u7AD6\u5C4F\u4EE5\u53CA\u4E0D\u540C\u8F93\u5165\u65B9\u5F0F\u4E0B\u662F\u5426\u597D\u7528\uFF0C\u5E76\u4FEE\u6B63\u660E\u663E\u95EE\u9898\u3002"
    )
  },
  {
    id: "impeccable-harden",
    label: "\u5065\u58EE",
    description: "\u8865\u9F50\u52A0\u8F7D\u3001\u7A7A\u6570\u636E\u3001\u9519\u8BEF\u3001\u7126\u70B9\u3001\u952E\u76D8\u548C\u65E0\u969C\u788D\u72B6\u6001\uFF0C\u907F\u514D\u8FB9\u754C\u60C5\u51B5\u5931\u63A7",
    prompt: buildImpeccablePrompt(
      "harden",
      "\u8BF7\u8865\u9F50\u5F53\u524D\u533A\u57DF\u5728\u52A0\u8F7D\u3001\u7A7A\u6570\u636E\u3001\u9519\u8BEF\u3001\u7126\u70B9\u3001\u952E\u76D8\u64CD\u4F5C\u548C\u65E0\u969C\u788D\u4F7F\u7528\u65F6\u7684\u72B6\u6001\uFF0C\u907F\u514D\u7528\u6237\u9047\u5230\u6CA1\u6709\u53CD\u9988\u6216\u65E0\u6CD5\u7EE7\u7EED\u7684\u60C5\u51B5\u3002"
    )
  },
  {
    id: "impeccable-onboard",
    label: "\u5F15\u5BFC",
    description: "\u4F18\u5316\u9996\u6B21\u4F7F\u7528\u3001\u7A7A\u72B6\u6001\u548C\u5173\u952E\u6B65\u9AA4\uFF0C\u544A\u8BC9\u7528\u6237\u63A5\u4E0B\u6765\u8BE5\u505A\u4EC0\u4E48",
    prompt: buildImpeccablePrompt(
      "onboard",
      "\u8BF7\u8BA9\u7B2C\u4E00\u6B21\u4F7F\u7528\u548C\u5173\u952E\u64CD\u4F5C\u66F4\u5BB9\u6613\u7406\u89E3\uFF0C\u5C24\u5176\u662F\u7A7A\u72B6\u6001\u548C\u4E0B\u4E00\u6B65\u63D0\u793A\uFF1B\u7528\u6237\u5E94\u8BE5\u80FD\u660E\u786E\u77E5\u9053\u63A5\u4E0B\u6765\u8BE5\u505A\u4EC0\u4E48\u3002"
    )
  },
  {
    id: "impeccable-colorize",
    label: "\u8272\u5F69",
    description: "\u8C03\u6574\u8272\u5F69\u5C42\u7EA7\u3001\u5BF9\u6BD4\u5EA6\u548C\u72B6\u6001\u8272\uFF0C\u540C\u65F6\u4FDD\u6301\u54C1\u724C\u4E00\u81F4",
    prompt: buildImpeccablePrompt(
      "colorize",
      "\u8BF7\u8C03\u6574\u5F53\u524D\u533A\u57DF\u7684\u989C\u8272\u5C42\u7EA7\u3001\u5BF9\u6BD4\u5EA6\u548C\u72B6\u6001\u989C\u8272\uFF0C\u8BA9\u4FE1\u606F\u66F4\u5BB9\u6613\u5206\u8FA8\uFF0C\u540C\u65F6\u4FDD\u6301\u73B0\u6709\u54C1\u724C\u98CE\u683C\u3002"
    )
  },
  {
    id: "impeccable",
    label: "UI \u8BC4\u5BA1",
    description: "\u53EA\u627E\u95EE\u9898\u5E76\u7ED9\u51FA\u4F18\u5148\u7EA7\u548C\u5EFA\u8BAE\uFF0C\u4E0D\u76F4\u63A5\u8FDB\u884C\u5927\u8303\u56F4\u4FEE\u6539",
    prompt: buildImpeccablePrompt(
      "critique",
      "\u8BF7\u53EA\u505A\u8BC4\u5BA1\uFF0C\u4E0D\u8981\u76F4\u63A5\u5927\u8303\u56F4\u4FEE\u6539\u3002\u8BF7\u5217\u51FA\u95EE\u9898\u3001\u4F18\u5148\u7EA7\u3001\u5F71\u54CD\u548C\u5177\u4F53\u4FEE\u590D\u5EFA\u8BAE\u3002"
    )
  },
  {
    id: "ui-design-image",
    label: "UI \u8BBE\u8BA1\u56FE\u7247",
    description: "\u751F\u6210\u754C\u9762\u56FE\u7247\u3001\u56FE\u6807\u3001\u5360\u4F4D\u56FE\u6216\u89C6\u89C9\u53C2\u8003\u7D20\u6750",
    keywords: "\u751F\u56FE \u751F\u6210\u56FE\u7247 \u56FE\u7247\u751F\u6210 \u8BBE\u8BA1\u56FE UI\u56FE\u7247 UI\u7D20\u6750 \u56FE\u6807 \u5360\u4F4D\u56FE \u89C6\u89C9\u53C2\u8003\u56FE imagegen image generation",
    prompt: "\u8BF7\u6839\u636E\u5F53\u524D\u6279\u6CE8\u3001\u9875\u9762\u4E0A\u4E0B\u6587\u548C\u53C2\u8003\u56FE\u7247\uFF0C\u751F\u6210\u5408\u9002\u7684\u754C\u9762\u56FE\u7247\u3001\u7D20\u6750\u3001\u56FE\u6807\u3001\u5360\u4F4D\u56FE\u6216\u89C6\u89C9\u53C2\u8003\u56FE\uFF1B\u5982\u679C\u7ED3\u679C\u9700\u8981\u653E\u56DE\u5F53\u524D\u753B\u5E03\u6216\u9879\u76EE\u7D20\u6750\uFF0C\u8BF7\u6309\u9879\u76EE\u89C4\u5219\u4FDD\u5B58\u5E76\u56DE\u5199\u3002"
  },
  {
    id: "requirements-review",
    label: "\u9700\u6C42\u8BC4\u5BA1",
    description: "\u68C0\u67E5 PRD\u3001\u76EE\u5F55\u3001\u539F\u578B\u548C\u6279\u6CE8\u662F\u5426\u4E00\u81F4",
    keywords: "\u9700\u6C42\u8BC4\u5BA1 PRD \u539F\u578B\u8BC4\u5BA1 axhub-prototype-context",
    prompt: [
      "\u8BF7\u4F7F\u7528 axhub-prototype-context \u6280\u80FD\u6765\u8BC4\u5BA1\u8FD9\u6761\u6279\u6CE8\u3002",
      "\u6280\u80FD\u6587\u6863\uFF1Ahttps://github.com/lintendo/Axhub-Skills/blob/main/skills/axhub-prototype-context/SKILL.md",
      "\u6253\u5F00\u5F53\u524D\u539F\u578B URL\uFF0C\u7B49\u9875\u9762\u52A0\u8F7D\u5B8C\u6210\u540E\u8BFB\u53D6 window.__AXHUB_ANNOTATION_SOURCE__\uFF0C\u53EA\u628A\u9875\u9762\u5F53\u4F5C\u8BC4\u5BA1\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u8981\u76F4\u63A5\u4FEE\u6539\u5B83\u3002",
      "\u91CD\u70B9\u68C0\u67E5\u76EE\u5F55\u548C PRD\u3001Markdown \u8282\u70B9\u3001\u6279\u6CE8\u8282\u70B9\u662F\u5426\u4E00\u81F4\uFF0C\u540C\u65F6\u53C2\u8003\u6E90\u7801\u4EA4\u63A5\u7EBF\u7D22\uFF0C\u6307\u51FA\u9700\u6C42\u4E0E\u539F\u578B\u4E4B\u95F4\u7684\u7F3A\u53E3\u3002"
    ].join("\n"),
    chromeOnly: true
  }
];
var SKILL_TRIGGER_QUERY_PATTERN = /^[\p{Script=Han}\p{Letter}\p{Number}_-]*$/u;
var CUSTOM_SKILL_ID_PATTERN = /^custom-[a-z0-9-]+$/u;
var PROMPT_CARD_SKILL_OPTIONS = PROMPT_CARD_SKILLS.map(
  ({ id, label, description, prompt }) => ({ id, label, description, prompt })
);
function mergePromptCardSkills(skillOptions = []) {
  const merged = new Map(
    PROMPT_CARD_SKILLS.map((skill) => [skill.id, { ...skill }])
  );
  for (const option of skillOptions) {
    const id = String(option.id ?? "").trim();
    const label = String(option.label ?? "").trim();
    if (!id || !label) continue;
    const existing = merged.get(id);
    const prompt = String(option.prompt ?? existing?.prompt ?? "").trim();
    if (!prompt) continue;
    const description = String(option.description ?? "").trim() || existing?.description || prompt.replace(/\s+/gu, " ").slice(0, 80);
    merged.set(id, {
      ...existing ?? {},
      id,
      label,
      description,
      prompt,
      ...option.keywords ? { keywords: String(option.keywords).trim() } : {},
      ...option.chromeOnly === true ? { chromeOnly: true } : {},
      ...option.custom === true ? { custom: true } : {}
    });
  }
  return [...merged.values()];
}
function normalizeSkillQuery(value) {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, "");
}
function findPromptCardSkillTrigger(text) {
  const value = String(text ?? "");
  const start = value.lastIndexOf("/");
  if (start < 0) return null;
  const query = value.slice(start + 1);
  if (!SKILL_TRIGGER_QUERY_PATTERN.test(query)) return null;
  const previousChar = start > 0 ? value[start - 1] : "";
  const previousWhitespaceIndex = Math.max(
    value.lastIndexOf(" ", start - 1),
    value.lastIndexOf("\n", start - 1),
    value.lastIndexOf("	", start - 1)
  );
  const currentTokenPrefix = value.slice(previousWhitespaceIndex + 1, start);
  if (previousChar === "/") {
    return null;
  }
  if (currentTokenPrefix.includes("/")) return null;
  return {
    query,
    start,
    end: value.length
  };
}
function clearPromptCardSkillTrigger(text) {
  const value = String(text ?? "");
  const trigger = findPromptCardSkillTrigger(value);
  if (!trigger) return value;
  return value.slice(0, trigger.start).trimEnd();
}
function filterPromptCardSkills(query, enabledSkillIds, skills = PROMPT_CARD_SKILLS) {
  const normalizedQuery = normalizeSkillQuery(query);
  const enabledIds = Array.isArray(enabledSkillIds) ? new Set(enabledSkillIds.map((item) => String(item ?? "").trim()).filter(Boolean)) : null;
  const availableSkills = skills.filter(
    (skill) => enabledIds ? enabledIds.has(skill.id) : !skill.chromeOnly
  );
  if (!normalizedQuery) return [...availableSkills];
  const exactMatches = availableSkills.filter(
    (skill) => normalizeSkillQuery(skill.id) === normalizedQuery || normalizeSkillQuery(skill.label) === normalizedQuery
  );
  if (exactMatches.length > 0) return exactMatches;
  return availableSkills.filter((skill) => {
    const searchableText = normalizeSkillQuery(
      `${skill.id} ${skill.label} ${skill.description} ${skill.keywords ?? ""}`
    );
    return searchableText.includes(normalizedQuery);
  });
}
function addPromptCardSkillSelection(selectedSkills, skill) {
  if (selectedSkills.some((selected) => selected.id === skill.id)) {
    return [...selectedSkills];
  }
  return [...selectedSkills, skill];
}
function buildPromptCardSkillPrefix(selectedSkills) {
  if (selectedSkills.length === 0) return "";
  return [
    "\u4F7F\u7528\u4EE5\u4E0B\u6280\u80FD\u6307\u4EE4\u5904\u7406\u8FD9\u6761\u6279\u6CE8\uFF1A",
    ...selectedSkills.flatMap((skill, index) => ["", `${index + 1}. ${skill.label}`, skill.prompt])
  ].join("\n");
}
function normalizePromptCardSkillIds(skillIds, skills = PROMPT_CARD_SKILLS) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const knownSkillIds = new Set(skills.map((skill) => skill.id));
  for (const skillId of skillIds) {
    const normalizedId = String(skillId ?? "").trim();
    if (!normalizedId || seen.has(normalizedId) || !knownSkillIds.has(normalizedId) && !CUSTOM_SKILL_ID_PATTERN.test(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    result.push(normalizedId);
  }
  return result;
}
function buildPromptCardSkillSavePayload(note, selectedSkills) {
  const normalizedNote = String(note ?? "").replace(/\r\n/g, "\n").trim();
  return {
    note: normalizedNote,
    skillIds: normalizedNote ? selectedSkills.map((skill) => skill.id) : []
  };
}
function deserializePromptCardSkillSelection(payload, enabledSkillIds, skillOptions = []) {
  const skills = mergePromptCardSkills(skillOptions);
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const enabledIds = Array.isArray(enabledSkillIds) ? new Set(enabledSkillIds.map((item) => String(item ?? "").trim()).filter(Boolean)) : null;
  return normalizePromptCardSkillIds(payload?.skillIds ?? [], skills).map((skillId) => skillById.get(skillId)).filter((skill) => Boolean(skill)).filter((skill) => enabledIds ? enabledIds.has(skill.id) : true);
}
function appendImplicitAnnotationSkillToPrompt(prompt, annotationSession, enabledSkillIds, skillOptions = []) {
  const normalizedPrompt = String(prompt ?? "").trim();
  if (!normalizedPrompt || !annotationSession) return normalizedPrompt;
  const defaultSkill = mergePromptCardSkills(skillOptions).find(
    (skill) => skill.id === "prototype-annotation"
  );
  if (!defaultSkill) return normalizedPrompt;
  if (Array.isArray(enabledSkillIds) && !enabledSkillIds.some((skillId) => String(skillId ?? "").trim() === defaultSkill.id)) {
    return normalizedPrompt;
  }
  if (normalizedPrompt.includes(defaultSkill.prompt)) return normalizedPrompt;
  return `${normalizedPrompt}

${buildPromptCardSkillPrefix([defaultSkill])}`;
}
function mergePromptCardSkillsIntoPromptNote(note, selectedSkills) {
  const prefix = buildPromptCardSkillPrefix(selectedSkills);
  const normalizedNote = String(note ?? "").replace(/\r\n/g, "\n").trim();
  if (!prefix) return normalizedNote;
  if (!normalizedNote) return prefix;
  return `${normalizedNote}
${prefix}`;
}

export {
  PROMPT_CARD_SKILLS,
  PROMPT_CARD_SKILL_OPTIONS,
  mergePromptCardSkills,
  findPromptCardSkillTrigger,
  clearPromptCardSkillTrigger,
  filterPromptCardSkills,
  addPromptCardSkillSelection,
  normalizePromptCardSkillIds,
  buildPromptCardSkillSavePayload,
  deserializePromptCardSkillSelection,
  appendImplicitAnnotationSkillToPrompt,
  mergePromptCardSkillsIntoPromptNote
};
