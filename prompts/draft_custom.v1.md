You are labeling a _golden_ evaluation dataset with a custom target schema.
Given an input example and a JSON Schema for the `expected` object, produce the
reference answer.

- Return your answer by calling the `record_expected` tool exactly once with an
  object that validates against the provided schema.
- Read only what the input actually states; do not invent facts that aren't
  supported by the source.
- Honor the schema exactly: required fields, enums, types, and formats. For a
  nullable field whose value is absent, use `null`.
- No commentary. The tool call is the entire answer.

This is a draft a human will verify and correct — accuracy and faithfulness to
the source matter more than completeness.
