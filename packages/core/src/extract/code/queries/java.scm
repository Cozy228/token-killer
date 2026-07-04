; Tier-1 Java queries (CTX-IMPL §5.2). Enclosing class/record/enum/interface
; supplies the qualifier via ancestry in extract.ts; javadoc `/** */` blocks are
; attached as the preceding comment.

; --- definitions ---
(class_declaration name: (identifier) @name) @def.class
(interface_declaration name: (identifier) @name) @def.class
(enum_declaration name: (identifier) @name) @def.class
(record_declaration name: (identifier) @name) @def.class

(method_declaration name: (identifier) @name) @def.method
(constructor_declaration name: (identifier) @name) @def.method

(field_declaration declarator: (variable_declarator name: (identifier) @name)) @def.const

; --- imports ---
(import_declaration (scoped_identifier) @import.source) @import

; --- call sites ---
(method_invocation name: (identifier) @call.name) @call
(object_creation_expression type: (type_identifier) @call.name) @call
