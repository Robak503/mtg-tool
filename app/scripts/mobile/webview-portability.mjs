import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

const SOURCE_EXTENSIONS = Object.freeze([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((name) => {
    const bare = name.replace(/^node:/, "");
    return [bare, `node:${bare}`];
  }),
);

const isIdentifierStart = (character) => /[A-Za-z_$]/.test(character ?? "");
const isIdentifierPart = (character) => /[A-Za-z0-9_$]/.test(character ?? "");

function readIdentifier(source, start) {
  let end = start + 1;
  while (isIdentifierPart(source[end])) end += 1;
  return { value: source.slice(start, end), end };
}

function readQuoted(source, start) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      if (index + 1 < source.length) value += source[++index];
      continue;
    }
    if (quote === "`" && character === "$" && source[index + 1] === "{") return null;
    if (character === quote) return { value, end: index + 1 };
    value += character;
  }
  return null;
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      return end === -1 ? source.length : skipTrivia(source, end + 2);
    }
    break;
  }
  return index;
}

function fromClauseSpecifier(source, start) {
  let index = start;
  while (index < source.length) {
    index = skipTrivia(source, index);
    if (index >= source.length || source[index] === ";") return null;

    const quoted = readQuoted(source, index);
    if (quoted) {
      index = quoted.end;
      continue;
    }
    if (isIdentifierStart(source[index])) {
      const identifier = readIdentifier(source, index);
      index = identifier.end;
      if (identifier.value === "from") {
        const specifier = readQuoted(source, skipTrivia(source, index));
        return specifier?.value ?? null;
      }
      continue;
    }
    index += 1;
  }
  return null;
}

/**
 * Extract literal ESM and CommonJS module specifiers without mistaking Oracle
 * text, comments, or diagnostic prose for source code. Computed specifiers are
 * intentionally absent and documented as a static-analysis limit.
 */
export function moduleSpecifiersIn(source) {
  const found = new Set();
  let index = 0;

  while (index < source.length) {
    index = skipTrivia(source, index);
    if (index >= source.length) break;

    const quoted = readQuoted(source, index);
    if (quoted) {
      index = quoted.end;
      continue;
    }
    if (!isIdentifierStart(source[index])) {
      index += 1;
      continue;
    }

    const identifier = readIdentifier(source, index);
    index = identifier.end;

    if (identifier.value === "import") {
      const afterImport = skipTrivia(source, index);
      if (source[afterImport] === ".") continue;
      if (source[afterImport] === "(") {
        const dynamic = readQuoted(source, skipTrivia(source, afterImport + 1));
        if (dynamic) found.add(dynamic.value);
        continue;
      }
      const sideEffect = readQuoted(source, afterImport);
      if (sideEffect) {
        found.add(sideEffect.value);
        index = sideEffect.end;
        continue;
      }
      const specifier = fromClauseSpecifier(source, afterImport);
      if (specifier) found.add(specifier);
      continue;
    }

    if (identifier.value === "export") {
      const specifier = fromClauseSpecifier(source, index);
      if (specifier) found.add(specifier);
      continue;
    }

    if (identifier.value === "require") {
      const openParen = skipTrivia(source, index);
      if (source[openParen] === "(") {
        const required = readQuoted(source, skipTrivia(source, openParen + 1));
        if (required) found.add(required.value);
      }
    }
  }

  return [...found];
}

function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isNodeBuiltin(specifier) {
  if (NODE_BUILTINS.has(specifier)) return true;
  const withoutNode = specifier.replace(/^node:/, "");
  return NODE_BUILTINS.has(withoutNode.split("/")[0]);
}

