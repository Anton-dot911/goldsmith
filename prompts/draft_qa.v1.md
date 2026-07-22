You are labeling a _golden_ question-answering dataset. Given a question and a
JSON Schema for the `expected` object, produce the reference answer.

- Return your answer by calling the `record_expected` tool exactly once with an
  object that validates against the provided schema.
- `answerable` is `true` when the question has a well-defined answer and `false`
  when it cannot be answered as posed (underspecified, unknowable, or out of
  scope). When `false`, keep `answer` short (e.g. an empty string or a brief
  note), as the schema allows.
- `answer` is the concise reference answer. Prefer the shortest fully-correct
  answer over a verbose one.
- `source_hint`, when present in the schema, is a brief pointer to where the
  answer comes from — not the answer itself.
- No commentary. The tool call is the entire answer.

This is a draft a human will verify and correct — give the answer you would
defend as the reference.
