// Minimal ambient declaration for the `jest-axe` package, which ships no
// TypeScript types of its own (see package.json devDependencies).
declare module 'jest-axe' {
  export type Impact = 'minor' | 'moderate' | 'serious' | 'critical';

  export interface Violation {
    id: string;
    impact: Impact;
  }

  export interface AxeResults {
    violations: Violation[];
  }

  export function axe(html: Element | string, options?: object): Promise<AxeResults>;
}
