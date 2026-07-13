export function serialize(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data === null || data === undefined) {
    return "";
  }
  return String(data);
}
