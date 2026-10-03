import { join, relative } from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from './codeBlocks';

/** The published entry points, mapped to their sources */
const PACKAGE_PATHS: Record<string, string[]> = {
  '@jcfigueiredo/evem': ['src/index.ts'],
  '@jcfigueiredo/evem/websocket': ['src/websocket/index.ts'],
  '@jcfigueiredo/evem/sse': ['src/sse/index.ts'],
  '@jcfigueiredo/evem/sse/server': ['src/sse/server.ts']
};

export interface VirtualFile {
  /** Path relative to the repository root (it doesn't exist on disk); `.ts` or `.tsx` */
  path: string;
  code: string;
}

export interface TypeDiagnostic {
  /** The virtual file's path, as given */
  path: string;
  /** 1-based line within the virtual file (0 if the diagnostic has no position) */
  line: number;
  /** TypeScript error code, e.g. 2345 */
  code: number;
  message: string;
}

/** The repository's compiler options, with the package names mapped to src/ and JSX kept as is */
function compilerOptions(): ts.CompilerOptions {
  const configPath = join(REPO_ROOT, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, REPO_ROOT);
  return {
    ...options,
    // tsconfig.json skips checking every .d.ts file; the preludes must be checked, or a broken one could hide errors
    skipLibCheck: false,
    noEmit: true,
    incremental: false,
    jsx: ts.JsxEmit.Preserve,
    paths: { ...options.paths, ...PACKAGE_PATHS }
  };
}

/**
 * Type-check in-memory files against the library's sources, with the repository's compiler options.
 * `declarationFiles` (absolute paths) are added to the program, e.g. preludes that declare globals.
 * Returns the syntactic and semantic diagnostics of the in-memory files and of the declaration files.
 */
export function typeCheck(files: VirtualFile[], declarationFiles: string[] = []): TypeDiagnostic[] {
  const options = compilerOptions();
  const virtual = new Map(files.map(file => [join(REPO_ROOT, file.path), file]));

  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const file = virtual.get(fileName);
    return file
      ? ts.createSourceFile(fileName, file.code, languageVersion, true)
      : getSourceFile.call(host, fileName, languageVersion, ...rest);
  };
  host.fileExists = fileName => virtual.has(fileName) || fileExists.call(host, fileName);
  host.readFile = fileName => virtual.get(fileName)?.code ?? readFile.call(host, fileName);

  const checked = [...virtual.keys(), ...declarationFiles];
  const program = ts.createProgram(checked, options, host);
  return checked.flatMap(fileName => {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`${fileName} wasn't added to the program`);
    }
    return [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)].map(
      diagnostic => ({
        path: virtual.get(fileName)?.path ?? relative(REPO_ROOT, fileName),
        line:
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
            : 0,
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
      })
    );
  });
}
