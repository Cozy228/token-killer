; Tier-1 TypeScript / TSX queries (CONTEXA-IMPL §5.2). Seeded from
; tree-sitter-analyzer's typescript module, pruned to our uniform capture
; vocabulary: @def.<kind> on the definition node + @name on its identifier;
; @import (+ @import.source); @call (+ @call.name). Locals/nested defs are
; dropped in extract.ts (callable-ancestor filter), so const patterns need no
; top-level anchoring here.

; --- definitions ---
(function_declaration name: (identifier) @name) @def.function
(generator_function_declaration name: (identifier) @name) @def.function

(method_definition name: (property_identifier) @name) @def.method

(class_declaration name: (type_identifier) @name) @def.class
(abstract_class_declaration name: (type_identifier) @name) @def.class
(interface_declaration name: (type_identifier) @name) @def.class
; exported type aliases carry named contracts (`export type Foo = {…}`); index
; them under the existing `class` kind, exactly like interfaces (FIX-1 / R-B).
; Function-local type aliases are dropped by the callable-ancestor filter.
(type_alias_declaration name: (type_identifier) @name) @def.class

; function-valued declarators become functions; plain const/let become const
; (id de-dup with kind priority keeps the function reading when both match).
(variable_declarator name: (identifier) @name value: (arrow_function)) @def.function
(variable_declarator name: (identifier) @name value: (function_expression)) @def.function
(lexical_declaration (variable_declarator name: (identifier) @name)) @def.const

; --- imports ---
(import_statement source: (string) @import.source) @import

; --- call sites (best-effort callee identifier) ---
(call_expression function: (identifier) @call.name) @call
(call_expression function: (member_expression property: (property_identifier) @call.name)) @call
(new_expression constructor: (identifier) @call.name) @call