function resolveSource(fromFile, specifier) {
  const cleanSpecifier = specifier.replace(/[?#].*$/, "");
  const base = path.resolve(path.dirname(fromFile), cleanSpecifier);
  const explicitExtension = path.extname(base);
  const candidates = [
    ...(SOURCE_EXTENSIONS.includes(explicitExtension) ? [base] : []),
    ...(!explicitExtension ? SOURCE_EXTENSIONS.map((extension) => base + extension) : []),
    ...(!explicitExtension
      ? SOURCE_EXTENSIONS.map((extension) => path.join(base, "index" + extension))
      : []),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { kind: "source", file: candidate };
    }
  }

  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    return { kind: "asset", file: base };
  }
  return null;
}

function posixRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function absolutePrefixes(workspaceRoot, prefixes) {
  return prefixes.map((prefix) => path.resolve(workspaceRoot, prefix.replace(/\/$/, "")));
}

function pathIsWithin(file, prefix) {
  const relative = path.relative(prefix, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Walk the manifest's real transitive module graph and return every portability
 * violation with the import chain that reached it. This is build/test tooling;
 * it is never imported by the WebView runtime.
 */
export function scanWebviewRuntime({ workspaceRoot, manifest }) {
  const root = path.resolve(workspaceRoot);
  const allowedPackages = new Set(manifest.allowedPackages ?? []);
  const forbiddenPrefixes = absolutePrefixes(root, manifest.forbiddenPathPrefixes ?? []);
  const violations = [];
  const scanned = new Set();
  const queue = [];

  for (const entrypoint of manifest.entrypoints ?? []) {
    const file = path.resolve(root, entrypoint.file);
    if (!pathIsWithin(file, root)) {
      violations.push({
        kind: "entrypoint-outside-workspace",
        specifier: entrypoint.file,
        chain: [entrypoint.file],
      });
      continue;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      violations.push({
        kind: "missing-entrypoint",
        specifier: entrypoint.file,
        chain: [entrypoint.file],
      });
      continue;
    }
    queue.push({ file, chain: [file] });
  }

  while (queue.length > 0) {
    const { file, chain } = queue.shift();
    if (scanned.has(file)) continue;
    scanned.add(file);

    const source = fs.readFileSync(file, "utf8");
    for (const specifier of moduleSpecifiersIn(source)) {
      const relativeChain = chain.map((item) => posixRelative(root, item));

      if (isNodeBuiltin(specifier)) {
        violations.push({ kind: "node-builtin", specifier, chain: relativeChain });
        continue;
      }

      if (!specifier.startsWith(".")) {
        const dependency = packageName(specifier);
        if (!allowedPackages.has(dependency)) {
          violations.push({ kind: "unapproved-package", specifier, chain: relativeChain });
        }
        continue;
      }

      const resolved = resolveSource(file, specifier);
      if (!resolved) {
        violations.push({ kind: "unresolved-relative-import", specifier, chain: relativeChain });
        continue;
      }
      if (resolved.kind === "asset") {
        violations.push({
          kind: "runtime-asset-import",
          specifier,
          chain: [...relativeChain, posixRelative(root, resolved.file)],
        });
        continue;
      }
      if (!pathIsWithin(resolved.file, root)) {
        violations.push({
          kind: "source-outside-workspace",
          specifier,
          chain: [...relativeChain, resolved.file],
        });
        continue;
      }

      const forbidden = forbiddenPrefixes.find((prefix) => pathIsWithin(resolved.file, prefix));
      if (forbidden) {
        violations.push({
          kind: "forbidden-source-path",
          specifier,
          chain: [...relativeChain, posixRelative(root, resolved.file)],
        });
        continue;
      }

      if (!scanned.has(resolved.file))
        queue.push({ file: resolved.file, chain: [...chain, resolved.file] });
    }
  }

  return {
    violations,
    scanned: [...scanned].map((file) => posixRelative(root, file)).sort(),
  };
}

export function describeWebviewViolations(violations) {
  return violations
    .map(
      ({ kind, specifier, chain }) =>
        `${kind}: ${specifier}\n  reached via ${chain.join("\n           -> ")}`,
    )
    .join("\n\n");
}
