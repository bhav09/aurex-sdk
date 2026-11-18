import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve extensionless TypeScript relative imports (e.g. "./pricing" -> "./pricing.ts") natively in Node 25+
registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !path.extname(specifier)) {
      const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
      const candidate = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
      if (fs.existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

await import("./smoke.ts");
