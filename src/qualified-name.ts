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
