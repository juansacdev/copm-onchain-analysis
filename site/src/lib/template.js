// Dictionary templates hold named placeholders such as "{events} eventos".
// A placeholder with no value is a build error, never the text "undefined".

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export function interpolate(template, values) {
  return template.replace(PLACEHOLDER, (_match, name) => {
    const value = values[name];
    if (value === undefined || value === null) {
      throw new Error(`missing value for placeholder "${name}" in template: ${template}`);
    }
    return String(value);
  });
}

export function placeholdersOf(template) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}
