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
 * Matches exactly the strings qualifiedName() can produce: a bare
 * identifier, or two identifiers joined by `#` (instance) / `.` (static).
 * The issue wire schema embeds this pattern (src/issue-schema.ts), so it
 * must stay within JSON Schema's ECMA-regex subset.
 */
export const QUALIFIED_NAME_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*([#.][A-Za-z_][A-Za-z0-9_]*)?$/;
