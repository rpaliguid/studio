'use server';

import { parameterOptimizationAssistant } from '@/ai/flows/parameter-optimization';

export async function optimizeParameters(data) {
  try {
    const result = await parameterOptimizationAssistant(data);
    return { success: true, data: result };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
}
