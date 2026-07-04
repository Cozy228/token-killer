; Tier-1 JavaScript / JSX queries (CTX-IMPL §5.2). Same capture vocabulary as
; typescript.scm; no type-only nodes.

; --- definitions ---
(function_declaration name: (identifier) @name) @def.function
(generator_function_declaration name: (identifier) @name) @def.function

(method_definition name: (property_identifier) @name) @def.method

(class_declaration name: (identifier) @name) @def.class

(variable_declarator name: (identifier) @name value: (arrow_function)) @def.function
(variable_declarator name: (identifier) @name value: (function_expression)) @def.function
(lexical_declaration (variable_declarator name: (identifier) @name)) @def.const

; --- imports ---
(import_statement source: (string) @import.source) @import

; --- call sites ---
(call_expression function: (identifier) @call.name) @call
(call_expression function: (member_expression property: (property_identifier) @call.name)) @call
(new_expression constructor: (identifier) @call.name) @call
