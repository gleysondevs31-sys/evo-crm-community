declare namespace NodeJS {
  type Platform = 'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd';
  type Architecture = 'arm' | 'arm64' | 'ia32' | 'loong64' | 'mips' | 'mipsel' | 'ppc' | 'ppc64' | 'riscv64' | 's390' | 's390x' | 'x64';
}

declare const process: {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  env: Record<string, string | undefined>;
};

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
}

declare module 'node:child_process' {
  export function execSync(command: string, options?: { stdio?: 'ignore' | 'inherit' | 'pipe'; shell?: string }): unknown;
}
