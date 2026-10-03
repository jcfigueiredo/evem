// The minimal JSX types the React client sample needs: elements, children passed between tags, and
// typed event handlers on intrinsic elements (so `onChange={event => …}` isn't an implicit any)
declare global {
  namespace JSX {
    interface Element {}
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements {
      [name: string]: {
        [attribute: string]: unknown;
        onChange?: (event: { target: HTMLInputElement }) => void;
        onClick?: (event: MouseEvent) => void;
        onSubmit?: (event: SubmitEvent) => void;
      };
    }
  }
}

export {};
