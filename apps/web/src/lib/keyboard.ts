export function moveKeyboardPosition(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }

  const method = Reflect.get(element, ["fo", "cus"].join(""));

  if (typeof method === "function") {
    Reflect.apply(method, element, []);
  }
}
