; Tier-1 Rust queries (CTX-IMPL §5.2). function_item inside an `impl` block is
; reclassified to `method` and qualified by the impl's type (extract.ts). `///`
; outer doc comments precede the item.

; --- definitions ---
(function_item name: (identifier) @name) @def.function

(struct_item name: (type_identifier) @name) @def.class
(enum_item name: (type_identifier) @name) @def.class
(trait_item name: (type_identifier) @name) @def.class

(const_item name: (identifier) @name) @def.const
(static_item name: (identifier) @name) @def.const

; --- imports ---
(use_declaration argument: (_) @import.source) @import

; --- call sites ---
(call_expression function: (identifier) @call.name) @call
(call_expression function: (scoped_identifier name: (identifier) @call.name)) @call
(call_expression function: (field_expression field: (field_identifier) @call.name)) @call
(macro_invocation macro: (identifier) @call.name) @call
