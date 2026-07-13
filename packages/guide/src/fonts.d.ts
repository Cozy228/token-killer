// Ambient module declarations for the preinstalled @fontsource font packages
// (side-effect CSS imports). Substrate infrastructure so variant builders can
// `import "@fontsource-variable/<x>"` without a tsc type error. Vite resolves
// the CSS at build time; these declarations only satisfy the type checker.

declare module "@fontsource-variable/*";
declare module "@fontsource/*";
