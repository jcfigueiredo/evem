/** A value a scenario control can have */
export type ControlValue = string | number | boolean;

/** An action block of a scenario's code: the lines after a `// ▶ Label` comment, up to the next one */
export interface Action {
  id: string;
  label: string;
}

const ACTION_MARKER = /^\/\/ ▶ (.+)$/;
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** A control value as a JavaScript literal: strings in single quotes, numbers and booleans as they are */
export function toLiteral(value: ControlValue): string {
  return typeof value === 'string' ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(value);
}

/** A scenario's code with each `{{name}}` replaced by that control's value as a literal */
export function renderCode(
  template: string,
  values: Record<string, ControlValue>,
  raw: ReadonlySet<string> = new Set()
): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (!(name in values)) {
      throw new Error(`No control named ${name} for ${placeholder}`);
    }
    // A raw control's values are code (`ErrorPolicy.THROW`, `[1, 2]`), written as they are
    return raw.has(name) ? String(values[name]) : toLiteral(values[name]!);
  });
}

/** Lowercase words joined by dashes: 'Publish order.created' → 'publish-order-created' */
export function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The setup code (before the first marker) and the action blocks of a scenario's code */
export function splitActions(code: string): { setup: string; actions: Array<Action & { code: string }> } {
  const lines = code.split('\n');
  const setup: string[] = [];
  const actions: Array<Action & { code: string[] }> = [];
  for (const line of lines) {
    const marker = ACTION_MARKER.exec(line.trim());
    if (marker) {
      const label = marker[1]!.trim();
      actions.push({ id: slug(label), label, code: [] });
    } else if (actions.length > 0) {
      actions[actions.length - 1]!.code.push(line);
    } else {
      setup.push(line);
    }
  }
  return { setup: setup.join('\n'), actions: actions.map(action => ({ ...action, code: action.code.join('\n') })) };
}

/** An entry point of the package that the code imports, and the exported names it imports from it */
export interface PackageImport {
  entryPoint: string;
  names: string[];
}

const PACKAGE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"](@jcfigueiredo\/evem(?:\/[\w/]+)?)['"];?[ \t]*$/gm;

/**
 * The body of an async function that runs a scenario's setup and returns its actions as functions, so the
 * actions share the setup's variables. Imports from the package become lookups in `__modules`; any other
 * import or export is reported as an error.
 */
export function compileProgram(code: string): { body: string; actions: Action[]; imports: PackageImport[] } {
  const { setup, actions } = splitActions(code);
  const imports: PackageImport[] = [];
  const resolvedSetup = setup.replace(PACKAGE_IMPORT, (_, names: string, entryPoint: string) => {
    const specifiers = names
      .split(',')
      .map(name => name.trim())
      .filter(name => name !== '' && !name.startsWith('type '));
    imports.push({ entryPoint, names: specifiers.map(specifier => specifier.split(/\s+as\s+/)[0]!) });
    const bindings = specifiers.map(specifier => specifier.replace(/\s+as\s+/, ': '));
    return `const { ${bindings.join(', ')} } = __modules[${JSON.stringify(entryPoint)}];`;
  });
  const unsupported = /^\s*(?:import|export)\b.*$/m.exec(
    [resolvedSetup, ...actions.map(action => action.code)].join('\n')
  );
  if (unsupported) {
    throw new Error(`Only imports from @jcfigueiredo/evem are supported here (found: ${unsupported[0].trim()})`);
  }
  const actionFunctions = actions
    .map(action => `  ${JSON.stringify(action.id)}: async () => {\n${action.code}\n  }`)
    .join(',\n');
  return {
    body: `${resolvedSetup}\nreturn {\n${actionFunctions}\n};`,
    actions: actions.map(({ id, label }) => ({ id, label })),
    imports
  };
}
