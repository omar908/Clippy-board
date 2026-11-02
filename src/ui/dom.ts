export function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function qs<T extends Element>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector<T>(selector);
}

export function qsa<T extends Element>(selector: string, parent: ParentNode = document): NodeListOf<T> {
  return parent.querySelectorAll<T>(selector);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, attrs?: Record<string, string>): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      element.setAttribute(k, v);
    }
  }
  return element;
}

export function setText(el: HTMLElement, text: string) {
  el.textContent = text;
}

export function setHTML(el: HTMLElement, html: string) {
  el.innerHTML = html;
}

