import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export interface HardwareProfile {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  cpuAvailable: boolean;
  cudaAvailable: boolean;
  metalAvailable: boolean;
  recommendedBackend: 'cpu' | 'cuda' | 'metal';
}

export class HardwareDetector {
  detect(): HardwareProfile {
    const cudaAvailable = this.commandExists('nvidia-smi') || existsSync('/usr/local/cuda');
    const metalAvailable = process.platform === 'darwin' && process.arch === 'arm64';

    return {
      platform: process.platform,
      arch: process.arch,
      cpuAvailable: true,
      cudaAvailable,
      metalAvailable,
      recommendedBackend: cudaAvailable ? 'cuda' : metalAvailable ? 'metal' : 'cpu',
    };
  }

  private commandExists(command: string): boolean {
    try {
      execSync(`command -v ${command}`, { stdio: 'ignore', shell: '/bin/sh' });
      return true;
    } catch {
      return false;
    }
  }
}
