const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file));
const declarationPattern =
  /^(?:(?:export\s+(?:default\s+)?)|(?:declare\s+)|(?:abstract\s+))*(?:(?:const\s+)?enum|class|type|interface|const|let|var|(?:async\s+)?function)\s+([A-Za-z_$][\w$]*)\b/;
const duplicates = [];

for (const file of files) {
  const declarations = new Map();
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = declarationPattern.exec(line);
    if (!match) return;

    const name = match[1];
    const declarationKind = match[0].match(
      /(?:const\s+)?(enum|class|type|interface|const|let|var|function)\s+/,
    )[1];
    const namespaces =
      declarationKind === "class" || declarationKind === "enum"
        ? ["type", "value"]
        : ["type"].includes(declarationKind)
          ? ["type"]
          : declarationKind === "interface"
            ? ["type"]
            : ["value"];

    for (const namespace of namespaces) {
      const key = `${namespace}:${name}`;
      if (declarations.has(key)) {
        duplicates.push(
          `${file}:${index + 1}: duplicate top-level declaration "${name}" (first declared on line ${declarations.get(key)})`,
        );
      } else {
        declarations.set(key, index + 1);
      }
    }
  });
}

if (duplicates.length > 0) {
  console.error(duplicates.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${files.length} source files for duplicate top-level declarations.`,
  );
}
