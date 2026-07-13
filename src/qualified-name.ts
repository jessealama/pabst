/**
 * Render a property's identity: the bare function name, or `Class#method`
 * (instance) / `Class.method` (static) when it lives on a class.
 */
export function qualifiedName(
  functionName: string,
  className?: string,
  isStatic?: boolean,
): string {
  if (className === undefined) return functionName;
  return isStatic
    ? `${className}.${functionName}`
    : `${className}#${functionName}`;
}

/**
 * Matches the strings qualifiedName() produces: a bare identifier, or two
 * identifiers joined by `#` (instance) / `.` (static). Segments are ASCII
 * TypeScript identifiers; unicode identifiers (e.g. `précis`) are legal
 * TypeScript but not matched — a known gap, kept so the pattern stays within
 * JSON Schema's ECMA-regex subset (schemas/issue.schema.json embeds it; a
 * sync test keeps the two spellings identical).
 */
export const QUALIFIED_NAME_PATTERN =
  /^[$A-Za-z_][$A-Za-z0-9_]*([#.][$A-Za-z_][$A-Za-z0-9_]*)?$/;
