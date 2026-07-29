export function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    attributes?: Record<string, string>;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(name, value);
  }
  return node;
}

export function button(
  label: string,
  options: {
    className?: string;
    title?: string;
    pressed?: boolean;
  } = {},
): HTMLButtonElement {
  const node = element('button', {
    ...(options.className === undefined ? {} : { className: options.className }),
    text: label,
    attributes: {
      type: 'button',
      ...(options.title ? { title: options.title } : {}),
      ...(options.pressed !== undefined ? { 'aria-pressed': String(options.pressed) } : {}),
    },
  });
  return node;
}

export function replaceChildren(
  parent: Element,
  children: (Node | string | undefined | false)[],
): void {
  parent.replaceChildren(...children.filter((child): child is Node | string => Boolean(child)));
}
