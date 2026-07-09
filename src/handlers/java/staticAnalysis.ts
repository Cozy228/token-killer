function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\[(?:INFO|ERROR|WARNING)\]\s?/, "")
        .replace(/^> Task [\w:.-]+\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

function unique(lines: string[]): string[] {
  return [...new Set(lines)];
}

export function parseDependencyResolutionOutput(text: string): string[] {
  return unique(
    linesOf(text).filter(
      (line) =>
        /Could not resolve dependencies/.test(line) ||
        /Could not resolve all files for configuration/.test(line) ||
        /Could not find [\w.-]+:[\w.-]+:[\w.-]+/.test(line) ||
        /Could not resolve [\w.-]+:[\w.-]+:[\w.-]+/.test(line) ||
        /Required by:/.test(line) ||
        /^project\s+:[\w.-]+/.test(line) ||
        /Searched in the following locations:/.test(line) ||
        /^[-\\> ]*https?:\/\/.+/.test(line) ||
        /from\/to\s+[\w.-]+\s+\(https?:\/\//.test(line),
    ),
  );
}

export function parseSpringFailureOutput(text: string): string[] {
  if (
    !/APPLICATION FAILED TO START|Failed to load ApplicationContext|BeanCreationException|PortInUseException|UnsatisfiedDependencyException/.test(
      text,
    )
  ) {
    return [];
  }

  return unique(
    linesOf(text).filter(
      (line) =>
        /APPLICATION FAILED TO START/.test(line) ||
        /Failed to load ApplicationContext/.test(line) ||
        /BeanCreationException|UnsatisfiedDependencyException|PortInUseException|BindException/.test(
          line,
        ) ||
        /DataSource|datasource|jdbc|8080|port/i.test(line) ||
        line.startsWith('Description:') ||
        line.startsWith('Action:') ||
        line.startsWith('Caused by:') ||
        /^\s*at (?!org\.springframework\.|org\.junit\.|org\.apache\.maven\.|org\.gradle\.|java\.base\/|jdk\.internal\.)/.test(
          line,
        ),
    ),
  );
}

export function parseCheckstyleOutput(text: string): string[] {
  return unique(
    linesOf(text).filter(
      (line) =>
        !/^--- |^Failed to execute goal /.test(line) &&
        (/Checkstyle/i.test(line) ||
          /checkstyle[-/]result|checkstyle\.html|checkstyle\.xml/i.test(line) ||
          /\.java:\d+(?::\d+)?:\s*(?:error|warning|.+\[.+\])/.test(line) ||
          /\b(?:violation|violations)\b/i.test(line)),
    ),
  );
}

export function parsePmdOutput(text: string): string[] {
  return unique(
    linesOf(text).filter(
      (line) =>
        !/^--- |^Failed to execute goal /.test(line) &&
        (/\bPMD\b|pmd[-/]main|pmd\.html|pmd\.xml/i.test(line) ||
          /\.java:\d+:\s*(?:Avoid|Unused|Cyclomatic|Priority|Rule|PMD)/i.test(line) ||
          /priority\s+\d|category|rule/i.test(line) ||
          /\b(?:violation|violations)\b/i.test(line)),
    ),
  );
}

export function parseSpotbugsOutput(text: string): string[] {
  return unique(
    linesOf(text).filter(
      (line) =>
        !/^--- |^Failed to execute goal /.test(line) &&
        (/SpotBugs|spotbugs[-/]main|spotbugs\.html|spotbugs\.xml/i.test(line) ||
          /\b(?:Bug type|Category|Rank|Priority|Confidence):/i.test(line) ||
          /\b(?:Class|Method|Field|Source line):/i.test(line) ||
          /\b(?:bugs?|violations?)\b/i.test(line)),
    ),
  );
}

export function parseJacocoOutput(text: string): string[] {
  return unique(
    linesOf(text).filter(
      (line) =>
        !/^--- |^Failed to execute goal /.test(line) &&
        (/JaCoCo|jacocoTestCoverageVerification|jacoco\.html|jacoco\.xml/i.test(line) ||
          /Rule violated|coverage rule|Coverage checks?/.test(line) ||
          /\b(?:INSTRUCTION|BRANCH|LINE|COMPLEXITY|METHOD|CLASS)\b/.test(line) ||
          /\b(?:missed|covered|ratio|minimum|threshold|limit)\b/i.test(line)),
    ),
  );
}

export function parseJavaEcosystemOutput(text: string): string[] {
  return unique([
    ...parseDependencyResolutionOutput(text),
    ...parseSpringFailureOutput(text),
    ...parseCheckstyleOutput(text),
    ...parsePmdOutput(text),
    ...parseSpotbugsOutput(text),
    ...parseJacocoOutput(text),
  ]);
}
