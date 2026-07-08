; Tier-1 Go queries (CONTEXA-IMPL §5.2). Method receivers become the qualifier
; (`Type.Method`) in extract.ts. struct/interface type specs map to the class
; kind.

; --- definitions ---
(function_declaration name: (identifier) @name) @def.function
(method_declaration name: (field_identifier) @name) @def.method

(type_declaration (type_spec name: (type_identifier) @name type: (struct_type))) @def.class
(type_declaration (type_spec name: (type_identifier) @name type: (interface_type))) @def.class

(const_declaration (const_spec name: (identifier) @name)) @def.const

; --- imports ---
(import_spec path: (interpreted_string_literal) @import.source) @import

; --- call sites ---
(call_expression function: (identifier) @call.name) @call
(call_expression function: (selector_expression field: (field_identifier) @call.name)) @call
