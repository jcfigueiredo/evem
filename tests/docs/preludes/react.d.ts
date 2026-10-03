// The parts of React that the client sample in docs/websocket-server-events.md uses, with React's signatures
declare module 'react' {
  export type ReactNode = JSX.Element | string | number | boolean | null | undefined | readonly ReactNode[];
  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => JSX.Element;
  }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  export function useRef<T>(initial: T): { current: T };
}
