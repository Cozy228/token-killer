# ctx · greet — indexed
greet lib.ts:1-3 [s562e1]
1	export function greet(name: string): string {
2	  return "hi " + name;
3	}
← main [s344e7]
**`code`**
main lib.ts:4-6 [s344e7]
4	export function main(): string {
5	  return greet("world");
6	}