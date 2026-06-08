import type { HardwareProfile } from './hardware-detector';
import { HardwareDetector } from './hardware-detector';

export interface LlamaCompilePlan {
  backend: 'cpu' | 'cuda' | 'metal';
  cmakeFlags: string[];
  notes: string[];
}

export class LlamaCompiler {
  constructor(private readonly detector = new HardwareDetector()) {}

  createPlan(profile: HardwareProfile = this.detector.detect()): LlamaCompilePlan {
    if (profile.recommendedBackend === 'cuda') {
      return {
        backend: 'cuda',
        cmakeFlags: ['-DGGML_CUDA=ON'],
        notes: ['Compile llama.cpp with CUDA support for NVIDIA GPUs.'],
      };
    }

    if (profile.recommendedBackend === 'metal') {
      return {
        backend: 'metal',
        cmakeFlags: ['-DGGML_METAL=ON'],
        notes: ['Compile llama.cpp with Metal support for Apple Silicon.'],
      };
    }

    return {
      backend: 'cpu',
      cmakeFlags: ['-DGGML_NATIVE=ON'],
      notes: ['Compile llama.cpp for optimized CPU inference.'],
    };
  }
}
