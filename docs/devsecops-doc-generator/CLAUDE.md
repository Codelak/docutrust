# DocuTrust DevSecOps Documentation Generator

## Purpose

This project provides a reusable documentation standard for converting
DocuTrust DevSecOps project walkthroughs into professional implementation
SOPs.

There are three independent DevSecOps projects:

- Project 1
- Project 2
- Project 3

Process projects independently.

Never mix technical content, screenshots, evidence, configurations,
commands, or findings between projects.

## Documentation References

Sop_Sample_1.pdf:
Primary reference for document structure and procedure organization.

Sop_Sample_2.pdf:
Secondary reference for Word document visual presentation and formatting.

These samples are STYLE REFERENCES ONLY.

They are not technical sources for the DevSecOps projects.

## Technical Source of Truth

For each project, the project's own walkthrough and supporting files are
the technical source of truth.

Do not invent technical details.

Do not import commands, configurations, findings, or procedures from
another project.

## Project Processing Rule

Process ONE project at a time.

Before generating a project's final SOP:

1. Analyze the project.
2. Analyze its evidence.
3. Analyze the walkthrough.
4. Propose the document structure.
5. Identify missing or ambiguous information.
6. Review idempotency and rerun behavior.
7. Obtain approval.
8. Generate the final SOP.
9. Validate the generated DOCX.

## Project 1

Location:

../project-1/

## Project 2

Location:

../project-2/

Additional documentation:

../project-2/sca-policy.md

## Project 3

Location:

../project-3/

## Output

Generated SOPs must be stored separately.

Example:

output/
├── project-1/
├── project-2/
└── project-3/

Never overwrite an existing project's SOP without explicit instruction.
