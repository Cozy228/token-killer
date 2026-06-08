import { defineHandler } from "../define.js";

function formatMaven(text: string): string {
  const lines = text.split(/\r?\n/);
  const important = lines
    .filter((line) =>
      /\[ERROR\]|FAILURE|Failures:|Tests run:|Failed to execute goal|Reactor Summary/.test(line),
    )
    .filter((line) => !/Downloading dependency-/.test(line))
    .slice(0, 80);
  const failedModule = lines.find(
    (line) => /FAILURE/.test(line) && !line.includes("BUILD FAILURE"),
  );
  const out = ["Maven failed"];
  if (failedModule) out.push(`Failed module: ${failedModule.replace(/\[INFO\]/g, "").trim()}`);
  out.push(...important.map((line) => line.trim()));
  return `${[...new Set(out)].join("\n")}\n`;
}

export const mavenHandler = defineHandler({
  name: "maven",
  programs: ["mvn"],

  match(command) {
    return command.program === "mvn" || command.program.endsWith("mvn.cmd");
  },

  format: (raw, _command, options) => formatMaven(`${raw.stdout}\n${raw.stderr}`),
});
