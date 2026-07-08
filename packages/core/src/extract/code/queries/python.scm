; Tier-1 Python queries (CONTEXA-IMPL §5.2). function_definition inside a class is
; reclassified to `method` in extract.ts (callable/container ancestry). Module
; docstrings live in the body's first string and are attached in extract.ts.

; --- definitions ---
(function_definition name: (identifier) @name) @def.function
(class_definition name: (identifier) @name) @def.class

; --- imports ---
(import_statement name: (dotted_name) @import.source) @import
(import_from_statement module_name: (dotted_name) @import.source) @import

; --- call sites ---
(call function: (identifier) @call.name) @call
(call function: (attribute attribute: (identifier) @call.name)) @call
