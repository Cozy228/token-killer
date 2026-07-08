; Tier-1 C# queries (CONTEXA-IMPL §5.2). Enclosing class/struct/record/namespace
; supplies the qualifier via ancestry; `///` XML doc comments precede the member.

; --- definitions ---
(class_declaration name: (identifier) @name) @def.class
(interface_declaration name: (identifier) @name) @def.class
(struct_declaration name: (identifier) @name) @def.class
(record_declaration name: (identifier) @name) @def.class
(enum_declaration name: (identifier) @name) @def.class

(method_declaration name: (identifier) @name) @def.method
(constructor_declaration name: (identifier) @name) @def.method

(property_declaration name: (identifier) @name) @def.const
(field_declaration (variable_declaration (variable_declarator (identifier) @name))) @def.const

; --- imports ---
(using_directive) @import

; --- call sites ---
(invocation_expression function: (identifier) @call.name) @call
(invocation_expression function: (member_access_expression name: (identifier) @call.name)) @call
