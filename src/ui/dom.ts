export function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function qs<T extends Element>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector<T>(selector);
}

export function qsa<T extends Element>(selector: string, parent: ParentNode = document): NodeListOf<T> {
  return parent.querySelectorAll<T>(selector);
}
